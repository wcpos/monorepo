import type { ThermalRasterImage } from '@wcpos/receipt-renderer';

export function normalizeRasterCaptureSize(input: {
	width: number;
	height: number;
	maxWidth: number;
}): { width: number; height: number } {
	const sourceWidth = Number.isFinite(input.width) ? Math.max(1, Math.floor(input.width)) : 1;
	const sourceHeight = Number.isFinite(input.height) ? Math.max(1, Math.floor(input.height)) : 1;
	const maxWidth = Number.isFinite(input.maxWidth) ? Math.max(8, Math.floor(input.maxWidth)) : 576;
	const scale = sourceWidth > maxWidth ? maxWidth / sourceWidth : 1;
	const width = Math.max(8, Math.floor(sourceWidth * scale));
	const height = Math.max(8, Math.floor(sourceHeight * scale));

	return {
		width: Math.max(8, width - (width % 8)),
		height: height + ((8 - (height % 8)) % 8),
	};
}

export async function rasterizeReceiptElement(input: {
	receiptNode: Element | null;
	maxWidth: number;
	hostDocument?: Document;
}): Promise<ThermalRasterImage> {
	if (!input.receiptNode) {
		throw new Error('Receipt preview is not ready for raster printing.');
	}

	const hostDocument = input.hostDocument ?? input.receiptNode.ownerDocument ?? document;
	await waitForFonts(hostDocument);

	const sourceRect = input.receiptNode.getBoundingClientRect();
	const sourceWidth = sourceRect.width || input.receiptNode.clientWidth || input.maxWidth;
	const sourceHeight = sourceRect.height || input.receiptNode.clientHeight || 1;
	const size = normalizeRasterCaptureSize({
		width: sourceWidth,
		height: sourceHeight,
		maxWidth: input.maxWidth,
	});
	const clone = input.receiptNode.cloneNode(true) as HTMLElement;
	inlineComputedStyles(
		input.receiptNode,
		clone,
		(hostDocument.defaultView ?? window) as Window & typeof globalThis
	);
	clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
	clone.style.margin = '0';
	clone.style.width = `${size.width}px`;
	clone.style.minWidth = `${size.width}px`;
	clone.style.maxWidth = `${size.width}px`;
	clone.style.transform = '';

	const serialized = new XMLSerializer().serializeToString(clone);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
	const image = await loadSvgAsImage(svg);
	const canvas = hostDocument.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('Unable to create canvas context for raster printing.');
	}

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
}

async function waitForFonts(hostDocument: Document): Promise<void> {
	const fonts = hostDocument.fonts as FontFaceSet | undefined;
	if (!fonts?.ready) return;
	await fonts.ready;
}

function inlineComputedStyles(
	source: Element,
	target: Element,
	view: Window & typeof globalThis
): void {
	if (source instanceof view.HTMLElement && target instanceof view.HTMLElement) {
		const computed = view.getComputedStyle(source);
		for (const property of computed) {
			target.style.setProperty(
				property,
				computed.getPropertyValue(property),
				computed.getPropertyPriority(property)
			);
		}
	}

	const sourceChildren = Array.from(source.children);
	const targetChildren = Array.from(target.children);
	sourceChildren.forEach((child, index) => {
		const targetChild = targetChildren[index];
		if (targetChild) inlineComputedStyles(child, targetChild, view);
	});
}

function loadSvgAsImage(svg: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Unable to render receipt preview as raster image.'));
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	});
}
