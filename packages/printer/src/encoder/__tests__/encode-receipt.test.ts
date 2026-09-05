import { vi } from 'vitest';

import { encodeReceipt } from '../encode-receipt';
import { formatMoney } from '../format-money';
import { sampleReceiptData } from './fixtures';

const { warn } = vi.hoisted(() => ({
	warn: vi.fn<(message: string, options: { context: { count: number } }) => void>(),
}));
vi.mock('../../logger', () => ({
	printerLogger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
}));

describe('encodeReceipt', () => {
	function encodeCurrency(currency: string): Uint8Array {
		const data = structuredClone(sampleReceiptData);
		data.order.currency = currency;
		return encodeReceipt(data);
	}

	it('returns a Uint8Array', () => {
		const result = encodeReceipt(sampleReceiptData);
		expect(result).toBeInstanceOf(Uint8Array);
		expect(result.length).toBeGreaterThan(0);
	});

	it('contains store name in encoded output', () => {
		const result = encodeReceipt(sampleReceiptData);
		const text = new TextDecoder().decode(result);
		expect(text).toContain('My Test Store');
	});

	it('includes line items', () => {
		const result = encodeReceipt(sampleReceiptData);
		const text = new TextDecoder().decode(result);
		expect(text).toContain('Widget A');
		expect(text).toContain('Gadget B');
	});

	it('includes the total', () => {
		const result = encodeReceipt(sampleReceiptData);
		const text = new TextDecoder().decode(result);
		expect(text).toContain('TOTAL');
		expect(text).toContain('25.00');
	});

	it('uses the locale currency symbol instead of the bare ISO code', () => {
		const result = encodeCurrency('USD');
		const text = new TextDecoder().decode(result);
		expect(text).toContain('$25.00');
		expect(text).not.toContain('USD');
		expect(Array.from(result)).not.toContain(0x3f);
	});

	it('uses ISO currency text when the INR symbol would be substituted', () => {
		const result = encodeCurrency('INR');
		const text = new TextDecoder().decode(result);
		expect(text).toContain('INR 25.00');
		expect(Array.from(result)).not.toContain(0x3f);
	});

	it('warns once per job with the number of substituted characters', () => {
		warn.mockClear();
		encodeCurrency('INR');

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith('Unencodable characters substituted', {
			context: { count: expect.any(Number), language: 'esc-pos', codepage: 'auto' },
		});
		expect(warn.mock.calls[0]?.[1]?.context.count).toBeGreaterThan(0);
	});

	it('stays quiet when every character encodes', () => {
		warn.mockClear();
		encodeCurrency('USD');

		expect(warn).not.toHaveBeenCalled();
	});

	it('keeps the encodable EUR symbol instead of falling back by code point', () => {
		const result = encodeCurrency('EUR');
		const text = new TextDecoder().decode(result);
		expect(text).not.toContain('EUR');
		// receipt-printer-encoder maps EUR through an ESC/POS code page as 0xd5.
		expect(Array.from(result)).toContain(0xd5);
		expect(Array.from(result)).not.toContain(0x3f);
	});

	it('honours three configured decimal places', () => {
		const text = new TextDecoder().decode(encodeReceipt(sampleReceiptData, { decimals: 3 }));
		expect(text).toContain('$25.000');
	});

	it('honours zero configured decimal places', () => {
		const text = new TextDecoder().decode(encodeReceipt(sampleReceiptData, { decimals: 0 }));
		expect(text).toContain('$25');
		expect(text).not.toContain('$25.00');
	});

	it('uses the currency fraction default when decimals are omitted', () => {
		expect(formatMoney(25, 'JPY', 'ja-JP')).toBe('￥25');
	});

	it('includes payment info', () => {
		const result = encodeReceipt(sampleReceiptData);
		const text = new TextDecoder().decode(result);
		expect(text).toContain('Cash');
	});

	it('respects columns option for 58mm paper', () => {
		const result80 = encodeReceipt(sampleReceiptData, { columns: 48 });
		const result58 = encodeReceipt(sampleReceiptData, { columns: 32 });
		// Both produce valid output; the column count changes line layout
		expect(result58).toBeInstanceOf(Uint8Array);
		expect(result80).toBeInstanceOf(Uint8Array);
		expect(result58.length).toBeGreaterThan(0);
		expect(result80.length).toBeGreaterThan(0);
		// Outputs should differ since column widths are different
		expect(result58.length).not.toEqual(result80.length);
	});

	it('respects language option for StarPRNT', () => {
		const result = encodeReceipt(sampleReceiptData, { language: 'star-prnt' });
		expect(result).toBeInstanceOf(Uint8Array);
		expect(result.length).toBeGreaterThan(0);
	});

	it('includes cut command by default', () => {
		const result = encodeReceipt(sampleReceiptData);
		// GS V (partial cut) = 0x1D 0x56
		const bytes = Array.from(result);
		const hasCut = bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x56);
		expect(hasCut).toBe(true);
	});

	it('skips cut when cut=false', () => {
		const result = encodeReceipt(sampleReceiptData, { cut: false });
		const bytes = Array.from(result);
		const hasCut = bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x56);
		expect(hasCut).toBe(false);
	});
	it('selects Font A in the job header so the column count means what it says', () => {
		const bytes = Array.from(encodeReceipt(sampleReceiptData));
		const fontSelects = bytes.flatMap((byte, index) =>
			byte === 0x1b && bytes[index + 1] === 0x4d ? [index] : []
		);

		expect(bytes[0]).toBe(0x1b);
		expect(bytes[1]).toBe(0x40);
		// Exactly once, in the header, before any text.
		expect(fontSelects).toHaveLength(1);
		expect(fontSelects[0]).toBeLessThan(8);
		expect(bytes[fontSelects[0]! + 2]).toBe(0x00);
	});

	it('emits no ESC M for a Star job', () => {
		const bytes = Array.from(encodeReceipt(sampleReceiptData, { language: 'star-prnt' }));

		expect(bytes.some((byte, index) => byte === 0x1b && bytes[index + 1] === 0x4d)).toBe(false);
	});

	it('names the profile code page on the substitution warning', () => {
		warn.mockClear();
		const data = structuredClone(sampleReceiptData);
		data.order.currency = 'INR';
		encodeReceipt(data, { codePage: 'cp437' });

		expect(warn).toHaveBeenCalledWith('Unencodable characters substituted', {
			context: { count: expect.any(Number), language: 'esc-pos', codepage: 'cp437' },
		});
	});

	it('falls back to the automatic code page when the profile names an unknown one', () => {
		warn.mockClear();
		const result = encodeReceipt(sampleReceiptData, { codePage: 'cp-not-a-page' });

		expect(result.length).toBeGreaterThan(0);
		expect(warn).toHaveBeenCalledWith('Unknown code page', {
			context: { codePage: 'cp-not-a-page', language: 'esc-pos' },
		});
	});
});
