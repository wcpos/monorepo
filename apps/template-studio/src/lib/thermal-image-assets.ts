import type { ThermalRasterImage } from '@wcpos/receipt-renderer';

import type { PaperWidth } from '../studio-core';

const SUPPORTED_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=]+$/i;

export function isSupportedThermalLogoSrc(src: unknown): boolean {
	if (typeof src !== 'string') return false;
	const value = src.trim();
	return SUPPORTED_DATA_IMAGE_RE.test(value) || /^https?:\/\//i.test(value);
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
		height: Math.max(8, height - (height % 8)),
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

		return {
			image: context.getImageData(0, 0, size.width, size.height),
			width: size.width,
			height: size.height,
			algorithm: 'atkinson',
			threshold: 128,
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
