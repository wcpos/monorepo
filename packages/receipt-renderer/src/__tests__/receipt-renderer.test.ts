import { describe, expect, it } from 'vitest';

import {
	encodeThermalTemplate,
	parseXml,
	renderEscpos,
	renderHtml,
	renderLogiclessTemplate,
	renderThermalPreview,
	sanitizeHtml,
} from '../index';

const THERMAL_TEMPLATE = `<receipt paper-width="32">
  <align mode="center"><bold>{{store.name}}</bold></align>
  <line />
  {{#lines}}
  <row><col width="*">{{name}}</col><col width="10" align="right">{{total}}</col></row>
  {{/lines}}
  <cut />
</receipt>`;

const data = {
	store: { name: 'My Test Store' },
	lines: [
		{ name: 'Widget A', total: '$10.00' },
		{ name: 'Gadget B', total: '$15.00' },
	],
};

function includesSequence(bytes: Uint8Array, sequence: number[]): boolean {
	return Array.from(bytes).some((_, index, all) =>
		sequence.every((value, offset) => all[index + offset] === value)
	);
}

function opaqueBlackImageData(width: number, height: number): ImageData {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let offset = 0; offset < data.length; offset += 4) {
		data[offset] = 0;
		data[offset + 1] = 0;
		data[offset + 2] = 0;
		data[offset + 3] = 255;
	}
	return { width, height, data } as ImageData;
}

describe('@wcpos/receipt-renderer exports', () => {
	it('renders sanitized logicless HTML with Mustache data', () => {
		const html = renderLogiclessTemplate(
			'<main><h1>{{store.name}}</h1><img src="x" onerror="alert(1)"><script>alert(1)</script></main>',
			data
		);

		expect(html).toContain('<h1>My Test Store</h1>');
		expect(html).not.toContain('<script');
		expect(html).not.toContain('onerror');
	});

	it('sanitizes javascript URLs and event handlers from arbitrary HTML', () => {
		const html = sanitizeHtml('<a href="javascript:alert(1)" onclick="alert(2)">Pay</a>');

		expect(html).toContain('Pay');
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('onclick');
	});

	it('sanitizes obfuscated unsafe URL protocols in DOMParser fallback mode', () => {
		const originalWindow = globalThis.window;
		const originalDocument = globalThis.document;
		const originalDOMParser = globalThis.DOMParser;
		if (!originalDOMParser) {
			throw new Error('DOMParser is required for this test');
		}

		try {
			Reflect.deleteProperty(globalThis, 'window');
			Reflect.deleteProperty(globalThis, 'document');
			globalThis.DOMParser = originalDOMParser;

			const html = sanitizeHtml(
				'<form action="java\nscript:alert(1)"><button formaction="vbscript:msgbox(1)">Pay</button><img src="data:image/png;base64,abcd" /></form>'
			);

			expect(html).toContain('<form><button>Pay</button><img></form>');
			expect(html).not.toContain('action=');
			expect(html).not.toContain('formaction=');
			expect(html).not.toContain('data:');
		} finally {
			globalThis.window = originalWindow;
			globalThis.document = originalDocument;
			globalThis.DOMParser = originalDOMParser;
		}
	});

	it('parses thermal XML and renders HTML previews', () => {
		const ast = parseXml('<receipt paper-width="32"><text>Hello</text></receipt>');
		const html = renderHtml(ast);

		expect(ast.paperWidth).toBe(32);
		expect(html).toContain('width: 32ch');
		expect(html).toContain('<div>Hello</div>');
	});

	it('falls back to defaults when numeric XML attributes are invalid', () => {
		const ast = parseXml(
			'<receipt paper-width="12px"><feed lines="3.5" /><qrcode size="1e3">code</qrcode></receipt>'
		);
		const html = renderHtml(ast);

		expect(ast.paperWidth).toBe(48);
		expect(html).toContain('width: 48ch');
		expect(html).toContain('height: 1.4em');
		expect(html).toContain('data-barcode-kind="qrcode"');
	});

	it('renders thermal templates through Mustache, XML AST, and sanitized HTML', () => {
		const html = renderThermalPreview(THERMAL_TEMPLATE, data);

		expect(html).toContain('My Test Store');
		expect(html).toContain('Widget A');
		expect(html).toContain('$15.00');
		expect(html).toContain('✂');
	});

	it('renders barcode and QR preview images with the barcode library', () => {
		const html = renderThermalPreview(
			'<receipt><barcode type="code128">ABC-123</barcode><qrcode>https://example.test/receipt/1001</qrcode></receipt>',
			{}
		);

		expect(html).toContain('<svg');
		expect(html).toContain('data-barcode-kind="barcode"');
		expect(html).toContain('data-barcode-kind="qrcode"');
		expect(html).toMatch(/data-barcode-kind="qrcode"[\s\S]*<svg viewBox="0 0 (\d+) \1"/);
		expect(html).toContain('data-barcode-value="ABC-123"');
		expect(html).toContain('stroke=');
		expect(html).toContain('stroke-width=');
		expect(html).toContain('ABC-123');
		expect(html).not.toContain('repeating-linear-gradient');
		expect(html).not.toContain('>QR<');
	});

	it('renders a helpful error when barcode data is invalid for the selected type', () => {
		const html = renderThermalPreview(
			'<receipt><barcode type="ean13">ABC-123</barcode></receipt>',
			{}
		);

		expect(html).toContain('data-barcode-error="true"');
		expect(html).toContain('Barcode error');
		expect(html).toContain('Invalid ean13 barcode value');
		expect(html).toContain('ABC-123');
		expect(html).not.toContain('<svg');
	});

	it('resolves <barcode> elements inside logicless HTML templates to inline SVG', () => {
		const html = renderLogiclessTemplate(
			'<div><barcode type="code128" height="40">{{order.number}}</barcode></div>',
			{ order: { number: 'ABC-123' } }
		);

		expect(html).toContain('data-barcode-kind="barcode"');
		expect(html).toContain('data-barcode-value="ABC-123"');
		expect(html).toContain('<svg');
		// The original <barcode> tag must be removed by the resolver.
		expect(html).not.toContain('<barcode');
	});

	it('resolves <qrcode> elements inside logicless HTML templates', () => {
		const html = renderLogiclessTemplate('<div><qrcode size="4">{{payload}}</qrcode></div>', {
			payload: 'wcpos://receipt/1001',
		});

		expect(html).toContain('data-barcode-kind="qrcode"');
		expect(html).toContain('data-barcode-value="wcpos://receipt/1001"');
		expect(html).toContain('<svg');
		expect(html).not.toContain('<qrcode');
	});

	it('keeps existing logicless XSS protection when barcodes are absent', () => {
		const html = renderLogiclessTemplate(
			'<main><h1>{{store.name}}</h1><script>alert(1)</script></main>',
			data
		);

		expect(html).toContain('<h1>My Test Store</h1>');
		expect(html).not.toContain('<script');
	});

	it('rejects unsafe image data URIs in HTML rendering', () => {
		const ast = parseXml(
			'<receipt><image src="data:image/svg+xml,&lt;svg onload=alert(1)&gt;" width="200" /></receipt>'
		);
		const html = renderHtml(ast);

		expect(html).not.toContain('<img');
	});

	it('prints resolved image assets as ESC/POS raster images when imageMode is raster', () => {
		const ast = parseXml('<receipt><image src="logo://store" width="64" /></receipt>');
		const bytes = renderEscpos(ast, {
			imageMode: 'raster',
			imageAssets: {
				'logo://store': {
					image: opaqueBlackImageData(64, 32),
					width: 64,
					height: 32,
					algorithm: 'threshold',
					threshold: 128,
				},
			},
		});

		expect(includesSequence(bytes, [0x1d, 0x76, 0x30])).toBe(true);
	});

	it('skips unresolved image assets without throwing', () => {
		const ast = parseXml(
			'<receipt><text>Before</text><image src="missing" width="64" /><text>After</text></receipt>'
		);
		const bytes = renderEscpos(ast);
		const ascii = new TextDecoder().decode(bytes);

		expect(ascii).toContain('Before');
		expect(ascii).toContain('After');
	});

	it('prints barcodes as raster images when barcodeMode is image and an asset is supplied', () => {
		const ast = parseXml('<receipt><barcode type="code128">ABC-123</barcode></receipt>');
		const bytes = renderEscpos(ast, {
			imageMode: 'raster',
			barcodeMode: 'image',
			barcodeImages: {
				'barcode:code128:ABC-123:40': {
					image: opaqueBlackImageData(128, 64),
					width: 128,
					height: 64,
					algorithm: 'threshold',
				},
			},
		});

		expect(includesSequence(bytes, [0x1d, 0x76, 0x30])).toBe(true);
	});

	it('keeps native barcode commands when barcodeMode is native', () => {
		const ast = parseXml('<receipt><barcode type="code128">ABC-123</barcode></receipt>');
		const bytes = renderEscpos(ast, { barcodeMode: 'native' });

		expect(includesSequence(bytes, [0x1d, 0x6b])).toBe(true);
	});

	it('prints QR codes as raster images when barcodeMode is image and an asset is supplied', () => {
		const ast = parseXml(
			'<receipt><qrcode size="4">https://example.test/order/1001</qrcode></receipt>'
		);
		const bytes = renderEscpos(ast, {
			imageMode: 'raster',
			barcodeMode: 'image',
			barcodeImages: {
				'qrcode:https://example.test/order/1001:4': {
					image: opaqueBlackImageData(128, 128),
					width: 128,
					height: 128,
					algorithm: 'threshold',
				},
			},
		});

		expect(includesSequence(bytes, [0x1d, 0x76, 0x30])).toBe(true);
	});

	it('sanitizes style-affecting numeric fields when rendering HTML', () => {
		const ast = {
			type: 'receipt',
			paperWidth: Number.NaN,
			children: [
				{
					type: 'align',
					mode: 'left; background:url(https://evil.test)',
					children: [
						{
							type: 'size',
							width: Number.NaN,
							height: 1,
							children: [{ type: 'raw-text', value: 'X' }],
						},
					],
				},
				{
					type: 'image',
					src: 'https://example.com/logo.png',
					width: Number.NaN,
				},
				{
					type: 'feed',
					lines: Number.NaN,
				},
			],
		};
		const html = renderHtml(ast as unknown as ReturnType<typeof parseXml>);

		expect(html).toContain('width: 48ch');
		expect(html).toContain('text-align: left');
		expect(html).toContain('font-size: 1em');
		expect(html).toContain('max-width: 200px');
		expect(html).toContain('height: 1.4em');
		expect(html).not.toContain('evil.test');
	});

	it('encodes thermal templates to ESC/POS bytes', () => {
		const bytes = encodeThermalTemplate(THERMAL_TEMPLATE, data, { columns: 32 });
		const decoded = new TextDecoder().decode(bytes);

		expect(bytes).toBeInstanceOf(Uint8Array);
		expect(decoded).toContain('My Test Store');
		expect(decoded).toContain('Widget A');
	});

	it('normalizes ESC/POS output to start with printer reset', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><align mode="center"><bold><size width="2" height="2">Store</size></bold></align></receipt>',
			{},
			{ columns: 48 }
		);

		expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
	});

	it('encodes Japanese thermal text without question-mark substitutions', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text>東京コーヒー商會</text><row><col width="24">抹茶ラテ</col><col width="24" align="right">100</col></row></receipt>',
			{},
			{ columns: 48, enableCp932: true }
		);

		expect(Array.from(bytes)).not.toContain(0x3f);
		expect(Array.from(bytes)).toEqual(expect.arrayContaining([0x93, 0x8c, 0x96, 0x95]));
	});

	it('requires explicit CP932 opt-in for Japanese thermal text', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text>東京</text></receipt>',
			{},
			{ columns: 48 }
		);
		const kanjiModeIndex = Array.from(bytes).findIndex(
			(byte, index, all) => byte === 0x1c && all[index + 1] === 0x26
		);

		expect(kanjiModeIndex).toBe(-1);
	});

	it('renders existing ASTs to ESC/POS bytes', () => {
		const ast = parseXml('<receipt><text>Hello ESC/POS</text></receipt>');
		const bytes = renderEscpos(ast);

		expect(new TextDecoder().decode(bytes)).toContain('Hello ESC/POS');
	});
	it('preserves thermal preview markup when only DOMParser is available', () => {
		const originalWindow = globalThis.window;
		const originalDocument = globalThis.document;
		const originalDOMParser = globalThis.DOMParser;
		if (!originalDOMParser) {
			throw new Error('DOMParser is required for this test');
		}

		try {
			globalThis.DOMParser = originalDOMParser;
			// Simulate React Native/browser-adjacent runtimes where XML parsing exists but
			// DOMPurify cannot bind to window.document.
			Reflect.deleteProperty(globalThis, 'window');
			Reflect.deleteProperty(globalThis, 'document');

			const html = renderThermalPreview(
				'<receipt><text>Hello <script>alert(1)</script></text></receipt>',
				{}
			);

			expect(html).toContain('<div>Hello alert(1)</div>');
			expect(html).not.toContain('&lt;div');
			expect(html).not.toContain('<script');
		} finally {
			globalThis.window = originalWindow;
			globalThis.document = originalDocument;
			globalThis.DOMParser = originalDOMParser;
		}
	});
});
