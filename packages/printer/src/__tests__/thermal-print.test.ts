import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildDiagnosticTemplate } from '../encoder/diagnostic-template';
import {
	buildDiagnosticMarkupJob,
	discoverThermalAssetRequests,
	encodeDiagnosticTemplateForPrint,
	encodeThermalTemplateForPrint,
	maxDotsForColumns,
	maxDotsForPaperWidth,
	prepareThermalPrintAssets,
	renderThermalBarcodeAsset,
} from '../encoder/thermal-print';
import { encodeThermalTemplate } from '../renderer';
import { sampleReceiptData } from '../encoder/__tests__/fixtures';

const { debug, warn } = vi.hoisted(() => ({ debug: vi.fn(), warn: vi.fn() }));
vi.mock('../logger', () => ({ printerLogger: { debug, warn } }));

const ONE_PIXEL_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

afterEach(() => {
	delete (window as Window & { electron?: unknown }).electron;
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

function mockImageAndCanvas(
	naturalWidth: number,
	naturalHeight: number
): { loadedSrcs: string[]; crossOriginsAtLoad: string[] } {
	const loadedSrcs: string[] = [];
	const crossOriginsAtLoad: string[] = [];
	class MockImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		crossOrigin = '';
		naturalWidth = naturalWidth;
		naturalHeight = naturalHeight;
		width = naturalWidth;
		height = naturalHeight;

		set src(value: string) {
			loadedSrcs.push(value);
			crossOriginsAtLoad.push(this.crossOrigin);
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

	return { loadedSrcs, crossOriginsAtLoad };
}

function countSequence(bytes: Uint8Array, sequence: readonly number[]): number {
	let count = 0;
	for (let index = 0; index <= bytes.length - sequence.length; index++) {
		if (sequence.every((byte, offset) => bytes[index + offset] === byte)) count++;
	}
	return count;
}

describe('discoverThermalAssetRequests without a DOM (React Native)', () => {
	it('decodes attribute entities in image src values on the regex path', () => {
		const original = globalThis.DOMParser;
		// Hermes has no DOMParser; force the regex branch.
		(globalThis as { DOMParser?: unknown }).DOMParser = undefined;
		try {
			const requests = discoverThermalAssetRequests(
				'<receipt><image src="https:&#x2F;&#x2F;shop.example&#x2F;logo.jpg?a=1&amp;b=2" width="200" /></receipt>'
			);
			expect(requests.images).toEqual([
				{ src: 'https://shop.example/logo.jpg?a=1&b=2', width: 200 },
			]);
		} finally {
			(globalThis as { DOMParser?: unknown }).DOMParser = original;
		}
	});
});

describe('encodeThermalTemplateForPrint', () => {
	it('uses ISO currency text when the INR symbol would be substituted', async () => {
		const data = structuredClone(sampleReceiptData);
		data.order.currency = 'INR';
		const bytes = await encodeThermalTemplateForPrint({
			templateXml: '<receipt><text>{{totals.total_incl_display}}</text></receipt>',
			receiptData: data,
			maxWidthDots: 384,
			encodeOptions: { language: 'star-prnt' },
		});

		const text = new TextDecoder().decode(bytes);
		expect(text).toContain('INR');
		expect(text).toContain('25.00');
		expect(Array.from(bytes)).not.toContain(0x3f);
	});

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
		expect(debug).toHaveBeenCalledWith('Thermal image asset skipped', {
			context: { cause: 'Timed out loading thermal image asset' },
		});
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
		expect(debug).toHaveBeenCalledWith('Thermal barcode asset skipped', {
			context: expect.objectContaining({ fallback: 'native-barcode' }),
		});
	});

	it('logs a skipped image when its resolver fails', async () => {
		const src = 'https://example.test/logo.png?signature=secret';
		const result = await prepareThermalPrintAssets({
			renderedTemplateXml: `<receipt><image src="${src}" /></receipt>`,
			maxWidthDots: 384,
			imageSrcResolver: async () => {
				throw new Error('loader failed');
			},
		});

		expect(result.imageAssets).toEqual({});
		expect(warn).toHaveBeenCalledWith('Thermal image asset skipped', {
			context: { sourceType: 'remote-url', cause: 'loader failed' },
		});
		expect(warn).not.toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ context: expect.objectContaining({ src }) })
		);
	});

	it('loads Electron remote thermal images through canvas-safe data URLs', async () => {
		const { loadedSrcs, crossOriginsAtLoad } = mockImageAndCanvas(64, 32);
		const source = 'https://example.test/logo.png';
		const cached = 'wcpos-image://cache/aHR0cHM6Ly9leGFtcGxlLnRlc3QvbG9nby5wbmc';
		const payload = new Uint8Array([1, 2, 3]);
		(window as Window & { electron?: unknown }).electron = {};
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				expect(url).toBe(cached);
				return new Response(payload, { headers: { 'Content-Type': 'image/png' } });
			})
		);

		const { imageAssets } = await prepareThermalPrintAssets({
			renderedTemplateXml: `<receipt><image src="${source}" width="64" /></receipt>`,
			maxWidthDots: 384,
		});

		expect(fetch).toHaveBeenCalledWith(cached);
		expect(loadedSrcs).toEqual(['data:image/png;base64,AQID']);
		expect(crossOriginsAtLoad).toEqual(['anonymous']);
		expect(imageAssets[`image:64:${source}`]?.width).toBe(64);
	});

	it('applies imageSrcResolver while keeping the original asset key', async () => {
		const { loadedSrcs, crossOriginsAtLoad } = mockImageAndCanvas(64, 32);
		const source = 'https://example.test/logo.png';
		const resolved = 'https://cdn.example.test/logo.png';
		const imageSrcResolver = vi.fn(async (src: string) => {
			expect(src).toBe(source);
			return resolved;
		});

		const { imageAssets } = await prepareThermalPrintAssets({
			renderedTemplateXml: `<receipt><image src="${source}" width="64" /></receipt>`,
			maxWidthDots: 384,
			imageSrcResolver,
		});

		expect(imageSrcResolver).toHaveBeenCalledWith(source);
		expect(loadedSrcs).toEqual([resolved]);
		expect(crossOriginsAtLoad).toEqual(['anonymous']);
		expect(imageAssets[`image:64:${source}`]?.width).toBe(64);
		expect(imageAssets[`image:64:${resolved}`]).toBeUndefined();
	});

	it('falls back to loading Electron image cache URLs when fetch is unavailable', async () => {
		const { loadedSrcs, crossOriginsAtLoad } = mockImageAndCanvas(64, 32);
		const source = 'https://example.test/logo.png';
		const cached = 'wcpos-image://cache/aHR0cHM6Ly9leGFtcGxlLnRlc3QvbG9nby5wbmc';
		(window as Window & { electron?: unknown }).electron = {};
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Promise.reject(new Error('unsupported protocol')))
		);

		const { imageAssets } = await prepareThermalPrintAssets({
			renderedTemplateXml: `<receipt><image src="${source}" width="64" /></receipt>`,
			maxWidthDots: 384,
		});

		expect(loadedSrcs).toEqual([cached]);
		expect(crossOriginsAtLoad).toEqual(['']);
		expect(imageAssets[`image:64:${source}`]?.width).toBe(64);
	});

	it('falls back to Electron image cache URLs for unsupported fetched image types', async () => {
		const { loadedSrcs } = mockImageAndCanvas(64, 32);
		const source = 'https://example.test/logo.webp';
		const cached = 'wcpos-image://cache/aHR0cHM6Ly9leGFtcGxlLnRlc3QvbG9nby53ZWJw';
		(window as Window & { electron?: unknown }).electron = {};
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/webp' } })
			)
		);

		await prepareThermalPrintAssets({
			renderedTemplateXml: `<receipt><image src="${source}" width="64" /></receipt>`,
			maxWidthDots: 384,
		});

		expect(loadedSrcs).toEqual([cached]);
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

describe('logo width when the template names no paper width', () => {
	it.each([
		{ columns: 32, dots: 384 },
		{ columns: 42, dots: 576 },
		{ columns: 48, dots: 576 },
		{ columns: 64, dots: 576 },
	])('gives a $columns-column printer $dots dots', ({ columns, dots }) => {
		expect(maxDotsForColumns(columns)).toBe(dots);
	});

	it('falls back to the 80 mm width when the profile has no column count', () => {
		expect(maxDotsForColumns(undefined)).toBe(576);
	});

	it('still trusts the template when it does name a paper width', () => {
		expect(maxDotsForPaperWidth('58mm')).toBe(384);
		expect(maxDotsForPaperWidth('80mm')).toBe(576);
	});
});

describe('the printer diagnostic page', () => {
	function diagnosticInput(overrides: Record<string, unknown> = {}) {
		return {
			template: buildDiagnosticTemplate(42),
			data: { printerName: 'Front Counter', date: '21/09/2026, 14:02' },
			maxWidthDots: maxDotsForColumns(42),
			encodeOptions: { columns: 42, language: 'esc-pos' as const },
			...overrides,
		};
	}

	it('prepares a raster for the logo and for all three codes', async () => {
		mockImageAndCanvas(192, 192);

		const job = await buildDiagnosticMarkupJob(diagnosticInput());

		// The bundled WCPOS mark.
		expect(Object.keys(job.options.imageAssets ?? {})).toHaveLength(1);
		// QR code, Code 128 and EAN-13.
		expect(Object.keys(job.options.barcodeImages ?? {})).toHaveLength(3);
	});

	it('encodes every code as a raster rather than a native barcode command', async () => {
		mockImageAndCanvas(192, 192);

		const bytes = await encodeDiagnosticTemplateForPrint(diagnosticInput());

		// GS k is the printer's own barcode command — the fallback taken when no prepared
		// raster exists. Its absence is what proves the assets reached the encoder.
		expect(countSequence(bytes, [0x1d, 0x6b])).toBe(0);
		expect(countSequence(bytes, [0x1d, 0x76, 0x30])).toBeGreaterThanOrEqual(4);
	});

	it('prints nothing for the logo when the template is encoded without asset preparation', async () => {
		mockImageAndCanvas(192, 192);

		// The path `testPrint` used to take. Guards the actual regression: an <image> with
		// no prepared asset is skipped silently, so the page printed with a blank logo and
		// no error anywhere. If this ever stops differing from the case above, the fix has
		// been undone.
		const unprepared = encodeThermalTemplate(
			buildDiagnosticTemplate(42),
			{ printerName: 'Front Counter', date: '21/09/2026, 14:02' },
			{ columns: 42, language: 'esc-pos' }
		);

		expect(countSequence(unprepared, [0x1d, 0x76, 0x30])).toBe(0);
	});

	it('keeps the printer name and date, which receipt canonicalisation would discard', async () => {
		mockImageAndCanvas(192, 192);

		const bytes = await encodeDiagnosticTemplateForPrint(diagnosticInput());

		const text = new TextDecoder().decode(bytes);
		expect(text).toContain('Front Counter');
		expect(text).toContain('21/09/2026');
	});

	it('forwards the profile code page, so the character section tests what is configured', async () => {
		mockImageAndCanvas(192, 192);

		const job = await buildDiagnosticMarkupJob(diagnosticInput({ codePage: 'cp858' }));

		expect(job.options.codePage).toBe('cp858');
	});

	it('forces Font A, which is what the column ruler claims to measure', async () => {
		mockImageAndCanvas(192, 192);

		const bytes = await encodeDiagnosticTemplateForPrint(diagnosticInput());

		expect(countSequence(bytes, [0x1b, 0x4d, 0x00])).toBeGreaterThanOrEqual(1);
	});

	it('sizes the logo to narrow paper when the profile says 32 columns', async () => {
		mockImageAndCanvas(800, 800);

		const job = await buildDiagnosticMarkupJob(
			diagnosticInput({
				template: buildDiagnosticTemplate(32),
				maxWidthDots: maxDotsForColumns(32),
				encodeOptions: { columns: 32, language: 'esc-pos' as const },
			})
		);

		const [logo] = Object.values(job.options.imageAssets ?? {});
		expect(logo).toBeDefined();
		// 58 mm paper prints 384 dots; 576 would crop the mark off the edge.
		expect(logo?.width).toBeLessThanOrEqual(384);
	});
});
