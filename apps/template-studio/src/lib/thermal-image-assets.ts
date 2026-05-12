import { toSVG } from 'bwip-js/browser';

import { thermalBarcodeImageKey } from '@wcpos/receipt-renderer';
import type { ThermalRasterImage } from '@wcpos/receipt-renderer';

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

		const canvas = document.createElement('canvas');
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext('2d');
		if (!context) return undefined;
		context.fillStyle = '#fff';
		context.fillRect(0, 0, size.width, size.height);
		context.drawImage(image, 0, 0, size.width, size.height);
		const imageData = context.getImageData(0, 0, size.width, size.height);

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
		const image = await loadHtmlImage(`data:image/svg+xml;base64,${btoa(svg)}`);
		const naturalWidth = image.naturalWidth || image.width;
		const naturalHeight = image.naturalHeight || image.height;
		if (!naturalWidth || !naturalHeight) return undefined;

		const size = normalizeThermalImageSize({
			width: naturalWidth,
			height: naturalHeight,
			maxWidth: input.maxWidth,
		});
		const canvas = document.createElement('canvas');
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvas.getContext('2d');
		if (!context) return undefined;
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

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Failed to load thermal image asset'));
		image.crossOrigin = 'anonymous';
		image.src = src;
	});
}
