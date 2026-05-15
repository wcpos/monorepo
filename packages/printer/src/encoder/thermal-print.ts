import {
	encodeThermalTemplate,
	renderBarcode,
	renderQrCode,
	renderReceiptTemplate,
	thermalBarcodeImageKey,
	thermalImageAssetKey,
} from '@wcpos/receipt-renderer';
import type {
	EscposRenderOptions,
	ThermalBarcodeImages,
	ThermalImageAssets,
	ThermalRasterImage,
} from '@wcpos/receipt-renderer';

import { formatReceiptData } from './format-receipt-data';
import { mapReceiptData } from './map-receipt-data';

const SUPPORTED_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=]+$/i;
const DEFAULT_THERMAL_IMAGE_WIDTH_DOTS = 200;

export interface ThermalAssetRequests {
	images: { src: string; width?: number }[];
	barcodes: {
		kind: 'barcode' | 'qrcode';
		value: string;
		barcodeType?: string;
		height?: number;
		size?: number;
	}[];
}

export interface ThermalPrintAssets {
	imageAssets: ThermalImageAssets;
	barcodeImages: ThermalBarcodeImages;
}

export type ThermalImageSrcResolver = (src: string) => string | Promise<string>;

export interface EncodeThermalTemplateForPrintInput {
	templateXml: string;
	receiptData: unknown;
	maxWidthDots: number;
	encodeOptions?: EscposRenderOptions;
	imageSrcResolver?: ThermalImageSrcResolver;
}

export function renderTemplatePlaceholders(
	template: string,
	data: Record<string, unknown>
): string {
	return renderReceiptTemplate(template, data);
}

export function discoverThermalAssetRequests(template: string): ThermalAssetRequests {
	if (typeof DOMParser !== 'undefined') {
		const doc = new DOMParser().parseFromString(template, 'application/xml');
		if (doc.querySelector('parsererror') === null) {
			return {
				images: uniqueImages(
					Array.from(doc.querySelectorAll('image')).map((element) => ({
						src: element.getAttribute('src') ?? '',
						width: numberAttribute(element, 'width') ?? DEFAULT_THERMAL_IMAGE_WIDTH_DOTS,
					}))
				),
				barcodes: [
					...Array.from(doc.querySelectorAll('barcode')).map(barcodeRequestFromElement),
					...Array.from(doc.querySelectorAll('qrcode')).map((element) => ({
						kind: 'qrcode' as const,
						value: element.textContent?.trim() ?? '',
						size: numberAttribute(element, 'size'),
					})),
				].filter((barcode) => barcode.value),
			};
		}
	}

	return {
		images: uniqueImages(
			Array.from(template.matchAll(/<image\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)).map((match) => ({
				src: match[1] ?? '',
				width: numberFromAttributeText(match[0] ?? '', 'width') ?? DEFAULT_THERMAL_IMAGE_WIDTH_DOTS,
			}))
		),
		barcodes: [
			...Array.from(template.matchAll(/<barcode\b([^>]*)>([\s\S]*?)<\/barcode>/gi)).map((match) =>
				barcodeRequestFromText(match[1] ?? '', match[2] ?? '')
			),
			...Array.from(template.matchAll(/<qrcode\b([^>]*)>([\s\S]*?)<\/qrcode>/gi)).map((match) => ({
				kind: 'qrcode' as const,
				value: textContentFromMarkup(match[2] ?? '').trim(),
				size: numberFromAttributeText(match[1] ?? '', 'size'),
			})),
		].filter((barcode) => barcode.value),
	};
}

export async function prepareThermalPrintAssets(input: {
	renderedTemplateXml: string;
	maxWidthDots: number;
	imageSrcResolver?: ThermalImageSrcResolver;
}): Promise<ThermalPrintAssets> {
	const requests = discoverThermalAssetRequests(input.renderedTemplateXml);
	const imageAssets: ThermalImageAssets = {};
	const barcodeImages: ThermalBarcodeImages = {};

	await Promise.all(
		requests.images.map(async (image) => {
			try {
				const asset = await loadThermalLogoAsset({
					src: image.src,
					loadSrc: await resolveThermalImageLoadSrc(image.src, input.imageSrcResolver),
					requestedWidth: image.width ?? DEFAULT_THERMAL_IMAGE_WIDTH_DOTS,
					maxWidth: input.maxWidthDots,
				});
				if (asset) imageAssets[thermalImageAssetKey(image)] = asset;
			} catch {
				// Thermal image assets are optional: a missing/offline logo must not abort printing.
			}
		})
	);

	await Promise.all(
		requests.barcodes.map(async (barcode) => {
			const result = await renderThermalBarcodeAsset({
				...barcode,
				maxWidth: input.maxWidthDots,
			});
			if (result) barcodeImages[result.key] = result.asset;
		})
	);

	return { imageAssets, barcodeImages };
}

export async function encodeThermalTemplateForPrint(
	input: EncodeThermalTemplateForPrintInput
): Promise<Uint8Array> {
	const canonical = mapReceiptData((input.receiptData ?? {}) as Record<string, unknown>);
	const formatted = formatReceiptData(canonical);
	const renderedTemplateXml = renderTemplatePlaceholders(
		input.templateXml,
		formatted as Record<string, unknown>
	);
	const { imageAssets, barcodeImages } = await prepareThermalPrintAssets({
		renderedTemplateXml,
		maxWidthDots: input.maxWidthDots,
		imageSrcResolver: input.imageSrcResolver,
	});

	return encodeThermalTemplate(input.templateXml, formatted, {
		...input.encodeOptions,
		imageMode: 'raster',
		imageAssets,
		barcodeMode: 'image',
		barcodeImages,
	});
}

export function isSupportedThermalLogoSrc(src: unknown): boolean {
	if (typeof src !== 'string') return false;
	const value = src.trim();
	return (
		SUPPORTED_DATA_IMAGE_RE.test(value) ||
		/^https?:\/\//i.test(value) ||
		/^wcpos-image:\/\//i.test(value) ||
		isSafeRootRelativeImageSrc(value)
	);
}

function isSafeRootRelativeImageSrc(value: string): boolean {
	if (value.startsWith('//')) return false;
	if (value.includes('\\')) return false;
	const path = value.split(/[?#]/, 1)[0];
	const suffix = value.slice(path.length);
	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(path);
	} catch {
		return false;
	}
	if (decodedPath.includes('\\')) return false;
	const segments = decodedPath.split('/');
	if (segments.includes('..') || segments.includes('.')) return false;
	return (
		/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(path) &&
		(suffix === '' || /^[?#][A-Za-z0-9._~!$&'()*+,;=:@%/?#-]+$/.test(suffix))
	);
}

export function maxDotsForPaperWidth(paperWidth: '58mm' | '80mm' | string): number {
	if (paperWidth === '58mm') return 384;
	if (paperWidth === '80mm') return 576;
	return 576;
}

export function normalizeThermalImageSize(input: {
	width: number;
	height: number;
	maxWidth: number;
}): { width: number; height: number } {
	const scale = input.width > input.maxWidth ? input.maxWidth / input.width : 1;
	const width = Math.max(8, Math.floor(input.width * scale));
	const height = Math.max(8, Math.floor(input.height * scale));
	return {
		width: Math.max(8, width - (width % 8)),
		height: height + ((8 - (height % 8)) % 8),
	};
}

export async function loadThermalLogoAsset(input: {
	src: string;
	loadSrc?: string;
	requestedWidth: number;
	maxWidth: number;
}): Promise<ThermalRasterImage | undefined> {
	const loadSrc = input.loadSrc ?? input.src;
	if (!isSupportedThermalLogoSrc(loadSrc)) return undefined;
	try {
		const image = await loadHtmlImage(loadSrc);
		const naturalWidth = image.naturalWidth || image.width;
		const naturalHeight = image.naturalHeight || image.height;
		if (!naturalWidth || !naturalHeight) return undefined;

		const desiredWidth = Math.min(input.requestedWidth || naturalWidth, input.maxWidth);
		const size = normalizeThermalImageSize({
			width: desiredWidth,
			height: naturalHeight * (desiredWidth / naturalWidth),
			maxWidth: input.maxWidth,
		});

		const imageData = drawImageToImageData(image, size);
		if (!imageData) return undefined;

		return {
			image: imageData,
			width: size.width,
			height: size.height,
			algorithm: 'atkinson',
			threshold: 128,
		};
	} catch {
		return undefined;
	}
}

export async function renderThermalBarcodeAsset(input: {
	kind: 'barcode' | 'qrcode';
	value: string;
	barcodeType?: string;
	height?: number;
	size?: number;
	maxWidth: number;
}): Promise<{ key: string; asset: ThermalRasterImage } | undefined> {
	const text = input.value.trim();
	if (!text) return undefined;

	try {
		const markup =
			input.kind === 'qrcode'
				? renderQrCode(text, input.size ?? 4)
				: renderBarcode(input.barcodeType ?? 'code128', text, input.height ?? 40, 'barcode');
		const svg = extractSvg(markup);
		if (!svg) return undefined;

		const image = await loadHtmlImage(
			`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
		);
		const naturalWidth = image.naturalWidth || image.width;
		const naturalHeight = image.naturalHeight || image.height;
		if (!naturalWidth || !naturalHeight) return undefined;

		const size = normalizeThermalImageSize({
			width: naturalWidth,
			height: naturalHeight,
			maxWidth: input.maxWidth,
		});
		const imageData = drawImageToImageData(image, size);
		if (!imageData) return undefined;

		const key = thermalBarcodeImageKey({
			kind: input.kind,
			value: text,
			barcodeType: input.barcodeType,
			height: input.height,
			size: input.size,
		});

		return {
			key,
			asset: {
				image: imageData,
				width: size.width,
				height: size.height,
				algorithm: 'threshold',
				threshold: 128,
			},
		};
	} catch {
		return undefined;
	}
}

function drawImageToImageData(
	image: HTMLImageElement,
	size: { width: number; height: number }
): ImageData | undefined {
	const canvas = document.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext('2d');
	if (!context) return undefined;
	context.fillStyle = '#fff';
	context.fillRect(0, 0, size.width, size.height);
	context.drawImage(image, 0, 0, size.width, size.height);
	return context.getImageData(0, 0, size.width, size.height);
}

function loadHtmlImage(src: string, timeoutMs = 10000): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		const cleanup = () => {
			clearTimeout(timer);
			image.onload = null;
			image.onerror = null;
		};
		const timer = setTimeout(() => {
			cleanup();
			image.src = '';
			reject(new Error('Timed out loading thermal image asset'));
		}, timeoutMs);
		image.onload = () => {
			cleanup();
			resolve(image);
		};
		image.onerror = () => {
			cleanup();
			reject(new Error('Failed to load thermal image asset'));
		};
		if (!/^wcpos-image:\/\//i.test(src)) {
			image.crossOrigin = 'anonymous';
		}
		image.src = src;
	});
}

async function resolveThermalImageLoadSrc(
	src: string,
	resolver: ThermalImageSrcResolver | undefined
): Promise<string> {
	const resolved = resolver
		? await resolver(src)
		: isElectronRenderer() && /^https?:\/\//i.test(src)
			? toElectronImageCacheUrl(src)
			: src;

	if (!/^wcpos-image:\/\//i.test(resolved)) return resolved;
	return fetchImageAsDataUrl(resolved).catch(() => resolved);
}

function isElectronRenderer(): boolean {
	if (typeof window === 'undefined') return false;
	const electronWindow = window as Window & { electron?: unknown };
	return typeof electronWindow.electron === 'object' && !!electronWindow.electron;
}

function toElectronImageCacheUrl(url: string): string {
	const base64 = btoa(url);
	return `wcpos-image://cache/${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

async function fetchImageAsDataUrl(src: string): Promise<string> {
	if (typeof fetch !== 'function') return src;
	const response = await fetch(src);
	if (!response.ok) throw new Error('Failed to fetch thermal image asset');
	const contentTypeHeader = response.headers.get('Content-Type');
	if (contentTypeHeader == null) return src;
	const contentType = contentTypeHeader.split(';', 1)[0]?.trim().toLowerCase();
	if (!contentType || !/^image\/(?:png|jpe?g)$/.test(contentType)) return src;
	const buffer = new Uint8Array(await response.arrayBuffer());
	return `data:${contentType};base64,${uint8ArrayToBase64(buffer)}`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let index = 0; index < bytes.length; index++) {
		binary += String.fromCharCode(bytes[index] ?? 0);
	}
	return btoa(binary);
}

function extractSvg(markup: string): string | undefined {
	if (typeof DOMParser !== 'undefined') {
		const doc = new DOMParser().parseFromString(markup, 'text/html');
		const svg = doc.querySelector('svg');
		if (svg) return svg.outerHTML;
	}
	return /<svg\b[\s\S]*<\/svg>/i.exec(markup)?.[0];
}

function uniqueImages(
	images: { src: string; width?: number }[]
): { src: string; width?: number }[] {
	const seen = new Set<string>();
	return images.filter((image) => {
		const key = thermalImageAssetKey(image);
		if (!image.src || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function barcodeRequestFromElement(element: Element): ThermalAssetRequests['barcodes'][number] {
	const barcodeType = element.getAttribute('type') ?? undefined;
	const value = element.textContent?.trim() ?? '';
	if (isQrBarcodeType(barcodeType)) {
		return {
			kind: 'qrcode',
			value,
			size:
				numberAttribute(element, 'size') ??
				heightToQrSize(numberAttribute(element, 'height') ?? 40),
		};
	}
	return {
		kind: 'barcode',
		value,
		barcodeType,
		height: numberAttribute(element, 'height'),
	};
}

function barcodeRequestFromText(
	attributes: string,
	content: string
): ThermalAssetRequests['barcodes'][number] {
	const barcodeType = stringFromAttributeText(attributes, 'type');
	const value = textContentFromMarkup(content).trim();
	if (isQrBarcodeType(barcodeType)) {
		return {
			kind: 'qrcode',
			value,
			size:
				numberFromAttributeText(attributes, 'size') ??
				heightToQrSize(numberFromAttributeText(attributes, 'height') ?? 40),
		};
	}
	return {
		kind: 'barcode',
		value,
		barcodeType,
		height: numberFromAttributeText(attributes, 'height'),
	};
}

function numberAttribute(element: Element, name: string): number | undefined {
	return parsePositiveInt(element.getAttribute(name));
}

function numberFromAttributeText(text: string, name: string): number | undefined {
	const value = stringFromAttributeText(text, name);
	return parsePositiveInt(value);
}

function stringFromAttributeText(text: string, name: string): string | undefined {
	const match = new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(text);
	return match?.[1];
}

function textContentFromMarkup(value: string): string {
	let text = '';
	let index = 0;
	while (index < value.length) {
		if (value.startsWith('<!--', index)) {
			const end = value.indexOf('-->', index + 4);
			if (end === -1) break;
			index = end + 3;
			continue;
		}
		if (value.startsWith('<![CDATA[', index)) {
			const end = value.indexOf(']]>', index + 9);
			if (end === -1) {
				text += htmlSafeText(value.slice(index + 9));
				break;
			}
			text += htmlSafeText(value.slice(index + 9, end));
			index = end + 3;
			continue;
		}
		const char = value[index] ?? '';
		if (char === '<') {
			const end = value.indexOf('>', index + 1);
			if (end === -1) break;
			index = end + 1;
			continue;
		}
		text += char;
		index++;
	}
	return decodeXmlEntities(text);
}

function decodeXmlEntities(value: string): string {
	let text = '';
	let index = 0;
	while (index < value.length) {
		if (value[index] !== '&') {
			text += value[index] ?? '';
			index++;
			continue;
		}
		const end = value.indexOf(';', index + 1);
		if (end === -1) {
			text += '&';
			index++;
			continue;
		}
		const entity = value.slice(index, end + 1);
		const decoded = decodeXmlEntityBody(value.slice(index + 1, end), entity);
		text += decoded;
		index = end + 1;
	}
	return text;
}

function decodeXmlEntityBody(body: string, entity: string): string {
	const key = body.toLowerCase();
	if (key === 'amp') return '&';
	if (key === 'lt' || key === 'gt') return entity;
	if (key === 'quot') return '"';
	if (key === 'apos') return "'";
	if (key.startsWith('#x')) {
		const codePoint = Number.parseInt(key.slice(2), 16);
		return htmlSafeCodePoint(codePoint, entity);
	}
	if (key.startsWith('#')) {
		const codePoint = Number(key.slice(1));
		return htmlSafeCodePoint(codePoint, entity);
	}
	return entity;
}

function htmlSafeCodePoint(codePoint: number, entity: string): string {
	if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
	if (codePoint === 0x3c || codePoint === 0x3e) return entity;
	return String.fromCodePoint(codePoint);
}

function htmlSafeText(value: string): string {
	let text = '';
	for (let index = 0; index < value.length; index++) {
		const char = value[index] ?? '';
		if (char === '<') {
			text += '&lt;';
			continue;
		}
		if (char === '>') {
			text += '&gt;';
			continue;
		}
		text += char;
	}
	return text;
}

function isQrBarcodeType(type: string | undefined): boolean {
	const normalized = type?.trim().toLowerCase();
	return normalized === 'qrcode' || normalized === 'qr';
}

function heightToQrSize(height: number): number {
	return Number.isFinite(height) && height > 0
		? Math.max(2, Math.min(10, Math.round(height / 10)))
		: 4;
}

function parsePositiveInt(value: string | null | undefined): number | undefined {
	const trimmed = value?.trim();
	if (!trimmed || !/^[1-9]\d*$/.test(trimmed)) return undefined;
	const parsed = Number(trimmed);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}
