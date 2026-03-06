import { mapReceiptData } from '../map-receipt-data';
import { sampleReceiptData } from './fixtures';

import type { ReceiptData } from '../types';

/**
 * Offline rendering shape — mirrors what buildReceiptData() produces
 * in core/src/screens/main/receipt/utils/build-receipt-data.ts
 */
const offlineReceiptData = {
	meta: {
		order_number: '1042',
		order_date: '2026-03-06T14:30:00',
		currency: 'USD',
		status: 'completed',
	},
	store: {
		name: 'My Test Store',
		address: '123 Main Street, Suite 100, Springfield, IL 62704',
		phone: '(555) 123-4567',
		email: 'store@example.com',
	},
	customer: {
		name: 'John Doe',
		email: 'john@example.com',
		phone: '(555) 987-6543',
		billing_address: '456 Elm St, Springfield, IL 62704',
		shipping_address: '789 Oak Ave, Springfield, IL 62704',
	},
	lines: [
		{
			name: 'Widget A',
			quantity: 2,
			price: 5.0,
			total: '10.00',
			sku: 'SKU-001',
		},
		{
			name: 'Gadget B',
			quantity: 1,
			price: 15.0,
			total: '15.00',
			sku: 'SKU-002',
		},
	],
	totals: {
		subtotal: '25.00',
		tax_total: '2.27',
		discount_total: '0.00',
		grand_total_incl: '25.00',
	},
	payments: [
		{
			method: 'Cash',
			amount: '25.00',
			transaction_id: 'txn-123',
		},
	],
	fiscal: {
		submission_status: '',
		fiscal_id: '',
	},
};

describe('mapReceiptData', () => {
	describe('passthrough for canonical shape', () => {
		it('returns canonical data as-is when it already matches the encoder shape', () => {
			const result = mapReceiptData(sampleReceiptData as Record<string, any>);
			expect(result).toBe(sampleReceiptData);
		});

		it('detects canonical shape when both meta and totals markers are present', () => {
			const data = {
				meta: { schema_version: 1, order_id: 5 },
				totals: { subtotal_incl: 10 },
			};
			const result = mapReceiptData(data);
			// Should pass through (same reference) because isCanonicalShape returns true
			expect(result).toBe(data);
		});

		it('does not treat partial canonical markers as canonical', () => {
			// Only meta markers, no totals marker — should map, not passthrough
			const data = { meta: { order_id: 5 }, totals: {} };
			const result = mapReceiptData(data);
			expect(result).not.toBe(data);
			expect(result.meta.schema_version).toBe(1);
		});
	});

	describe('mapping from offline rendering shape', () => {
		let mapped: ReceiptData;

		beforeAll(() => {
			mapped = mapReceiptData(offlineReceiptData);
		});

		it('maps meta fields correctly', () => {
			expect(mapped.meta.order_number).toBe('1042');
			expect(mapped.meta.created_at_gmt).toBe('2026-03-06T14:30:00');
			expect(mapped.meta.currency).toBe('USD');
			expect(mapped.meta.schema_version).toBe(1);
			expect(mapped.meta.order_id).toBe(0);
		});

		it('maps store fields and splits address into lines', () => {
			expect(mapped.store.name).toBe('My Test Store');
			expect(mapped.store.address_lines).toEqual([
				'123 Main Street',
				'Suite 100',
				'Springfield',
				'IL 62704',
			]);
			expect(mapped.store.phone).toBe('(555) 123-4567');
			expect(mapped.store.email).toBe('store@example.com');
		});

		it('maps customer fields', () => {
			expect(mapped.customer.name).toBe('John Doe');
			expect(mapped.customer.id).toBe(0);
			expect(mapped.customer.billing_address).toEqual({});
			expect(mapped.customer.shipping_address).toEqual({});
		});

		it('provides a default cashier', () => {
			expect(mapped.cashier).toEqual({ id: 0, name: '' });
		});

		it('maps line items with numeric coercion', () => {
			expect(mapped.lines).toHaveLength(2);

			const first = mapped.lines[0];
			expect(first.name).toBe('Widget A');
			expect(first.qty).toBe(2);
			expect(first.sku).toBe('SKU-001');
			expect(first.line_total_incl).toBe(10);
			expect(first.unit_price_incl).toBe(5); // 10 / 2

			const second = mapped.lines[1];
			expect(second.name).toBe('Gadget B');
			expect(second.qty).toBe(1);
			expect(second.line_total_incl).toBe(15);
			expect(second.unit_price_incl).toBe(15); // 15 / 1
		});

		it('maps totals from string values', () => {
			expect(mapped.totals.subtotal_incl).toBe(25);
			expect(mapped.totals.tax_total).toBe(2.27);
			expect(mapped.totals.discount_total_incl).toBe(0);
			expect(mapped.totals.grand_total_incl).toBe(25);
			expect(mapped.totals.subtotal_excl).toBeCloseTo(22.73, 2);
			expect(mapped.totals.grand_total_excl).toBeCloseTo(22.73, 2);
			expect(mapped.totals.paid_total).toBe(25);
			expect(mapped.totals.change_total).toBe(0);
		});

		it('maps payments with method used as both id and title', () => {
			expect(mapped.payments).toHaveLength(1);
			const payment = mapped.payments[0];
			expect(payment.method_id).toBe('Cash');
			expect(payment.method_title).toBe('Cash');
			expect(payment.amount).toBe(25);
			expect(payment.reference).toBe('txn-123');
		});

		it('maps fiscal with empty fiscal_id resulting in undefined immutable_id', () => {
			expect(mapped.fiscal.immutable_id).toBeUndefined();
		});

		it('provides default presentation_hints', () => {
			expect(mapped.presentation_hints.display_tax).toBe('incl');
			expect(mapped.presentation_hints.prices_entered_with_tax).toBe(true);
			expect(mapped.presentation_hints.rounding_mode).toBe('round');
			expect(mapped.presentation_hints.locale).toBe('en-US');
		});

		it('defaults fees, shipping, discounts, and tax_summary to empty arrays', () => {
			expect(mapped.fees).toEqual([]);
			expect(mapped.shipping).toEqual([]);
			expect(mapped.discounts).toEqual([]);
			expect(mapped.tax_summary).toEqual([]);
		});
	});

	describe('defensive handling of bad input', () => {
		it('returns empty structure for null input', () => {
			const result = mapReceiptData(null as any);
			expect(result.meta.order_number).toBe('');
			expect(result.lines).toEqual([]);
			expect(result.payments).toEqual([]);
		});

		it('returns empty structure for undefined input', () => {
			const result = mapReceiptData(undefined as any);
			expect(result.meta.schema_version).toBe(1);
		});

		it('returns empty structure for non-object input', () => {
			const result = mapReceiptData('string' as any);
			expect(result.totals.grand_total_incl).toBe(0);
		});

		it('handles completely empty object', () => {
			const result = mapReceiptData({});
			expect(result.meta.order_number).toBe('');
			expect(result.store.name).toBe('');
			expect(result.lines).toEqual([]);
			expect(result.totals.subtotal_incl).toBe(0);
		});

		it('handles missing nested objects gracefully', () => {
			const result = mapReceiptData({
				meta: null,
				store: undefined,
				customer: 'not an object',
				lines: 'not an array',
				payments: 42,
				totals: false,
			});

			expect(result.meta.order_number).toBe('');
			expect(result.store.name).toBe('');
			expect(result.customer.name).toBe('');
			expect(result.lines).toEqual([]);
			expect(result.payments).toEqual([]);
			expect(result.totals.grand_total_incl).toBe(0);
		});

		it('handles line items with missing fields', () => {
			const result = mapReceiptData({
				lines: [{}],
			});
			const line = result.lines[0];
			expect(line.name).toBe('');
			expect(line.qty).toBe(0);
			expect(line.line_total_incl).toBe(0);
			expect(line.unit_price_incl).toBe(0);
		});

		it('handles NaN-producing numeric values', () => {
			const result = mapReceiptData({
				totals: {
					subtotal: 'not a number',
					tax_total: undefined,
					discount_total: null,
					grand_total_incl: NaN,
				},
			});
			expect(result.totals.subtotal_incl).toBe(0);
			expect(result.totals.tax_total).toBe(0);
			expect(result.totals.discount_total_incl).toBe(0);
			expect(result.totals.grand_total_incl).toBe(0);
		});

		it('handles line with zero quantity without division-by-zero', () => {
			const result = mapReceiptData({
				lines: [{ name: 'Free Item', quantity: 0, price: 5, total: '0.00' }],
			});
			// qty is 0, so unit_price should fall back to price (5)
			expect(result.lines[0].unit_price_incl).toBe(5);
		});
	});

	describe('store address splitting', () => {
		it('handles store with no address', () => {
			const result = mapReceiptData({ store: { name: 'Shop' } });
			expect(result.store.address_lines).toEqual([]);
		});

		it('handles store with empty address string', () => {
			const result = mapReceiptData({ store: { address: '' } });
			expect(result.store.address_lines).toEqual([]);
		});

		it('handles single-part address without commas', () => {
			const result = mapReceiptData({ store: { address: '123 Main St' } });
			expect(result.store.address_lines).toEqual(['123 Main St']);
		});
	});

	describe('fiscal with actual fiscal_id', () => {
		it('maps fiscal_id to immutable_id', () => {
			const result = mapReceiptData({
				fiscal: { fiscal_id: 'FISC-001', submission_status: 'submitted' },
			});
			expect(result.fiscal.immutable_id).toBe('FISC-001');
		});
	});
});
