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

function lastEscposAlignBefore(bytes: Uint8Array, beforeIndex: number): number | undefined {
	for (let index = beforeIndex - 3; index >= 0; index--) {
		if (bytes[index] === 0x1b && bytes[index + 1] === 0x61) {
			return bytes[index + 2];
		}
	}
	return undefined;
}

function countSequence(bytes: Uint8Array, sequence: number[]): number {
	let count = 0;
	let fromIndex = 0;
	while (fromIndex < bytes.length) {
		const index = sequenceIndex(bytes, sequence, fromIndex);
		if (index === -1) break;
		count++;
		fromIndex = index + 1;
	}
	return count;
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
			if (command === 0x1d) {
				index += 3;
			} else {
				index +=
					command === 0x21 ||
					command === 0x2d ||
					command === 0x45 ||
					command === 0x4d ||
					command === 0x74
						? 2
						: 1;
			}
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

type DecodedAlignedLine = { text: string; align: 'left' | 'center' | 'right' };
type VirtualThermalLine = {
	rawText: string;
	text: string;
	xStart: number;
	textWidth: number;
	lineWidth: number;
	align: 'left' | 'center' | 'right';
};

function decodeAlignByte(value: number | undefined): DecodedAlignedLine['align'] {
	if (value === 0x01) return 'center';
	if (value === 0x02) return 'right';
	return 'left';
}

function simulateEscposTextLines(bytes: Uint8Array, columns: number): VirtualThermalLine[] {
	const lines: VirtualThermalLine[] = [];
	let align: VirtualThermalLine['align'] = 'left';
	let rawText = '';

	function commitLine(): void {
		if (!rawText) return;
		const leadingSpaces = rawText.match(/^ */)?.[0].length ?? 0;
		const lineWidth = rawText.length;
		const text = rawText.trim();
		const textWidth = text.length;
		const alignedOffset =
			align === 'center'
				? Math.floor(Math.max(0, columns - lineWidth) / 2)
				: align === 'right'
					? Math.max(0, columns - lineWidth)
					: 0;

		lines.push({
			rawText,
			text,
			xStart: alignedOffset + leadingSpaces,
			textWidth,
			lineWidth,
			align,
		});
		rawText = '';
	}

	for (let index = 0; index < bytes.length; index++) {
		const byte = bytes[index];
		if (byte === 0x1b) {
			const command = bytes[index + 1];
			if (command === 0x61) {
				align = decodeAlignByte(bytes[index + 2]);
				index += 2;
				continue;
			}
			index +=
				command === 0x21 ||
				command === 0x2d ||
				command === 0x33 ||
				command === 0x45 ||
				command === 0x4d ||
				command === 0x74
					? 2
					: 1;
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
		if (byte === 0x0d) continue;
		if (byte === 0x0a) {
			commitLine();
			continue;
		}
		if (byte >= 0x20 && byte <= 0x7e) {
			rawText += String.fromCharCode(byte);
		}
	}

	commitLine();
	return lines;
}

function expectVisuallyCentered(lines: VirtualThermalLine[], text: string, columns: number): void {
	const line = lines.find((candidate) => candidate.text === text);
	expect(line).toBeDefined();
	const actualCenter = (line?.xStart ?? 0) + (line?.textWidth ?? 0) / 2;
	expect(Math.abs(actualCenter - columns / 2)).toBeLessThanOrEqual(0.5);
}

function simulateEscposVisualTextLines(bytes: Uint8Array, columns: number): VirtualThermalLine[] {
	const lines: VirtualThermalLine[] = [];
	let rawText = '';
	let visualWidths: number[] = [];
	let width = 1;

	function commitLine(): void {
		if (!rawText) return;
		const leadingSpaces = rawText.match(/^ */)?.[0].length ?? 0;
		const trailingSpaces = rawText.match(/ *$/)?.[0].length ?? 0;
		const leadingVisualSpaces = visualWidths
			.slice(0, leadingSpaces)
			.reduce((total, visualWidth) => total + visualWidth, 0);
		const trailingVisualSpaces = visualWidths
			.slice(rawText.length - trailingSpaces)
			.reduce((total, visualWidth) => total + visualWidth, 0);
		const rawVisualWidth = visualWidths.reduce((total, visualWidth) => total + visualWidth, 0);
		const textVisualWidth = rawVisualWidth - leadingVisualSpaces - trailingVisualSpaces;
		const text = rawText.trim();
		const xStart = leadingVisualSpaces;
		lines.push({
			rawText,
			text,
			xStart,
			textWidth: textVisualWidth,
			lineWidth: rawVisualWidth,
			align: 'left',
		});
		rawText = '';
		visualWidths = [];
	}

	for (let index = 0; index < bytes.length; index++) {
		const byte = bytes[index];
		if (byte === 0x1b) {
			const command = bytes[index + 1];
			if (command === 0x21) {
				width = (bytes[index + 2] ?? 0) & 0x20 ? 2 : 1;
				index += 2;
				continue;
			}
			index +=
				command === 0x21 ||
				command === 0x2d ||
				command === 0x33 ||
				command === 0x45 ||
				command === 0x4d ||
				command === 0x74
					? 2
					: 1;
			continue;
		}
		if (byte === 0x1d) {
			if (bytes[index + 1] === 0x21) {
				width = (((bytes[index + 2] ?? 0) >> 4) & 0x07) + 1;
				index += 2;
				continue;
			}
			index += gsCommandSkipLength(bytes, index);
			continue;
		}
		if (byte === 0x1c) {
			index += 1;
			continue;
		}
		if (byte === 0x0d) continue;
		if (byte === 0x0a) {
			commitLine();
			continue;
		}
		if (byte >= 0x20 && byte <= 0x7e) {
			const char = String.fromCharCode(byte);
			rawText += char;
			visualWidths.push(width);
		}
	}

	commitLine();
	return lines;
}

function expectScaledVisualCentered(bytes: Uint8Array, text: string, columns: number): void {
	const line = simulateEscposVisualTextLines(bytes, columns).find(
		(candidate) => candidate.text === text
	);
	expect(line).toBeDefined();
	const actualCenter = (line?.xStart ?? 0) + (line?.textWidth ?? 0) / 2;
	expect(Math.abs(actualCenter - columns / 2)).toBeLessThanOrEqual(1);
}

function expectSingleNewlineBetween(bytes: Uint8Array, first: string, second: string): void {
	const encoder = new TextEncoder();
	const firstIndex = sequenceIndex(bytes, Array.from(encoder.encode(first)));
	const secondIndex = sequenceIndex(bytes, Array.from(encoder.encode(second)), firstIndex);

	expect(firstIndex).toBeGreaterThanOrEqual(0);
	expect(secondIndex).toBeGreaterThan(firstIndex);
	const newlinesBetween = Array.from(bytes.slice(firstIndex, secondIndex)).filter(
		(byte) => byte === 0x0a
	).length;
	expect(newlinesBetween).toBe(1);
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
		expect(html).toMatch(/<svg[^>]*style="width: min\(100%, [0-9.]+ch\); height: auto"/);
		expect(html).toContain('height: auto');
		expect(html).toContain('stroke=');
		expect(html).toContain('stroke-width=');
		expect(html).toContain('ABC-123');
		expect(html).not.toContain('repeating-linear-gradient');
		expect(html).not.toContain('>QR<');
	});

	it('scales thermal barcode previews 50% larger than their print dot ratio', () => {
		const html = renderHtml({
			type: 'receipt',
			paperWidth: 48,
			children: [{ type: 'barcode', barcodeType: 'code128', height: 40, value: 'ABC-123' }],
		});

		expect(html).toContain('style="width: min(100%, 28.00ch); height: auto"');

		const qrHtml = renderHtml({
			type: 'receipt',
			paperWidth: 48,
			children: [{ type: 'barcode', barcodeType: 'qr', height: 40, value: 'XYZ' }],
		});

		expect(qrHtml).not.toContain('style="width: min(100%, 28.00ch); height: auto"');
		expect(qrHtml).toContain('style="width: min(100%, 14.00ch); height: auto"');
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

	it('prints a full receipt raster image instead of text when supplied', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text>متجر القهوة الذهبية</text><text>After raster</text><feed lines="2" /><cut /></receipt>',
			{},
			{
				columns: 42,
				language: 'esc-pos',
				fullReceiptRasterImage: {
					image: opaqueBlackImageData(64, 32),
					width: 64,
					height: 32,
					algorithm: 'threshold',
					threshold: 128,
				},
			}
		);

		expect(includesSequence(bytes, [0x1d, 0x76, 0x30])).toBe(true);
		expect(sequenceIndex(bytes, Array.from(new TextEncoder().encode('After raster')))).toBe(-1);
		expect(includesSequence(bytes, [0x1b, 0x74, 0x20])).toBe(false);
		expect(sequenceIndex(bytes, [0x0a, 0x0d, 0x0a, 0x0d])).toBeGreaterThan(
			sequenceIndex(bytes, [0x1d, 0x76, 0x30])
		);
		expect(includesSequence(bytes, [0x1d, 0x56])).toBe(true);
	});

	it('encodes a large full receipt raster without overflowing the call stack', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text>After raster</text><feed lines="2" /><cut /></receipt>',
			{},
			{
				columns: 42,
				language: 'esc-pos',
				fullReceiptRasterImage: {
					image: opaqueBlackImageData(576, 1720),
					width: 576,
					height: 1720,
					algorithm: 'threshold',
					threshold: 128,
				},
			}
		);

		expect(includesSequence(bytes, [0x1d, 0x76, 0x30])).toBe(true);
		expect(includesSequence(bytes, [0x1d, 0x56])).toBe(true);
	});

	it('respects printer-model newline bytes for full receipt raster encoding', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><feed lines="2" /><drawer /></receipt>',
			{},
			{
				printerModel: 'hp-a779',
				fullReceiptRasterImage: {
					image: opaqueBlackImageData(64, 32),
					width: 64,
					height: 32,
					algorithm: 'threshold',
					threshold: 128,
				},
			}
		);
		const imageIndex = sequenceIndex(bytes, [0x1d, 0x76, 0x30]);
		const pulseIndex = sequenceIndex(bytes, [0x1b, 0x70], imageIndex);
		const bytesBeforePulse = bytes.slice(imageIndex, pulseIndex);

		expect(imageIndex).toBeGreaterThanOrEqual(0);
		expect(pulseIndex).toBeGreaterThan(imageIndex);
		expect(includesSequence(bytesBeforePulse, [0x0a, 0x0d])).toBe(false);
		expect(countSequence(bytesBeforePulse, [0x0a])).toBe(3);
	});

	it('preserves center alignment for text after a raster image in the same align block', () => {
		const ast = parseXml(
			'<receipt><align mode="center"><image src="logo://store" width="64" /><text>Store Name</text></align><text>After</text></receipt>'
		);
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

		const lines = simulateEscposTextLines(bytes, 48);
		expectVisuallyCentered(lines, 'Store Name', 48);
		expect(lines.find((line) => line.text === 'After')?.xStart).toBe(0);
	});

	it('visually centers each text line inside ESC/POS align blocks', () => {
		const ast = parseXml(
			'<receipt paper-width="48"><align mode="center"><text>48 Avinguda Diagonal</text><text>VAT ES0000000000</text><text>Horario de apertura</text></align><text>After</text></receipt>'
		);
		const lines = simulateEscposTextLines(
			renderEscpos(ast, { columns: 48, language: 'esc-pos' }),
			48
		);

		expectVisuallyCentered(lines, '48 Avinguda Diagonal', 48);
		expectVisuallyCentered(lines, 'VAT ES0000000000', 48);
		expectVisuallyCentered(lines, 'Horario de apertura', 48);
		expect(lines.find((line) => line.text === 'After')?.xStart).toBe(0);
	});

	it('does not insert blank rows between centered standalone text lines', () => {
		const bytes = encodeThermalTemplate(
			'<receipt paper-width="48"><align mode="center"><text>Store</text><text>Name</text></align></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);

		expectSingleNewlineBetween(bytes, 'Store', 'Name');
	});

	it('does not insert blank rows after centered formatted text lines', () => {
		const bytes = encodeThermalTemplate(
			'<receipt paper-width="48"><align mode="center"><text><bold>Store</bold></text><text>Name</text></align></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);

		expectSingleNewlineBetween(bytes, 'Store', 'Name');
	});

	it('preserves explicit empty text rows as receipt spacing', () => {
		const bytes = encodeThermalTemplate(
			'<receipt paper-width="48"><text>Before</text><text></text><text>After</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const beforeIndex = sequenceIndex(bytes, Array.from(new TextEncoder().encode('Before')));
		const afterIndex = sequenceIndex(
			bytes,
			Array.from(new TextEncoder().encode('After')),
			beforeIndex
		);

		expect(beforeIndex).toBeGreaterThanOrEqual(0);
		expect(afterIndex).toBeGreaterThan(beforeIndex);
		const newlinesBetween = Array.from(bytes.slice(beforeIndex, afterIndex)).filter(
			(byte) => byte === 0x0a
		).length;
		expect(newlinesBetween).toBe(2);
	});

	it('visually centers formatted raw children inside ESC/POS align blocks', () => {
		const ast = parseXml(
			'<receipt paper-width="48"><align mode="center"><bold>Store Name</bold></align><text>After</text></receipt>'
		);
		const lines = simulateEscposTextLines(
			renderEscpos(ast, { columns: 48, language: 'esc-pos' }),
			48
		);

		expectVisuallyCentered(lines, 'Store Name', 48);
		expect(lines.find((line) => line.text === 'After')?.xStart).toBe(0);
	});

	it.each([
		['center', 17],
		['right', 35],
	] as const)('keeps inline formatted %s text on one physical line', (mode, xStart) => {
		const ast = parseXml(
			`<receipt paper-width="48"><align mode="${mode}"><text>Total: <bold>$10.00</bold></text></align><text>After</text></receipt>`
		);
		const lines = simulateEscposTextLines(
			renderEscpos(ast, { columns: 48, language: 'esc-pos' }),
			48
		);

		expect(lines.find((line) => line.text === 'Total: $10.00')?.xStart).toBe(xStart);
		expect(lines.some((line) => line.text === 'Total:' || line.text === '$10.00')).toBe(false);
		expect(lines.find((line) => line.text === 'After')?.xStart).toBe(0);
	});

	it.each([
		['plain prefix plus bold suffix', '<text>Hello <bold>world</bold>!</text>', 'Hello world!'],
		[
			'multiple styled siblings',
			'<text><bold>Factura</bold><underline> fiscal</underline></text>',
			'Factura fiscal',
		],
	] as const)('centers inline mixed-content text as one row: %s', (_name, template, text) => {
		const ast = parseXml(
			`<receipt paper-width="48"><align mode="center">${template}</align><text>After</text></receipt>`
		);
		const lines = simulateEscposTextLines(
			renderEscpos(ast, { columns: 48, language: 'esc-pos' }),
			48
		);

		expectVisuallyCentered(lines, text, 48);
		expect(lines.filter((line) => line.text === text)).toHaveLength(1);
		expect(lines.find((line) => line.text === 'After')?.xStart).toBe(0);
	});

	it('keeps direct inline mixed content in an align block on one physical line', () => {
		const ast = parseXml(
			'<receipt paper-width="48"><align mode="center">Total: <bold>$10.00</bold></align><text>After</text></receipt>'
		);
		const lines = simulateEscposTextLines(
			renderEscpos(ast, { columns: 48, language: 'esc-pos' }),
			48
		);

		expectVisuallyCentered(lines, 'Total: $10.00', 48);
		expect(lines.some((line) => line.text === 'Total:' || line.text === '$10.00')).toBe(false);
		expect(lines.find((line) => line.text === 'After')?.xStart).toBe(0);
	});

	it.each([
		['standalone text node', '<text>One&#10;Two</text>'],
		['direct raw text node', 'One&#10;Two'],
	] as const)('does not use fixed-column aligned layout for multiline %s', (_name, template) => {
		const ast = parseXml(
			`<receipt paper-width="48"><align mode="center">${template}</align></receipt>`
		);
		const lines = simulateEscposTextLines(
			renderEscpos(ast, { columns: 48, language: 'esc-pos' }),
			48
		);

		for (const text of ['One', 'Two']) {
			const line = lines.find((candidate) => candidate.text === text);
			expect(line).toBeDefined();
			expect(line?.lineWidth).toBeLessThan(48);
		}
	});

	it.each(['esc-pos', 'star-prnt', 'star-line'] as const)(
		'keeps inline formatted centered text on one printable row for %s',
		(language) => {
			const bytes = encodeThermalTemplate(
				'<receipt paper-width="48"><align mode="center"><text>Total: <bold>$10.00</bold></text></align><text>After</text></receipt>',
				{},
				{ columns: 48, language }
			);
			const printable = decodePrintableAscii(bytes);

			expect(printable).toContain('Total: $10.00');
			expect(printable).not.toContain('Total:\n');
			expect(printable).not.toContain('$10.00\nAfter');
			expectSingleNewlineBetween(bytes, 'Total: ', 'After');
		}
	);

	it('does not insert blank rows between common centered receipt blocks', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<text><bold>Solstice Records</bold></text>
					<text>Avinguda Diagonal</text>
					<text>Amsterdam, NL</text>
				</align>
				<line />
				<align mode="center">
					<text><bold>Factura fiscal</bold></text>
					<text>[ Reembolsado ]</text>
				</align>
				<line />
				<align mode="center">
					<text><bold>Horario de apertura</bold></text>
					<text>Mon-Sat 9:00-18:00</text>
					<text>Closed on public holidays</text>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);

		expectSingleNewlineBetween(bytes, 'Solstice Records', 'Avinguda Diagonal');
		expectSingleNewlineBetween(bytes, 'Avinguda Diagonal', 'Amsterdam, NL');
		expectSingleNewlineBetween(bytes, 'Factura fiscal', '[ Reembolsado ]');
		expectSingleNewlineBetween(bytes, 'Horario de apertura', 'Mon-Sat 9:00-18:00');
		expectSingleNewlineBetween(bytes, 'Mon-Sat 9:00-18:00', 'Closed on public holidays');
	});

	it('restores left row layout after centered inline text', () => {
		const ast = parseXml(
			`<receipt paper-width="48">
				<align mode="center"><text>Total: <bold>$10.00</bold></text></align>
				<row><col width="10">Pedido:</col><col width="38" align="right">#1894</col></row>
			</receipt>`
		);
		const lines = simulateEscposTextLines(
			renderEscpos(ast, { columns: 48, language: 'esc-pos' }),
			48
		);
		const rowLine = lines.find((line) => line.text.startsWith('Pedido:'));

		expect(rowLine?.xStart).toBe(0);
		expect(rowLine?.rawText.startsWith('Pedido:')).toBe(true);
		expect(rowLine?.rawText.endsWith('#1894')).toBe(true);
	});

	it('does not insert blank rows between adjacent thermal table rows', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<row><col width="10">Pedido:</col><col width="38" align="right">#7270</col></row>
				<row><col width="10">Fecha:</col><col width="38" align="right">28 may 2026, 12:16</col></row>
				<row><col width="10">Cajero:</col><col width="38" align="right">Lin Beaumont</col></row>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);

		expectSingleNewlineBetween(bytes, '#7270', 'Fecha:');
		expectSingleNewlineBetween(bytes, '12:16', 'Cajero:');
	});

	it('preserves leading indentation in left-aligned thermal row cells', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<row><col width="*" align="left">  3 x 7,15 €</col><col width="12" align="right">21,45 €</col></row>
				<row><col width="*" align="left">  Base imp. 19,50 €</col><col width="20" align="right">Base c/IVA 21,45 €</col></row>
				<row><col width="*" align="left">Card</col><col width="12" align="right">21,45 €</col></row>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const lines = simulateEscposTextLines(bytes, 48);
		const itemQuantityLine = lines.find((line) => line.text.startsWith('3 x 7,15'));
		const taxBaseLine = lines.find((line) => line.text.startsWith('Base imp.'));

		expect(itemQuantityLine?.rawText.startsWith('  3 x 7,15')).toBe(true);
		expect(itemQuantityLine?.rawText).toContain('21,45');
		expect(taxBaseLine?.rawText.startsWith('  Base imp.')).toBe(true);
		expectSingleNewlineBetween(bytes, '21,45', 'Base imp.');
		expectSingleNewlineBetween(bytes, 'Base c/IVA', 'Card');
	});

	it('prints default single line rules as printer-native straight rules', () => {
		const bytes = encodeThermalTemplate(
			'<receipt paper-width="48"><text>Before</text><line /><text>After</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const printable = decodePrintableAscii(bytes);
		const nativeSingleRule = new Array(48).fill(0xc4);
		const beforeIndex = sequenceIndex(bytes, Array.from(new TextEncoder().encode('Before')));
		const singleRuleIndex = sequenceIndex(bytes, nativeSingleRule, beforeIndex);
		const afterIndex = sequenceIndex(bytes, Array.from(new TextEncoder().encode('After')));

		expect(printable).not.toContain('-'.repeat(48));
		expect(beforeIndex).toBeGreaterThanOrEqual(0);
		expect(singleRuleIndex).toBeGreaterThan(beforeIndex);
		expect(afterIndex).toBeGreaterThan(singleRuleIndex);
	});

	it.each([
		['dashed', '-'.repeat(48)],
		['dotted', '. '.repeat(24)],
	] as const)('prints %s line rules as text rows for thermal preview parity', (style, rule) => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48"><text>Before</text><line style="${style}" /><text>After</text></receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const printable = decodePrintableAscii(bytes);

		expect(printable).toContain(rule);
		expectSingleNewlineBetween(bytes, 'Before', rule);
		expectSingleNewlineBetween(bytes, rule, 'After');
	});

	it('centers formatted status text after a scaled fiscal heading', () => {
		const ast = parseXml(
			`<receipt paper-width="48">
				<align mode="center">
					<text><bold><size width="2" height="2">Factura fiscal</size></bold></text>
					<text>[ <bold>Cancelado</bold> ]</text>
				</align>
			</receipt>`
		);
		const lines = simulateEscposTextLines(
			renderEscpos(ast, { columns: 48, language: 'esc-pos' }),
			48
		);

		expectVisuallyCentered(lines, '[ Cancelado ]', 48);
		expect(lines.find((line) => line.text === '[ Cancelado ]')?.xStart).toBe(17);
	});

	it('closes a centered scaled kitchen heading before the following rule', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<bold><size width="2" height="2"><text>{{i18n.kitchen}}</text></size></bold>
				</align>
				<line style="double" />
				<bold><text>{{order.number}}</text></bold>
			</receipt>`,
			{ i18n: { kitchen: 'COCINA' }, order: { number: '3595' } },
			{ columns: 48, language: 'esc-pos' }
		);
		const kitchenIndex = sequenceIndex(bytes, Array.from(new TextEncoder().encode('COCINA')));
		const headingNewlineIndex = sequenceIndex(bytes, [0x0a], kitchenIndex);
		const doubleRuleIndex = sequenceIndex(bytes, [0xcd], kitchenIndex);
		const orderIndex = sequenceIndex(bytes, Array.from(new TextEncoder().encode('3595')));
		const printable = decodePrintableAscii(bytes);

		expect(kitchenIndex).toBeGreaterThanOrEqual(0);
		expect(headingNewlineIndex).toBeGreaterThan(kitchenIndex);
		expect(doubleRuleIndex).toBeGreaterThan(headingNewlineIndex);
		expect(orderIndex).toBeGreaterThan(headingNewlineIndex);
		expect(printable).not.toContain('COCINA' + '=');
	});

	it.each([42, 48])(
		'visually centers receipt header/fiscal/footer text at %i columns',
		(columns) => {
			const bytes = encodeThermalTemplate(
				`<receipt paper-width="${columns}">
					<align mode="center">
						<text>17 Rua dos Douradores</text>
						<text>Avinguda Diagonal</text>
						<text>Amsterdam, NL</text>
						<text>08001</text>
						<text>Phone: +34 555 9329</text>
						<text>Email: hello@example.com</text>
						<text>TVA intracommunautaire: FR54925237147</text>
						<text>SIRET: 92523714748264</text>
					</align>
					<line />
					<align mode="center">
						<text>Factura fiscal</text>
						<text>[ Reembolsado ]</text>
					</align>
					<line />
					<align mode="center">
						<text>VAT ES0000000000 - Reg. 12345</text>
					</align>
					<line />
					<align mode="center">
						<text>Horario de apertura</text>
						<text>Mon-Sat 9:00-18:00</text>
						<text>Closed on public holidays</text>
					</align>
				</receipt>`,
				{},
				{ columns, language: 'esc-pos' }
			);
			const lines = simulateEscposTextLines(bytes, columns);

			for (const text of [
				'17 Rua dos Douradores',
				'Avinguda Diagonal',
				'Amsterdam, NL',
				'08001',
				'Phone: +34 555 9329',
				'Email: hello@example.com',
				'TVA intracommunautaire: FR54925237147',
				'SIRET: 92523714748264',
				'Factura fiscal',
				'[ Reembolsado ]',
				'VAT ES0000000000 - Reg. 12345',
				'Horario de apertura',
				'Mon-Sat 9:00-18:00',
				'Closed on public holidays',
			]) {
				expectVisuallyCentered(lines, text, columns);
			}
		}
	);

	it('uses the printer model language for image alignment', () => {
		const ast = parseXml(
			'<receipt><align mode="center"><image src="logo://store" width="64" /><text>Store Name</text></align></receipt>'
		);
		const bytes = renderEscpos(ast, {
			printerModel: 'star-tsp100iv',
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

		expect(countSequence(bytes, [0x1b, 0x1d, 0x61, 0x01])).toBeGreaterThanOrEqual(1);
		expect(sequenceIndex(bytes, [0x1b, 0x61, 0x01])).toBe(-1);
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
		// 200 dots default → 200 * 48 / 576 = 16.67ch on a 48-char 80mm receipt.
		expect(html).toContain('width: min(100%, 16.67ch)');
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

	it('skips fixed-column aligned text layout while ESC/POS text size is scaled', () => {
		const bytes = encodeThermalTemplate(
			'<receipt paper-width="42"><align mode="center"><size width="2" height="2"><text>BIG</text></size></align></receipt>',
			{},
			{ columns: 42, language: 'esc-pos' }
		);
		const sizeIndex = sequenceIndex(bytes, [0x1d, 0x21, 0x11]);
		const centeredTableIndex = sequenceIndex(
			bytes,
			Array.from(new TextEncoder().encode('                   BIG')),
			sizeIndex
		);

		expect(sizeIndex).toBeGreaterThanOrEqual(0);
		expect(centeredTableIndex).toBe(-1);
	});

	it('restores ESC line spacing after the newline that closes inline scaled text', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text><size width="2" height="2">Big</size>Small</text><text>Next</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const setSpacingIndex = sequenceIndex(bytes, [0x1b, 0x33, 60]);
		const bigIndex = sequenceIndex(bytes, [0x42, 0x69, 0x67]);
		const smallIndex = sequenceIndex(bytes, [0x53, 0x6d, 0x61, 0x6c, 0x6c]);
		const newlineIndex = sequenceIndex(bytes, [0x0a], smallIndex);
		const restoreSpacingIndex = sequenceIndex(bytes, [0x1b, 0x32], smallIndex);
		const nextIndex = sequenceIndex(bytes, [0x4e, 0x65, 0x78, 0x74]);

		expect(setSpacingIndex).toBeGreaterThanOrEqual(0);
		expect(bigIndex).toBeGreaterThan(setSpacingIndex);
		expect(smallIndex).toBeGreaterThan(bigIndex);
		expect(newlineIndex).toBeGreaterThan(smallIndex);
		expect(restoreSpacingIndex).toBeGreaterThan(newlineIndex);
		expect(nextIndex).toBeGreaterThan(restoreSpacingIndex);
	});

	it('tracks the tallest ESC line spacing across nested scaled text', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><text><size height="2"><size height="3">Big</size></size>Small</text><text>Next</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const doubleSpacingIndex = sequenceIndex(bytes, [0x1b, 0x33, 60]);
		const tripleSpacingIndex = sequenceIndex(bytes, [0x1b, 0x33, 90]);
		const bigIndex = sequenceIndex(bytes, [0x42, 0x69, 0x67]);
		const smallIndex = sequenceIndex(bytes, [0x53, 0x6d, 0x61, 0x6c, 0x6c]);
		const newlineIndex = sequenceIndex(bytes, [0x0a], smallIndex);
		const restoreSpacingIndex = sequenceIndex(bytes, [0x1b, 0x32], smallIndex);
		const nextIndex = sequenceIndex(bytes, [0x4e, 0x65, 0x78, 0x74]);

		expect(doubleSpacingIndex).toBeGreaterThanOrEqual(0);
		expect(tripleSpacingIndex).toBeGreaterThan(doubleSpacingIndex);
		expect(bigIndex).toBeGreaterThan(tripleSpacingIndex);
		expect(smallIndex).toBeGreaterThan(bigIndex);
		expect(newlineIndex).toBeGreaterThan(smallIndex);
		expect(restoreSpacingIndex).toBeGreaterThan(newlineIndex);
		expect(nextIndex).toBeGreaterThan(restoreSpacingIndex);
	});

	it('restores ESC line spacing after a scaled row before following text', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><size height="2"><row><col width="*">Big</col><col width="10" align="right">1.00</col></row></size><text>Next</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const setSpacingIndex = sequenceIndex(bytes, [0x1b, 0x33, 60]);
		const bigIndex = sequenceIndex(bytes, [0x42, 0x69, 0x67]);
		const amountIndex = sequenceIndex(bytes, [0x31, 0x2e, 0x30, 0x30], bigIndex);
		const newlineIndex = sequenceIndex(bytes, [0x0a], amountIndex);
		const restoreSpacingIndex = sequenceIndex(bytes, [0x1b, 0x32], newlineIndex);
		const nextIndex = sequenceIndex(bytes, [0x4e, 0x65, 0x78, 0x74]);

		expect(setSpacingIndex).toBeGreaterThanOrEqual(0);
		expect(bigIndex).toBeGreaterThan(setSpacingIndex);
		expect(amountIndex).toBeGreaterThan(bigIndex);
		expect(newlineIndex).toBeGreaterThan(amountIndex);
		expect(restoreSpacingIndex).toBeGreaterThan(newlineIndex);
		expect(nextIndex).toBeGreaterThan(restoreSpacingIndex);
	});

	it('restores ESC line spacing after height-only scaled centered text', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><align mode="center"><size height="2"><text>BIG</text></size></align><text>Next</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const bigIndex = sequenceIndex(bytes, [0x42, 0x49, 0x47]);
		const newlineIndex = sequenceIndex(bytes, [0x0a], bigIndex);
		const restoreSpacingIndex = sequenceIndex(bytes, [0x1b, 0x32], newlineIndex);
		const nextIndex = sequenceIndex(bytes, [0x4e, 0x65, 0x78, 0x74]);

		expect(bigIndex).toBeGreaterThanOrEqual(0);
		expect(newlineIndex).toBeGreaterThan(bigIndex);
		expect(restoreSpacingIndex).toBeGreaterThan(newlineIndex);
		expect(nextIndex).toBeGreaterThan(restoreSpacingIndex);
	});

	it('restores ESC line spacing after raw height-only scaled centered text', () => {
		const bytes = encodeThermalTemplate(
			'<receipt><align mode="center"><size height="2">BIG</size><text>Next</text></align></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const bigIndex = sequenceIndex(bytes, [0x42, 0x49, 0x47]);
		const newlineIndex = sequenceIndex(bytes, [0x0a], bigIndex);
		const restoreSpacingIndex = sequenceIndex(bytes, [0x1b, 0x32], newlineIndex);
		const nextIndex = sequenceIndex(bytes, [0x4e, 0x65, 0x78, 0x74]);

		expect(bigIndex).toBeGreaterThanOrEqual(0);
		expect(newlineIndex).toBeGreaterThan(bigIndex);
		expect(restoreSpacingIndex).toBeGreaterThan(newlineIndex);
		expect(nextIndex).toBeGreaterThan(restoreSpacingIndex);
	});

	it('keeps height-only scaled mixed inline text on one physical line', () => {
		const bytes = encodeThermalTemplate(
			'<receipt paper-width="48"><align mode="center"><size height="2">AB<bold>CD</bold></size></align></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const lines = simulateEscposTextLines(bytes, 48);

		expect(lines.map((line) => line.text)).toContain('ABCD');
		expect(lines.map((line) => line.text)).not.toContain('AB');
		expect(lines.map((line) => line.text)).not.toContain('CD');
	});

	it('keeps ESC line-spacing bytes out of Star printer output', () => {
		const template = '<receipt><text><size width="2" height="2">Big</size>Small</text></receipt>';

		for (const language of ['star-prnt', 'star-line'] as const) {
			const bytes = encodeThermalTemplate(template, {}, { columns: 48, language });
			const anyEsc3Index = Array.from(bytes).findIndex(
				(byte, index, all) => byte === 0x1b && all[index + 1] === 0x33 && index + 2 < all.length
			);

			expect(anyEsc3Index).toBe(-1);
			expect(sequenceIndex(bytes, [0x1b, 0x32])).toBe(-1);
		}
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

	it('centers text after a direct styled heading on the next physical line', () => {
		const bytes = encodeThermalTemplate(
			'<receipt paper-width="48"><align mode="center"><bold><size width="2" height="2">Cassette Coffee Co.</size></bold><text>88 Rue de Rivoli</text></align></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const decoded = new TextDecoder().decode(bytes);
		const hex = Array.from(bytes)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join(' ');
		const lines = simulateEscposTextLines(bytes, 48);

		const storeIndex = decoded.indexOf('Cassette Coffee Co.');
		const addressIndex = decoded.indexOf('88 Rue de Rivoli');

		expect(hex).toContain('1d 21 11');
		expect(storeIndex).toBeGreaterThanOrEqual(0);
		expect(addressIndex).toBeGreaterThan(storeIndex);
		expect(decoded.slice(storeIndex, addressIndex)).toMatch(/\r?\n/);
		expectVisuallyCentered(lines, '88 Rue de Rivoli', 48);
	});

	it('centers a scaled block heading when the line break is inside the style container', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<bold><size width="2" height="2"><text>Cassette Coffee Co.</text></size></bold>
					<text>88 Rue de Rivoli</text>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);

		expectScaledVisualCentered(bytes, 'Cassette Coffee Co.', 48);
		expectVisuallyCentered(simulateEscposTextLines(bytes, 48), '88 Rue de Rivoli', 48);
	});

	it('centers a scaled fiscal heading and the following status label', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<bold><size width="2"><text>Fiscal Receipt</text></size></bold>
					<text>[ Refunded ]</text>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);

		expectScaledVisualCentered(bytes, 'Fiscal Receipt', 48);
		expectVisuallyCentered(simulateEscposTextLines(bytes, 48), '[ Refunded ]', 48);
	});

	it('keeps multiple styled aligned text nodes on separate physical lines', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<bold><text>Line 1</text><text>Line 2</text></bold>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const lines = simulateEscposTextLines(bytes, 48)
			.filter((line) => line.text === 'Line 1' || line.text === 'Line 2')
			.map((line) => line.text);

		expect(lines).toEqual(['Line 1', 'Line 2']);
	});

	it('finishes mixed inline styled headings before the following centered line', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<bold>Hello <underline>world</underline></bold>
					<text>After</text>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const lines = simulateEscposTextLines(bytes, 48);

		expectVisuallyCentered(lines, 'Hello world', 48);
		expectVisuallyCentered(lines, 'After', 48);
	});

	it('forces left printer alignment before physical center padding after a scaled centered heading', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<text>[CENTER NORMAL 21]</text>
					<bold><size width="2"><text>BIG CENTER 14</text></size></bold>
					<text>[STATUS LINE 21 CH]</text>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const statusIndex = sequenceIndex(
			bytes,
			Array.from(new TextEncoder().encode('[STATUS LINE 21 CH]'))
		);
		const statusLine = decodePrintableAscii(bytes)
			.split('\n')
			.find((line) => line.includes('[STATUS LINE 21 CH]'));

		expect(statusIndex).toBeGreaterThan(0);
		expect(lastEscposAlignBefore(bytes, statusIndex)).toBe(0);
		expect(statusLine).toBe(`${' '.repeat(14)}[STATUS LINE 21 CH]`);
	});

	it('finishes styled scaled heading state before moving to the next centered line', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<bold><size width="2"><text>BIG CENTER 14</text></size></bold>
					<text>[STATUS LINE 21 CH]</text>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const bigIndex = sequenceIndex(bytes, Array.from(new TextEncoder().encode('BIG CENTER 14')));
		const newlineAfterBig = sequenceIndex(bytes, [0x0a], bigIndex);
		const statusIndex = sequenceIndex(
			bytes,
			Array.from(new TextEncoder().encode('[STATUS LINE 21 CH]'))
		);
		const betweenLines = Array.from(bytes.slice(newlineAfterBig, statusIndex));

		expect(newlineAfterBig).toBeGreaterThan(bigIndex);
		expect(statusIndex).toBeGreaterThan(newlineAfterBig);
		expect(betweenLines).not.toContain(0x11);
		expect(betweenLines).not.toContain(0x38);
		expect(sequenceIndex(bytes, [0x1b, 0x61, 0x00], newlineAfterBig)).toBeLessThan(statusIndex);
	});

	it('does not carry hidden center padding from one aligned block into the next scaled heading', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<bold><size width="2" height="2"><text>Store Name</text></size></bold>
					<text>17 Rua dos Douradores</text>
				</align>
				<align mode="center">
					<bold><size width="2"><text>Fiscal Receipt</text></size></bold>
					<text>[ Refunded ]</text>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);

		expectScaledVisualCentered(bytes, 'Store Name', 48);
		expectVisuallyCentered(simulateEscposTextLines(bytes, 48), '17 Rua dos Douradores', 48);
		expectScaledVisualCentered(bytes, 'Fiscal Receipt', 48);
		expectVisuallyCentered(simulateEscposTextLines(bytes, 48), '[ Refunded ]', 48);
	});

	it('restores printer alignment after a scaled block heading before a barcode', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<size width="2"><text>BIG</text></size>
					<barcode type="code128">ABC</barcode>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const bigIndex = sequenceIndex(bytes, [0x42, 0x49, 0x47]);
		const barcodeIndex = sequenceIndex(bytes, [0x1d, 0x68], bigIndex);
		const centerAlignIndex = sequenceIndex(bytes, [0x1b, 0x61, 0x01], bigIndex);

		expect(barcodeIndex).toBeGreaterThan(bigIndex);
		expect(centerAlignIndex).toBeGreaterThan(bigIndex);
		expect(centerAlignIndex).toBeLessThan(barcodeIndex);
	});

	it('restores printer alignment after scaled raw text before a barcode', () => {
		const bytes = encodeThermalTemplate(
			`<receipt paper-width="48">
				<align mode="center">
					<size width="2">BIG</size>
					<barcode type="code128">ABC</barcode>
				</align>
			</receipt>`,
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const bigIndex = sequenceIndex(bytes, [0x42, 0x49, 0x47]);
		const barcodeIndex = sequenceIndex(bytes, [0x1d, 0x68], bigIndex);
		const centerAlignIndex = sequenceIndex(bytes, [0x1b, 0x61, 0x01], bigIndex);

		expect(barcodeIndex).toBeGreaterThan(bigIndex);
		expect(centerAlignIndex).toBeGreaterThan(bigIndex);
		expect(centerAlignIndex).toBeLessThan(barcodeIndex);
	});

	it('terminates a scaled raw text line before following text', () => {
		const bytes = encodeThermalTemplate(
			'<receipt paper-width="48"><align mode="center"><size width="2">BIG</size></align><text>After</text></receipt>',
			{},
			{ columns: 48, language: 'esc-pos' }
		);
		const lines = simulateEscposTextLines(bytes, 48);

		expectScaledVisualCentered(bytes, 'BIG', 48);
		expect(lines.map((line) => line.text)).not.toContain('BIGAfter');
		expectSingleNewlineBetween(bytes, 'BIG', 'After');
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
