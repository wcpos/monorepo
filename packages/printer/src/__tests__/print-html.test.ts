import { describe, expect, it } from 'vitest';

import { buildPrintableReceiptHtml, normalizeReceiptPaperWidth } from '../print-html';

describe('normalizeReceiptPaperWidth', () => {
	it.each([
		['58mm', '58mm'],
		['80mm', '80mm'],
		['a4', 'a4'],
		['A4', 'a4'],
		[null, 'a4'],
		[undefined, 'a4'],
		['letter', 'a4'],
	])('normalizes %s to %s', (input, expected) => {
		expect(normalizeReceiptPaperWidth(input)).toBe(expected);
	});
});

describe('buildPrintableReceiptHtml', () => {
	it('wraps A4 output with zero browser margins and a 210mm content width', () => {
		const html = buildPrintableReceiptHtml({
			bodyHtml: '<main class="invoice">Hello</main>',
			paperWidth: 'a4',
		});

		expect(html).toContain('@page { size: A4; margin: 0; }');
		expect(html).toContain('body > * { width: 210mm; }');
		expect(html).toContain('<main class="invoice">Hello</main>');
	});

	it('wraps 80mm thermal output with physical page size and no A4 width rule', () => {
		const html = buildPrintableReceiptHtml({
			bodyHtml: '<div class="receipt">Thermal</div>',
			paperWidth: '80mm',
		});

		expect(html).toContain('@page { size: 80mm auto; margin: 0; }');
		expect(html).not.toContain('body > * { width: 210mm; }');
		expect(html).toContain('<div class="receipt">Thermal</div>');
	});

	it('keeps print mechanics outside user template content', () => {
		const html = buildPrintableReceiptHtml({
			bodyHtml: '<style>.receipt{padding:24px}</style><div class="receipt">User CSS</div>',
			paperWidth: 'a4',
		});

		expect(html).toContain('<style>.receipt{padding:24px}</style>');
		expect(html).toContain('print-color-adjust: exact');
	});
});
