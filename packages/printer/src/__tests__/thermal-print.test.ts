import { afterEach, describe, expect, it, vi } from 'vitest';

import { encodeThermalTemplateForPrint, prepareThermalPrintAssets } from '../encoder/thermal-print';

const ONE_PIXEL_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function mockImageAndCanvas(naturalWidth: number, naturalHeight: number): void {
	class MockImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		crossOrigin = '';
		naturalWidth = naturalWidth;
		naturalHeight = naturalHeight;
		width = naturalWidth;
		height = naturalHeight;

		set src(_value: string) {
			queueMicrotask(() => this.onload?.());
		}
	}

	vi.stubGlobal('Image', MockImage);
	const originalCreateElement = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
		const element = originalCreateElement(tagName);
		if (tagName.toLowerCase() === 'canvas') {
			Object.defineProperty(element, 'getContext', {
				value: () => ({
					fillStyle: '',
					fillRect: vi.fn(),
					drawImage: vi.fn(),
					getImageData: (_x: number, _y: number, width: number, height: number) => ({
						data: new Uint8ClampedArray(width * height * 4).fill(0xff),
						width,
						height,
					}),
				}),
			});
		}
		return element;
	}) as typeof document.createElement);
}

function countSequence(bytes: Uint8Array, sequence: readonly number[]): number {
	let count = 0;
	for (let index = 0; index <= bytes.length - sequence.length; index++) {
		if (sequence.every((byte, offset) => bytes[index + offset] === byte)) count++;
	}
	return count;
}

describe('encodeThermalTemplateForPrint', () => {
	it('matches Template Studio by rasterizing logo and barcode assets before encoding', async () => {
		mockImageAndCanvas(64, 32);

		const bytes = await encodeThermalTemplateForPrint({
			templateXml: `<receipt>
				<image src="{{store.logo}}" width="64" />
				<barcode type="code128">ABC-123</barcode>
			</receipt>`,
			receiptData: { ...baseReceiptData(), store: { logo: ONE_PIXEL_PNG } },
			maxWidthDots: 384,
			encodeOptions: { columns: 42, language: 'esc-pos' },
		});

		expect(countSequence(bytes, [0x1d, 0x76, 0x30])).toBeGreaterThanOrEqual(2);
		expect(countSequence(bytes, [0x1d, 0x6b])).toBe(0);
	});

	it('uses the renderer default 200-dot width for images without an explicit width', async () => {
		mockImageAndCanvas(400, 100);

		const { imageAssets } = await prepareThermalPrintAssets({
			renderedTemplateXml: `<receipt><image src="${ONE_PIXEL_PNG}" /></receipt>`,
			maxWidthDots: 384,
		});

		expect(Object.values(imageAssets)).toHaveLength(1);
		expect(Object.values(imageAssets)[0]?.width).toBe(200);
	});
});

function baseReceiptData() {
	return {
		order_number: '1001',
		currency: 'USD',
		lines: [],
		totals: { total: 0 },
	};
}
