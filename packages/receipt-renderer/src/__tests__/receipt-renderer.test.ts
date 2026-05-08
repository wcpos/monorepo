import { describe, expect, it, vi } from 'vitest';

import {
	analyzeThermalTemplate,
	encodeThermalTemplate,
	parseXml,
	renderEscpos,
	renderHtml,
	renderLogiclessTemplate,
	renderThermalPreview,
	sanitizeHtml,
	thermalImageAssetKey,
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
	return sequenceIndex(bytes, sequence) !== -1;
}

function sequenceIndex(bytes: Uint8Array, sequence: number[], fromIndex = 0): number {
	const all = Array.from(bytes);
	return all.findIndex(
		(_, index) =>
			index >= fromIndex && sequence.every((value, offset) => all[index + offset] === value)
	);
}

function gsCommandSkipLength(bytes: Uint8Array, index: number): number {
	const command = bytes[index + 1];
	if (command === 0x21) return 2;
	if (command === 0x56) {
		const mode = bytes[index + 2];
		return mode === 0x41 || mode === 0x42 ? 3 : 2;
	}
	if (command === 0x76 && bytes[index + 2] === 0x30) {
		const width = (bytes[index + 4] ?? 0) + ((bytes[index + 5] ?? 0) << 8);
		const height = (bytes[index + 6] ?? 0) + ((bytes[index + 7] ?? 0) << 8);
		return 7 + width * height;
	}
	return 1;
}

function decodePrintableAscii(bytes: Uint8Array): string {
	let output = '';
	for (let index = 0; index < bytes.length; index++) {
		const byte = bytes[index];
		if (byte === 0x1b) {
			const command = bytes[index + 1];
			index += command === 0x21 || command === 0x4d || command === 0x74 ? 2 : 1;
			continue;
		}
		if (byte === 0x1c) {
			index += 1;
			continue;
		}
		if (byte === 0x1d) {
			index += gsCommandSkipLength(bytes, index);
			continue;
		}
		if (byte === 0x0d || byte === 0x0a) {
			output += '\n';
			continue;
		}
		if (byte >= 0x20 && byte <= 0x7e) {
			output += String.fromCharCode(byte);
		}
	}
	return output;
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

	it('allows same-origin root-relative image URLs in thermal preview', () => {
		const html = renderThermalPreview(
			'<receipt><image src="/coffee-monster.png?v=2#rev" width="200" /></receipt>',
			{}
		);

		expect(html).toContain('src="/coffee-monster.png?v=2#rev"');
	});

	it('rejects root-relative image URLs with encoded traversal', () => {
		const html = renderThermalPreview(
			'<receipt><image src="/img/%2e%2e/secret.png" width="200" /><image src="/img/%5c..%5csecret.png" width="200" /></receipt>',
			{}
		);

		expect(html).not.toContain('<img');
	});

	it('renders barcode and QR preview images with the barcode library', () => {
		const html = renderThermalPreview(
			'<receipt><barcode type="code128">ABC-123</barcode><qrcode>https://example.test/receipt/1001</qrcode></receipt>',
			{}
		);

		expect(html).toContain('<svg');
		expect(html).toContain('data-barcode-kind="barcode"');
		expect(html).toContain('data-barcode-kind="qrcode"');
		expect(html).toMatch(/data-barcode-kind="qrcode"[\s\S]*<svg[^>]* viewBox="0 0 (\d+) \1"/);
		expect(html).toContain('data-barcode-value="ABC-123"');
		expect(html).toContain('max-width: 100%');
		expect(html).toContain('height: auto');
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

	it('pads raster image height up without dropping rows', () => {
		const ast = parseXml('<receipt><image src="logo://store" width="64" /></receipt>');
		const bytes = renderEscpos(ast, {
			imageMode: 'raster',
			imageAssets: {
				'logo://store': {
					image: opaqueBlackImageData(64, 33),
					width: 64,
					height: 33,
					algorithm: 'threshold',
					threshold: 128,
				},
			},
		});

		expect(includesSequence(bytes, [0x1d, 0x76, 0x30, 0x00, 0x08, 0x00, 0x28, 0x00])).toBe(true);
	});

	it('uses width-qualified image assets for repeated sources with different widths', () => {
		const ast = parseXml(
			'<receipt><image src="logo://store" width="64" /><image src="logo://store" width="128" /></receipt>'
		);
		const bytes = renderEscpos(ast, {
			imageMode: 'raster',
			imageAssets: {
				[thermalImageAssetKey({ src: 'logo://store', width: 64 })]: {
					image: opaqueBlackImageData(64, 32),
					width: 64,
					height: 32,
					algorithm: 'threshold',
					threshold: 128,
				},
				[thermalImageAssetKey({ src: 'logo://store', width: 128 })]: {
					image: opaqueBlackImageData(128, 32),
					width: 128,
					height: 32,
					algorithm: 'threshold',
					threshold: 128,
				},
			},
		});

		expect(includesSequence(bytes, [0x1d, 0x76, 0x30, 0x00, 0x08, 0x00, 0x20, 0x00])).toBe(true);
		expect(includesSequence(bytes, [0x1d, 0x76, 0x30, 0x00, 0x10, 0x00, 0x20, 0x00])).toBe(true);
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

	it('normalizes ESC/POS output to start with printer reset and emits double-size bytes', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><align mode="center"><bold><size width="2" height="2">Store</size></bold></align></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const hex = Array.from(bytes)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join(' ');
		const textHex = '53 74 6f 72 65';
		const setSizeIndex = hex.indexOf('1d 21 11');
		const textIndex = hex.indexOf(textHex);
		const resetSizeIndex = hex.indexOf('1d 21 00', textIndex);

		expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
		// Epson ESC/POS GS ! uses low bits for height and high bits for width.
		// width=2 + height=2 is 0x10 + 0x01 = 0x11.
		expect(setSizeIndex).toBeGreaterThanOrEqual(0);
		expect(textIndex).toBeGreaterThan(setSizeIndex);
		expect(resetSizeIndex).toBeGreaterThan(textIndex);
	});

	it('emits ESC ! print-mode size bytes for the virtual thermal printer simulator', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text><size width="2" height="2">Store</size>Small</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const hex = Array.from(bytes)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join(' ');
		const storeIndex = hex.indexOf('53 74 6f 72 65');
		const smallIndex = hex.indexOf('53 6d 61 6c 6c');
		const setEscPrintModeIndex = hex.indexOf('1b 21 30');
		const resetEscPrintModeIndex = hex.indexOf('1b 21 00', storeIndex);

		expect(setEscPrintModeIndex).toBeGreaterThanOrEqual(0);
		expect(storeIndex).toBeGreaterThan(setEscPrintModeIndex);
		expect(resetEscPrintModeIndex).toBeGreaterThan(storeIndex);
		expect(smallIndex).toBeGreaterThan(resetEscPrintModeIndex);
	});

	it('does not collapse GS ! magnification above double size with ESC ! print mode', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text><size width="2" height="2"><size width="3" height="3">Store</size></size>Small</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const doubleSizeIndex = sequenceIndex(bytes, [0x1b, 0x21, 0x30]);
		const clearEscSizeIndex = sequenceIndex(bytes, [0x1b, 0x21, 0x00], doubleSizeIndex);
		const gsSizeIndex = sequenceIndex(bytes, [0x1d, 0x21, 0x22]);
		const storeIndex = sequenceIndex(bytes, [0x53, 0x74, 0x6f, 0x72, 0x65]);
		const escPrintModeBeforeText = sequenceIndex(bytes, [0x1b, 0x21], gsSizeIndex);

		expect(doubleSizeIndex).toBeGreaterThanOrEqual(0);
		expect(clearEscSizeIndex).toBeGreaterThan(doubleSizeIndex);
		expect(gsSizeIndex).toBeGreaterThan(clearEscSizeIndex);
		expect(gsSizeIndex).toBeGreaterThanOrEqual(0);
		expect(storeIndex).toBeGreaterThan(gsSizeIndex);
		expect(escPrintModeBeforeText).toBeGreaterThan(storeIndex);
	});

	it('preserves leading spaces in ESC/POS text nodes for indented continuation lines', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text>  SKU: SKU-6564</text><text>  Flavor: Chocolate</text></receipt>',
			{},
			{ columns: 42, language: 'esc-pos' }
		);
		const printable = decodePrintableAscii(bytes);

		expect(printable).toContain('  SKU: SKU-6564');
		expect(printable).toContain('  Flavor: Chocolate');
	});

	it('emits indented standalone text through counted ESC/POS text layout', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text>  SKU: SKU-6564</text></receipt>',
			{},
			{ columns: 42, language: 'esc-pos' }
		);

		expect(includesSequence(bytes, [0x1b, 0x74, 0x00, 0x20, 0x20, 0x53])).toBe(true);
	});

	it('skips counted indented layout while ESC/POS text size is scaled', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><size width="2" height="2"><text>  SKU: SKU-6564</text></size></receipt>',
			{},
			{ columns: 42, language: 'esc-pos' }
		);
		const sizeIndex = sequenceIndex(bytes, [0x1d, 0x21, 0x11]);
		const countedLayoutIndex = sequenceIndex(
			bytes,
			[0x1b, 0x74, 0x00, 0x20, 0x20, 0x53],
			sizeIndex
		);

		expect(sizeIndex).toBeGreaterThanOrEqual(0);
		expect(countedLayoutIndex).toBe(-1);
	});

	it('omits ESC ! print-mode bytes when emitEscPrintMode is false', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text><size width="2" height="2">Store</size>Small</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos', emitEscPrintMode: false }
		);
		const gsSizeIndex = sequenceIndex(bytes, [0x1d, 0x21, 0x11]);
		const escPrintModeIndex = sequenceIndex(bytes, [0x1b, 0x21]);

		expect(gsSizeIndex).toBeGreaterThanOrEqual(0);
		expect(escPrintModeIndex).toBe(-1);
	});

	it('still preserves leading spaces when emitEscPrintMode is false', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text>  SKU: SKU-6564</text></receipt>',
			{},
			{ columns: 42, language: 'esc-pos', emitEscPrintMode: false }
		);
		const printable = decodePrintableAscii(bytes);

		expect(printable).toContain('  SKU: SKU-6564');
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

	it('analyzes fixed thermal rows that exceed configured printer columns', () => {
		const diagnostics = analyzeThermalTemplate(
			'<receipt paper-width="48"><row><col width="24">Subtotal</col><col width="24" align="right">13,26 €</col></row></receipt>',
			{},
			{ columns: 42 }
		);

		expect(diagnostics.rows).toEqual([
			expect.objectContaining({
				columns: 42,
				fixedTotal: 48,
				resolvedTotal: 48,
				overflows: true,
				hasStar: false,
			}),
		]);
	});

	it('analyzes star-width thermal rows without overflow at 42 columns', () => {
		const diagnostics = analyzeThermalTemplate(
			'<receipt paper-width="48"><row><col width="*">Subtotal</col><col width="14" align="right">13,26 €</col></row></receipt>',
			{},
			{ columns: 42 }
		);

		expect(diagnostics.rows).toEqual([
			expect.objectContaining({
				columns: 42,
				fixedTotal: 14,
				resolvedTotal: 42,
				overflows: false,
				hasStar: true,
				warnings: [],
			}),
		]);
	});

	it('warns when clamped star-width thermal rows overflow configured printer columns', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const cases = [
				{
					template:
						'<receipt paper-width="48"><row><col width="42">Subtotal</col><col width="*">Tax</col></row></receipt>',
					widths: [42, 1],
				},
				{
					template:
						'<receipt paper-width="48"><row><col width="41">Subtotal</col><col width="*">Tax</col><col width="*">Total</col></row></receipt>',
					widths: [41, 1, 1],
				},
			];

			for (const { template, widths } of cases) {
				const diagnostics = analyzeThermalTemplate(template, {}, { columns: 42 });
				const warning = 'thermal row columns (43) exceed total width (42)';

				expect(diagnostics.rows).toEqual([
					expect.objectContaining({
						columns: 42,
						resolvedTotal: 43,
						overflows: true,
						hasStar: true,
						widths,
						warnings: [warning],
					}),
				]);

				warn.mockClear();
				encodeThermalTemplate(template, {}, { columns: 42 });
				expect(warn).toHaveBeenCalledTimes(1);
				expect(warn).toHaveBeenCalledWith(warning);
			}
		} finally {
			warn.mockRestore();
		}
	});

	it('documents that styled thermal row cells flatten to text-only table bytes', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><row><col width="*"><size width="2" height="2">BIG</size></col><col width="10" align="right">1.00</col></row></receipt>',
			{},
			{ columns: 42, language: 'esc-pos' }
		);
		const hex = Array.from(bytes)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join(' ');

		expect(new TextDecoder().decode(bytes)).toContain('BIG');
		expect(hex).not.toContain('1d 21 11');
	});

	it('prints inline styled heading before following text without losing size bytes', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><align mode="center"><bold><size width="2" height="2">Store</size></bold><text>Address</text></align></receipt>',
			{},
			{ columns: 42, language: 'esc-pos' }
		);
		const decoded = new TextDecoder().decode(bytes);
		const hex = Array.from(bytes)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join(' ');

		const storeIndex = decoded.indexOf('Store');
		const addressIndex = decoded.indexOf('Address');

		expect(hex).toContain('1d 21 11');
		expect(storeIndex).toBeGreaterThanOrEqual(0);
		expect(addressIndex).toBeGreaterThan(storeIndex);
		expect(decoded.slice(storeIndex, addressIndex)).not.toMatch(/\r?\n/);
	});

	it('normalizes typographic dashes before ESC/POS text encoding', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text>Mon–Sat 9:00–18:00</text></receipt>',
			{},
			{ columns: 42, language: 'esc-pos' }
		);
		const decoded = new TextDecoder().decode(bytes);

		expect(decoded).toContain('Mon-Sat 9:00-18:00');
		expect(decoded).not.toContain('Mon–Sat');
	});

	it('does not ASCII-normalize typographic punctuation for non-ESC/POS languages', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text>Mon–Sat “open”</text><row><col width="*">Total—Today</col><col width="10" align="right">1.00</col></row></receipt>',
			{},
			{ columns: 42, language: 'star-line' }
		);
		const decoded = new TextDecoder().decode(bytes);

		expect(decoded).toContain('Mon');
		expect(decoded).toContain('Sat');
		expect(decoded).toContain('Total');
		expect(decoded).toContain('Today');
		expect(decoded).not.toContain('Mon-Sat "open"');
		expect(decoded).not.toContain('Total-Today');
	});

	it('reports height-only scaled text in thermal row diagnostics', () => {
		const diagnostics = analyzeThermalTemplate(
			'<receipt paper-width="48"><row><col width="*"><size height="2">Subtotal</size></col><col width="14" align="right">13,26 €</col></row></receipt>',
			{},
			{ columns: 42 }
		);

		expect(diagnostics.rows[0]).toEqual(expect.objectContaining({ hasScaledText: true }));
	});

	it('warns when encoding a fixed thermal row wider than the configured printer columns', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			encodeThermalTemplate(
				'<receipt paper-width="48"><row><col width="24">Subtotal</col><col width="24" align="right">13,26 €</col></row></receipt>',
				{},
				{ columns: 42 }
			);

			expect(warn).toHaveBeenCalledWith(
				expect.stringContaining('thermal row columns (48) exceed total width (42)')
			);
		} finally {
			warn.mockRestore();
		}
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
