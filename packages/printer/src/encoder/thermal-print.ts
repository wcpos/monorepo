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

export interface EncodeThermalTemplateForPrintInput {
	templateXml: string;
	receiptData: unknown;
	maxWidthDots: number;
	encodeOptions?: EscposRenderOptions;
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
}): Promise<ThermalPrintAssets> {
	const requests = discoverThermalAssetRequests(input.renderedTemplateXml);
	const imageAssets: ThermalImageAssets = {};
	const barcodeImages: ThermalBarcodeImages = {};

	await Promise.all(
		requests.images.map(async (image) => {
			const asset = await loadThermalLogoAsset({
				src: image.src,
				requestedWidth: image.width ?? DEFAULT_THERMAL_IMAGE_WIDTH_DOTS,
				maxWidth: input.maxWidthDots,
			});
			if (asset) imageAssets[thermalImageAssetKey(image)] = asset;
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
	requestedWidth: number;
	maxWidth: number;
}): Promise<ThermalRasterImage | undefined> {
	if (!isSupportedThermalLogoSrc(input.src)) return undefined;
	try {
		const image = await loadHtmlImage(input.src);
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

		const image = await loadHtmlImage(`data:image/svg+xml;base64,${btoa(svg)}`);
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

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Failed to load thermal image asset'));
		image.crossOrigin = 'anonymous';
		image.src = src;
	});
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
			size: heightToQrSize(numberAttribute(element, 'height') ?? 40),
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
			size: heightToQrSize(numberFromAttributeText(attributes, 'height') ?? 40),
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
	if (!/[<>]/.test(value)) return value;
	if (typeof DOMParser !== 'undefined') {
		const doc = new DOMParser().parseFromString(`<root>${value}</root>`, 'application/xml');
		if (doc.querySelector('parsererror') === null) {
			return doc.documentElement.textContent ?? '';
		}
	}
	return value.replaceAll('<', '').replaceAll('>', '');
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
