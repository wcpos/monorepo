import { describe, expect, it, vi } from 'vitest';

import {
	normalizeRasterCaptureSize,
	rasterizeReceiptElement,
	stripThermalControlNodesForRaster,
} from './full-receipt-raster';

describe('full receipt raster helpers', () => {
	it('scales receipt capture width to the printer dot budget and pads height', () => {
		expect(normalizeRasterCaptureSize({ width: 720, height: 125, maxWidth: 576 })).toEqual({
			sourceWidth: 720,
			sourceHeight: 125,
			width: 576,
			height: 104,
		});
	});

	it('upscales browser CSS paper width to the printer dot budget', () => {
		expect(normalizeRasterCaptureSize({ width: 302, height: 900, maxWidth: 576 })).toEqual({
			sourceWidth: 302,
			sourceHeight: 900,
			width: 576,
			height: 1720,
		});
	});

	it('rejects when the receipt preview node is missing', async () => {
		await expect(rasterizeReceiptElement({ receiptNode: null, maxWidth: 576 })).rejects.toThrow(
			'Receipt preview is not ready for raster printing.'
		);
	});

	it('anchors padded SVG scaling at the receipt origin', async () => {
		const receipt = document.createElement('div');
		Object.defineProperties(receipt, { clientWidth: { value: 302 }, clientHeight: { value: 900 } });

		let imageSrc = '';
		class MockImage {
			onload: (() => void) | null = null;

			set src(value: string) {
				imageSrc = value;
				queueMicrotask(() => this.onload?.());
			}
		}

		vi.stubGlobal('Image', MockImage);
		vi.spyOn(window, 'getComputedStyle').mockReturnValue({
			[Symbol.iterator]: () => ['width'][Symbol.iterator](),
			getPropertyValue: () => '302px',
			getPropertyPriority: () => '',
		} as unknown as CSSStyleDeclaration);

		const context = {
			fillStyle: '',
			fillRect: vi.fn(),
			drawImage: vi.fn(),
			getImageData: () => ({}) as ImageData,
		};
		const createElement = document.createElement.bind(document);
		vi.spyOn(document, 'createElement').mockImplementation(((
			tagName: string,
			options?: ElementCreationOptions
		) => {
			if (tagName === 'canvas') {
				return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
			}
			return createElement(tagName, options);
		}) as typeof document.createElement);

		await rasterizeReceiptElement({ receiptNode: receipt, maxWidth: 576, hostDocument: document });

		const svgMarkup = decodeURIComponent(imageSrc.slice(imageSrc.indexOf(',') + 1));
		const svg = new DOMParser().parseFromString(svgMarkup, 'text/html').querySelector('svg');
		expect(svg?.getAttribute('viewBox')).toBe('0 0 302 900');
		expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMinYMin meet');
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('strips only trailing thermal control nodes from full-receipt raster captures', () => {
		expect(
			stripThermalControlNodesForRaster(
				'<receipt><text>Before</text><feed lines="2" /><text>After</text><feed lines="1" /><cut type="full"></cut><drawer /></receipt>'
			)
		).toBe('<receipt><text>Before</text><feed lines="2"/><text>After</text></receipt>');
	});
});
