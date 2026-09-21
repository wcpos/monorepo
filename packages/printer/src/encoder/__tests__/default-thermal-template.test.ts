import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { encodeReceipt } from '../encode-receipt';
import { sampleReceiptData } from './fixtures';

import type { ReceiptData } from '../types';

function encodeToText(data: ReceiptData): string {
	return new TextDecoder().decode(encodeReceipt(data));
}

function withTotals(overrides: Partial<ReceiptData['totals']>): ReceiptData {
	return {
		...sampleReceiptData,
		totals: { ...sampleReceiptData.totals, ...overrides },
	};
}

describe('DEFAULT_THERMAL_TEMPLATE Total saved row', () => {
	it('renders the row when savings are complete and non-zero', () => {
		const text = encodeToText(
			withTotals({
				total_saved: 10.28,
				total_saved_incl: 10.28,
				total_saved_excl: 9.35,
				total_saved_complete: true,
			})
		);
		expect(text).toContain('Total saved');
		expect(text).toContain('10.28');
	});

	it('hides the row when savings are zero', () => {
		const text = encodeToText(
			withTotals({
				total_saved: 0,
				total_saved_incl: 0,
				total_saved_excl: 0,
				total_saved_complete: true,
			})
		);
		expect(text).not.toContain('Total saved');
	});

	it('hides the row when only the exclusive figure is known', () => {
		const text = encodeToText(
			withTotals({
				total_saved: 9.35,
				total_saved_incl: null,
				total_saved_excl: 9.35,
				total_saved_complete: true,
			})
		);
		expect(text).not.toContain('Total saved');
	});

	it('hides the row when a positive total is incomplete', () => {
		const text = encodeToText(
			withTotals({
				total_saved: 10.28,
				total_saved_incl: 10.28,
				total_saved_excl: 9.35,
				total_saved_complete: false,
			})
		);
		expect(text).not.toContain('Total saved');
	});

	it('hides the row when the total is incomplete (null on legacy orders)', () => {
		const text = encodeToText(
			withTotals({
				total_saved: null,
				total_saved_incl: null,
				total_saved_excl: null,
				total_saved_complete: false,
			})
		);
		expect(text).not.toContain('Total saved');
	});
});

it('prints a refund as a credit note with correction identity and payment heading', () => {
	const text = encodeToText({
		...sampleReceiptData,
		fiscal: {
			document_type: 'refund',
			document_label: 'Refund',
			corrects: 'SALE-1',
			is_refund_document: true,
		},
	});
	expect(text).toContain('Refund');
	expect(text).not.toContain('SALES RECEIPT');
	expect(text).toContain('Corrects SALE-1');
	expect(text).toContain('Refunded to');
});

it('preserves the sale receipt bytes recorded before refund support', () => {
	expect(createHash('sha256').update(encodeReceipt(sampleReceiptData)).digest('hex')).toBe(
		'8c5ce7e0c6c9f753d1633a18b31e2da7b6b5a7463fc94d74a69146b09742bbfe'
	);
});
