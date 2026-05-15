import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	discoverThermalAssetRequests,
	encodeThermalTemplateForPrint,
	prepareThermalPrintAssets,
	renderThermalBarcodeAsset,
} from '../encoder/thermal-print';

const ONE_PIXEL_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

afterEach(() => {
	vi.useRealTimers();
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

	it('does not block asset preparation indefinitely when an image stalls', async () => {
		vi.useFakeTimers();

		class StalledImage {
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			crossOrigin = '';

			set src(_value: string) {}
		}

		vi.stubGlobal('Image', StalledImage);
		const assets = prepareThermalPrintAssets({
			renderedTemplateXml: `<receipt><image src="${ONE_PIXEL_PNG}" /></receipt>`,
			maxWidthDots: 384,
		});

		await vi.advanceTimersByTimeAsync(10000);

		await expect(assets).resolves.toEqual({ imageAssets: {}, barcodeImages: {} });
	});

	it('loads rendered SVG barcode assets through a URL-encoded data URI', async () => {
		let requestedSrc = '';

		class ErrorImage {
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			crossOrigin = '';

			set src(value: string) {
				requestedSrc = value;
				queueMicrotask(() => this.onerror?.());
			}
		}

		vi.stubGlobal('Image', ErrorImage);

		await renderThermalBarcodeAsset({
			kind: 'qrcode',
			value: 'AéB',
			size: 4,
			maxWidth: 384,
		});

		expect(requestedSrc).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
		expect(decodeURIComponent(requestedSrc.split(',', 2)[1] ?? '')).toContain('<svg');
	});
});

describe('discoverThermalAssetRequests', () => {
	it('respects explicit QR size on barcode elements', () => {
		const domRequests = discoverThermalAssetRequests(
			'<receipt><barcode type="qrcode" size="7" height="20">DOM</barcode></receipt>'
		);

		vi.stubGlobal('DOMParser', undefined);
		const textRequests = discoverThermalAssetRequests(
			'<receipt><barcode type="qrcode" size="6" height="20">TEXT</barcode></receipt>'
		);

		expect(domRequests.barcodes[0]).toMatchObject({ kind: 'qrcode', value: 'DOM', size: 7 });
		expect(textRequests.barcodes[0]).toMatchObject({ kind: 'qrcode', value: 'TEXT', size: 6 });
	});

	it('extracts barcode text without constructing HTML from markup content', () => {
		vi.stubGlobal('DOMParser', undefined);

		const requests = discoverThermalAssetRequests(`<receipt>
			<barcode type="code128"><span data-label="ignored">A&amp;B</span></barcode>
			<qrcode><img src=x onerror=alert(1)>SAFE</img></qrcode>
			<qrcode><![CDATA[A<B]]><!--ignored--></qrcode>
		</receipt>`);

		expect(requests.barcodes).toMatchObject([
			{ kind: 'barcode', value: 'A&B', barcodeType: 'code128' },
			{ kind: 'qrcode', value: 'SAFE' },
			{ kind: 'qrcode', value: 'A&lt;B' },
		]);
	});

	it('keeps fallback barcode text safe for SVG rendering', () => {
		vi.stubGlobal('DOMParser', undefined);

		const requests = discoverThermalAssetRequests(`<receipt>
			<barcode type="code128"><![CDATA[<script>alert(1)</script>]]></barcode>
			<qrcode>&lt;!--still text--&gt;</qrcode>
			<qrcode>&#60;script&#62;</qrcode>
		</receipt>`);

		expect(requests.barcodes).toMatchObject([
			{ kind: 'barcode', value: '&lt;script&gt;alert(1)&lt;/script&gt;' },
			{ kind: 'qrcode', value: '&lt;!--still text--&gt;' },
			{ kind: 'qrcode', value: '&#60;script&#62;' },
		]);
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
