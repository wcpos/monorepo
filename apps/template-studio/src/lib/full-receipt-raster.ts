import type { ThermalRasterImage } from '@wcpos/receipt-renderer';

import { debugError, debugInfo, debugLog, debugWarn } from './debug-log';

export function normalizeRasterCaptureSize(input: {
	width: number;
	height: number;
	maxWidth: number;
}): { sourceWidth: number; sourceHeight: number; width: number; height: number } {
	const sourceWidth = Number.isFinite(input.width) ? Math.max(1, Math.floor(input.width)) : 1;
	const sourceHeight = Number.isFinite(input.height) ? Math.max(1, Math.floor(input.height)) : 1;
	const maxWidth = Number.isFinite(input.maxWidth) ? Math.max(8, Math.floor(input.maxWidth)) : 576;
	const targetWidth = Math.max(8, maxWidth - (maxWidth % 8));
	// Always scale the CSS preview geometry, including upward, so the final
	// raster fills the printer dot budget without changing preview layout.
	const scale = targetWidth / sourceWidth;
	const targetHeight = Math.max(8, Math.floor(sourceHeight * scale));

	return {
		sourceWidth,
		sourceHeight,
		width: targetWidth,
		height: targetHeight + ((8 - (targetHeight % 8)) % 8),
	};
}

export function stripThermalControlNodesForRaster(template: string): string {
	const parser = typeof DOMParser === 'undefined' ? null : new DOMParser();
	if (!parser) return stripTrailingThermalControlNodesFallback(template);

	const document = parser.parseFromString(template, 'application/xml');
	if (document.querySelector('parsererror')) {
		return stripTrailingThermalControlNodesFallback(template);
	}

	const receipt = document.documentElement;
	if (receipt.nodeName.toLowerCase() !== 'receipt') {
		return stripTrailingThermalControlNodesFallback(template);
	}

	while (receipt.lastElementChild && isThermalControlElement(receipt.lastElementChild)) {
		receipt.lastElementChild.remove();
	}

	return new XMLSerializer().serializeToString(receipt);
}

export async function rasterizeReceiptElement(input: {
	receiptNode: Element | null;
	maxWidth: number;
	hostDocument?: Document;
}): Promise<ThermalRasterImage> {
	if (!input.receiptNode) {
		debugError('full-receipt-raster', 'receipt node missing before rasterization');
		throw new Error('Receipt preview is not ready for raster printing.');
	}

	const hostDocument = input.hostDocument ?? input.receiptNode.ownerDocument ?? document;
	debugInfo('full-receipt-raster', 'rasterization started', {
		maxWidth: input.maxWidth,
		baseURI: hostDocument.baseURI,
	});
	await waitForFonts(hostDocument);
	await waitForImages(input.receiptNode);

	const sourceRect = input.receiptNode.getBoundingClientRect();
	const sourceWidth = input.receiptNode.clientWidth || sourceRect.width || input.maxWidth;
	const sourceHeight = input.receiptNode.clientHeight || sourceRect.height || 1;
	const size = normalizeRasterCaptureSize({
		width: sourceWidth,
		height: sourceHeight,
		maxWidth: input.maxWidth,
	});
	debugLog('full-receipt-raster', 'measured receipt preview', {
		clientWidth: input.receiptNode.clientWidth,
		clientHeight: input.receiptNode.clientHeight,
		rectWidth: sourceRect.width,
		rectHeight: sourceRect.height,
		sourceWidth,
		sourceHeight,
		targetWidth: size.width,
		targetHeight: size.height,
	});
	const clone = input.receiptNode.cloneNode(true) as HTMLElement;
	inlineComputedStyles(
		input.receiptNode,
		clone,
		(hostDocument.defaultView ?? window) as Window & typeof globalThis
	);
	clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
	clone.style.margin = '0';
	clone.style.width = `${size.sourceWidth}px`;
	clone.style.minWidth = `${size.sourceWidth}px`;
	clone.style.maxWidth = `${size.sourceWidth}px`;
	clone.style.transform = '';
	debugLog('full-receipt-raster', 'cloned and styled receipt DOM', {
		elementCount: clone.querySelectorAll('*').length,
		imageCount: clone.querySelectorAll('img').length,
	});
	await inlineImageSourcesForRaster(clone, hostDocument);

	const serialized = new XMLSerializer().serializeToString(clone);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.sourceWidth} ${size.sourceHeight}" preserveAspectRatio="xMinYMin meet"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
	debugLog('full-receipt-raster', 'serialized raster SVG', {
		serializedLength: serialized.length,
		svgLength: svg.length,
	});
	const image = await loadSvgAsImage(svg);
	const canvas = hostDocument.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext('2d');
	if (!context) {
		debugError('full-receipt-raster', 'canvas context unavailable', {
			width: size.width,
			height: size.height,
		});
		throw new Error('Unable to create canvas context for raster printing.');
	}

	context.fillStyle = '#fff';
	context.fillRect(0, 0, size.width, size.height);
	context.drawImage(image, 0, 0, size.width, size.height);
	const imageData = context.getImageData(0, 0, size.width, size.height);
	debugInfo('full-receipt-raster', 'raster image data captured', {
		width: size.width,
		height: size.height,
		pixelDataLength: imageData.data?.length,
		algorithm: 'atkinson',
		threshold: 128,
	});

	return {
		image: imageData,
		width: size.width,
		height: size.height,
		algorithm: 'atkinson',
		threshold: 128,
	};
}

export async function inlineImageSourcesForRaster(
	container: Element,
	hostDocument: Document
): Promise<void> {
	const images = Array.from(container.querySelectorAll('img[src]'));
	debugLog('full-receipt-raster', 'inlining image sources for SVG serialization', {
		imageCount: images.length,
	});
	await Promise.all(
		images.map(async (image, index) => {
			const src = image.getAttribute('src')?.trim();
			if (!src) {
				debugWarn('full-receipt-raster', 'image has empty src', { index });
				return;
			}
			if (isInlineImageSource(src)) {
				debugLog('full-receipt-raster', 'image source already inline', {
					index,
					scheme: src.slice(0, src.indexOf(':')),
					length: src.length,
				});
				return;
			}

			const dataUrl = await fetchImageAsDataUrl(src, hostDocument);
			if (dataUrl) {
				image.setAttribute('src', dataUrl);
				debugInfo('full-receipt-raster', 'image source inlined', {
					index,
					src,
					dataUrlLength: dataUrl.length,
				});
			} else {
				debugWarn('full-receipt-raster', 'image source could not be inlined', { index, src });
			}
		})
	);
}

function isInlineImageSource(src: string): boolean {
	return /^(?:data|blob):/i.test(src);
}

async function fetchImageAsDataUrl(
	src: string,
	hostDocument: Document
): Promise<string | undefined> {
	try {
		const url = new URL(src, hostDocument.baseURI);
		const hostUrl = new URL(hostDocument.baseURI);
		if (!/^https?:$/i.test(url.protocol) || url.origin !== hostUrl.origin) return undefined;
		const urlString = url.toString();

		debugLog('full-receipt-raster', 'fetching image for inline raster source', {
			src,
			url: urlString,
		});
		const response = await fetch(urlString, { credentials: 'same-origin' });
		debugLog('full-receipt-raster', 'image fetch completed', {
			src,
			url: urlString,
			status: response.status,
			ok: response.ok,
			contentType: response.headers.get('content-type'),
		});
		if (!response.ok) return undefined;
		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.toLowerCase().startsWith('image/')) {
			debugWarn('full-receipt-raster', 'image fetch returned non-image content', {
				src,
				url: urlString,
				contentType,
			});
			return undefined;
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		debugLog('full-receipt-raster', 'image fetch body read', {
			src,
			url: urlString,
			byteLength: bytes.byteLength,
		});
		return `data:${contentType};base64,${bytesToBase64(bytes)}`;
	} catch (error) {
		debugError('full-receipt-raster', 'image fetch failed', {
			src,
			error: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function stripTrailingThermalControlNodesFallback(template: string): string {
	let next = template;
	let previous: string;
	do {
		previous = next;
		next = next.replace(/\s*<(cut|feed|drawer)\b[^>]*(?:\/>|>\s*<\/\1>)\s*(?=<\/receipt>)/i, '');
	} while (next !== previous);
	return next;
}

function isThermalControlElement(element: Element): boolean {
	const name = element.nodeName.toLowerCase();
	return name === 'cut' || name === 'feed' || name === 'drawer';
}

async function waitForFonts(hostDocument: Document): Promise<void> {
	const fonts = hostDocument.fonts as FontFaceSet | undefined;
	if (!fonts?.ready) {
		debugLog('full-receipt-raster', 'font readiness API unavailable');
		return;
	}
	debugLog('full-receipt-raster', 'waiting for fonts');
	await fonts.ready;
	debugLog('full-receipt-raster', 'fonts ready');
}

function waitForImages(receiptNode: Element): Promise<void> {
	const images = Array.from(receiptNode.querySelectorAll('img'));
	const pendingImages = images.filter((image) => !image.complete);
	debugLog('full-receipt-raster', 'checking preview images before rasterization', {
		pendingImageCount: pendingImages.length,
		totalImageCount: images.length,
	});
	if (pendingImages.length === 0) return Promise.resolve();

	return Promise.all(
		pendingImages.map(
			(image, index) =>
				new Promise<void>((resolve) => {
					let settled = false;
					const finish = (loaded: boolean) => {
						if (settled) return;
						settled = true;
						if (loaded) {
							debugLog('full-receipt-raster', 'preview image loaded', {
								index,
								src: image.currentSrc || image.src,
								naturalWidth: image.naturalWidth,
								naturalHeight: image.naturalHeight,
							});
						} else {
							debugWarn('full-receipt-raster', 'preview image failed before rasterization', {
								index,
								src: image.currentSrc || image.src,
							});
						}
						resolve();
					};
					if (image.complete) {
						finish(image.naturalWidth > 0 || image.naturalHeight > 0);
						return;
					}
					image.addEventListener(
						'load',
						() => {
							finish(true);
						},
						{ once: true }
					);
					image.addEventListener(
						'error',
						() => {
							finish(false);
						},
						{ once: true }
					);
					if (image.complete) finish(image.naturalWidth > 0 || image.naturalHeight > 0);
				})
		)
	).then(() => undefined);
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
		image.onload = () => {
			debugInfo('full-receipt-raster', 'SVG loaded as image', {
				naturalWidth: image.naturalWidth,
				naturalHeight: image.naturalHeight,
			});
			resolve(image);
		};
		image.onerror = () => {
			debugError('full-receipt-raster', 'SVG image load failed', { svgLength: svg.length });
			reject(new Error('Unable to render receipt preview as raster image.'));
		};
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	});
}
