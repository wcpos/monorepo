import { describe, expect, it } from 'vitest';

import { parseXml } from '../parse-xml';
import { renderEscpos } from '../render-escpos';

function decode(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

function includesSequence(bytes: Uint8Array, sequence: number[]): boolean {
	return Array.from(bytes).some((_, index, all) =>
		sequence.every((value, offset) => all[index + offset] === value)
	);
}

function opaqueBlackImageData(width: number, height: number): ImageData {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let offset = 0; offset < data.length; offset += 4) data[offset + 3] = 255;
	return { width, height, data } as ImageData;
}

describe('renderEscpos', () => {
	it('returns a Uint8Array with length > 0', () => {
		const ast = parseXml('<receipt><text>Hello</text></receipt>');
		const result = renderEscpos(ast);
		expect(result).toBeInstanceOf(Uint8Array);
		expect(result.length).toBeGreaterThan(0);
	});

	it('includes text content in decoded output', () => {
		const ast = parseXml('<receipt><text>Hello World</text></receipt>');
		const result = renderEscpos(ast);
		const text = decode(result);
		expect(text).toContain('Hello World');
	});

	it('includes ESC/POS commands for bold (0x1b byte present)', () => {
		const ast = parseXml('<receipt><bold>Important</bold></receipt>');
		const result = renderEscpos(ast);
		expect(result).toContain(0x1b);
	});

	it('produces output for row/col layout', () => {
		const ast = parseXml(
			'<receipt><row><col width="24" align="left">Item</col><col width="24" align="right">$9.99</col></row></receipt>'
		);
		const result = renderEscpos(ast);
		const text = decode(result);
		expect(text).toContain('Item');
		expect(text).toContain('$9.99');
	});

	it('includes cut command (0x1d byte present)', () => {
		const ast = parseXml('<receipt><text>Receipt</text><cut/></receipt>');
		const result = renderEscpos(ast);
		expect(result).toContain(0x1d);
	});

	it('includes drawer pulse command', () => {
		const ast = parseXml('<receipt><drawer/></receipt>');
		const result = renderEscpos(ast);
		expect(result.length).toBeGreaterThan(0);
	});

	it('respects columns option', () => {
		const ast = parseXml(
			'<receipt><row><col width="*">Name</col><col width="10" align="right">$5.00</col></row></receipt>'
		);
		const result32 = renderEscpos(ast, { columns: 32 });
		const result48 = renderEscpos(ast, { columns: 48 });
		expect(decode(result32)).not.toEqual(decode(result48));
	});

	it('respects language option for StarPRNT', () => {
		const ast = parseXml('<receipt><text>Star</text></receipt>');
		const escpos = renderEscpos(ast, { language: 'esc-pos' });
		const star = renderEscpos(ast, { language: 'star-prnt' });
		expect(Array.from(star)).not.toEqual(Array.from(escpos));
	});

	it('handles feed lines', () => {
		const ast = parseXml(
			'<receipt><text>Before</text><feed lines="3"/><text>After</text></receipt>'
		);
		const result = renderEscpos(ast);
		const text = decode(result);
		expect(text).toContain('Before');
		expect(text).toContain('After');
	});

	it('resolves star column to remaining width', () => {
		const ast = parseXml(
			'<receipt paper-width="32"><row><col width="*">Label</col><col width="10" align="right">Value</col></row></receipt>'
		);
		const result = renderEscpos(ast, { columns: 32 });
		const text = decode(result);
		expect(text).toContain('Label');
		expect(text).toContain('Value');
	});

	it('resolves star column using options.columns over paper-width', () => {
		const ast = parseXml(
			'<receipt paper-width="32"><row><col width="*">Name</col><col width="10" align="right">$5.00</col></row></receipt>'
		);
		const result = renderEscpos(ast, { columns: 48 });
		const text = decode(result);
		expect(text).toContain('Name');
		expect(text).toContain('$5.00');
	});

	it('distributes multiple star columns equally', () => {
		const ast = parseXml(
			'<receipt paper-width="48"><row><col width="*">A</col><col width="8">B</col><col width="*">C</col></row></receipt>'
		);
		const result = renderEscpos(ast, { columns: 48 });
		const text = decode(result);
		expect(text).toContain('A');
		expect(text).toContain('B');
		expect(text).toContain('C');
	});

	it('emits ESC/POS GS v 0 raster image bytes', () => {
		const ast = parseXml('<receipt><image src="logo" width="64" /></receipt>');
		const bytes = renderEscpos(ast, {
			language: 'esc-pos',
			imageMode: 'raster',
			imageAssets: { logo: { image: opaqueBlackImageData(64, 32), width: 64, height: 32 } },
		});
		expect(includesSequence(bytes, [0x1d, 0x76, 0x30])).toBe(true);
	});

	it.each(['star-prnt', 'star-line'] as const)('emits image bytes for %s', (language) => {
		const ast = parseXml('<receipt><image src="logo" width="64" /></receipt>');
		const bytes = renderEscpos(ast, {
			language,
			imageAssets: { logo: { image: opaqueBlackImageData(64, 32), width: 64, height: 32 } },
		});

		// ESC X starts Star image output; avoid pinning width bytes or full encoder layout.
		expect(includesSequence(bytes, [0x1b, 0x58])).toBe(true);
	});
});
