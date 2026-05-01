import { describe, expect, it } from 'vitest';

import { decodeEscposBytes } from '../lib/escpos-decoder';

describe('escpos-decoder', () => {
	it('decodes ESC @ as init printer', () => {
		const segments = decodeEscposBytes(new Uint8Array([0x1b, 0x40]));
		expect(segments).toEqual([
			{ offset: 0, hex: '1B 40', ascii: '.@', decoded: 'ESC 40 — init printer' },
		]);
	});

	it('decodes alignment commands', () => {
		const segments = decodeEscposBytes(new Uint8Array([0x1b, 0x61, 0x01]));
		expect(segments[0]?.decoded).toBe('ESC 61 — align center');
	});

	it('coalesces printable text into a single segment', () => {
		const segments = decodeEscposBytes(new Uint8Array([0x48, 0x69, 0x21]));
		expect(segments).toHaveLength(1);
		expect(segments[0]?.decoded).toBe('text: "Hi!"');
	});

	it('decodes line feeds', () => {
		const segments = decodeEscposBytes(new Uint8Array([0x41, 0x0a]));
		expect(segments[1]?.decoded).toBe('line feed');
	});

	it('decodes GS V cut command', () => {
		const segments = decodeEscposBytes(new Uint8Array([0x1d, 0x56, 0x01, 0x00]));
		expect(segments[0]?.decoded).toBe('GS 56 — partial cut');
	});

	it('flags unknown ESC opcodes', () => {
		const segments = decodeEscposBytes(new Uint8Array([0x1b, 0xff]));
		expect(segments[0]?.decoded).toBe('ESC ?');
	});
});
