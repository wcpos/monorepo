import type { ThermalRasterImage } from '@wcpos/receipt-renderer';

import { normalizeThermalImageSize } from './thermal-raster-shared';

export async function rasterizeThermalImage(input: {
	loadSrc: string;
	requestedWidth: number;
	maxWidth: number;
}): Promise<ThermalRasterImage | undefined> {
	try {
		const image = await loadHtmlImage(input.loadSrc);
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
			...size,
			algorithm: 'atkinson',
			threshold: 128,
		};
	} catch {
		return undefined;
	}
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
		if (!/^wcpos-image:\/\//i.test(src)) image.crossOrigin = 'anonymous';
		image.src = src;
	});
}
