import { toSVG } from 'bwip-js/browser';

import { thermalBarcodeImageKey } from '@wcpos/receipt-renderer';
import type { ThermalRasterImage } from '@wcpos/receipt-renderer';

import { debugError, debugInfo, debugLog, debugWarn } from './debug-log';

import type { PaperWidth } from '../studio-core';

const SUPPORTED_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=]+$/i;

export function isSupportedThermalLogoSrc(src: unknown): boolean {
	if (typeof src !== 'string') return false;
	const value = src.trim();
	return (
		SUPPORTED_DATA_IMAGE_RE.test(value) ||
		/^https?:\/\//i.test(value) ||
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

export function maxDotsForPaperWidth(paperWidth: PaperWidth): number {
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
	const src = summarizeImageSrc(input.src);
	debugLog('thermal-image-assets', 'loading thermal logo asset', {
		src,
		requestedWidth: input.requestedWidth,
		maxWidth: input.maxWidth,
	});
	if (!isSupportedThermalLogoSrc(input.src)) {
		debugWarn('thermal-image-assets', 'rejected unsupported logo src', { src });
		return undefined;
	}
	try {
		const image = await loadHtmlImage(input.src);
		const naturalWidth = image.naturalWidth || image.width;
		const naturalHeight = image.naturalHeight || image.height;
		debugLog('thermal-image-assets', 'logo image loaded', {
			src,
			naturalWidth,
			naturalHeight,
		});
		if (!naturalWidth || !naturalHeight) {
			debugWarn('thermal-image-assets', 'logo image has no dimensions', { src });
			return undefined;
		}

		const desiredWidth = Math.min(input.requestedWidth || naturalWidth, input.maxWidth);
		const size = normalizeThermalImageSize({
			width: desiredWidth,
			height: naturalHeight * (desiredWidth / naturalWidth),
			maxWidth: input.maxWidth,
		});

		const canvas = document.createElement('canvas');
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext('2d');
		if (!context) {
			debugError('thermal-image-assets', 'logo canvas context unavailable', {
				src,
				width: size.width,
				height: size.height,
			});
			return undefined;
		}
		context.fillStyle = '#fff';
		context.fillRect(0, 0, size.width, size.height);
		context.drawImage(image, 0, 0, size.width, size.height);
		const imageData = context.getImageData(0, 0, size.width, size.height);
		debugInfo('thermal-image-assets', 'logo raster asset ready', {
			src,
			desiredWidth,
			width: size.width,
			height: size.height,
			pixelDataLength: imageData.data?.length,
		});

		return {
			image: imageData,
			width: size.width,
			height: size.height,
			algorithm: 'atkinson',
			threshold: 128,
		};
	} catch (error) {
		debugError('thermal-image-assets', 'logo raster asset failed', {
			src,
			error: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

function summarizeImageSrc(src: string): {
	sourceKind: 'data-url' | 'http-url' | 'root-relative-url' | 'other';
	sourceLength: number;
	hasQuery: boolean;
	mime?: string;
} {
	if (src.startsWith('data:')) {
		const mimeEnd = src.indexOf(';');
		return {
			sourceKind: 'data-url',
			sourceLength: src.length,
			hasQuery: false,
			mime: mimeEnd > 5 ? src.slice(5, mimeEnd) : undefined,
		};
	}
	if (/^https?:/i.test(src)) {
		try {
			return {
				sourceKind: 'http-url',
				sourceLength: src.length,
				hasQuery: Boolean(new URL(src).search),
			};
		} catch {
			return { sourceKind: 'http-url', sourceLength: src.length, hasQuery: src.includes('?') };
		}
	}
	return {
		sourceKind: src.startsWith('/') ? 'root-relative-url' : 'other',
		sourceLength: src.length,
		hasQuery: src.includes('?'),
	};
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
	debugLog('thermal-image-assets', 'rendering thermal barcode asset', {
		kind: input.kind,
		valueLength: text.length,
		barcodeType: input.barcodeType,
		height: input.height,
		size: input.size,
		maxWidth: input.maxWidth,
	});
	if (!text) {
		debugWarn('thermal-image-assets', 'skipped empty barcode value', { kind: input.kind });
		return undefined;
	}

	try {
		const svg = toSVG(
			input.kind === 'qrcode'
				? { bcid: 'qrcode', text, scale: Math.max(1, input.size ?? 4) }
				: {
						bcid: (input.barcodeType ?? 'code128').toLowerCase(),
						text,
						height: Math.max(1, input.height ?? 40) / 10,
						scale: 2,
						includetext: true,
						textsize: 10,
					}
		);
		debugLog('thermal-image-assets', 'barcode SVG rendered', {
			kind: input.kind,
			svgLength: svg.length,
		});
		const image = await loadHtmlImage(`data:image/svg+xml;base64,${btoa(svg)}`);
		const naturalWidth = image.naturalWidth || image.width;
		const naturalHeight = image.naturalHeight || image.height;
		if (!naturalWidth || !naturalHeight) {
			debugWarn('thermal-image-assets', 'barcode image has no dimensions', {
				kind: input.kind,
			});
			return undefined;
		}

		const size = normalizeThermalImageSize({
			width: naturalWidth,
			height: naturalHeight,
			maxWidth: input.maxWidth,
		});
		const canvas = document.createElement('canvas');
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext('2d');
		if (!context) {
			debugError('thermal-image-assets', 'barcode canvas context unavailable', {
				kind: input.kind,
				width: size.width,
				height: size.height,
			});
			return undefined;
		}
		context.fillStyle = '#fff';
		context.fillRect(0, 0, size.width, size.height);
		context.drawImage(image, 0, 0, size.width, size.height);
		const imageData = context.getImageData(0, 0, size.width, size.height);
		const key = thermalBarcodeImageKey({
			kind: input.kind,
			value: text,
			barcodeType: input.barcodeType,
			height: input.height,
			size: input.size,
		});
		debugInfo('thermal-image-assets', 'barcode raster asset ready', {
			kind: input.kind,
			key,
			naturalWidth,
			naturalHeight,
			width: size.width,
			height: size.height,
			pixelDataLength: imageData.data?.length,
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
	} catch (error) {
		debugError('thermal-image-assets', 'barcode raster asset failed', {
			kind: input.kind,
			error: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => {
			debugLog('thermal-image-assets', 'HTML image loaded', {
				srcLength: src.length,
				naturalWidth: image.naturalWidth,
				naturalHeight: image.naturalHeight,
			});
			resolve(image);
		};
		image.onerror = () => {
			debugError('thermal-image-assets', 'HTML image load failed', { srcLength: src.length });
			reject(new Error('Failed to load thermal image asset'));
		};
		image.crossOrigin = 'anonymous';
		image.src = src;
	});
}
