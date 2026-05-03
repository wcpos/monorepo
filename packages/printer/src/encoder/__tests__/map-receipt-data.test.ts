import { mapReceiptData } from '../map-receipt-data';
import { ReceiptDataSchema } from '../schema';
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
			unit_price: '5.00',
			unit_price_incl: '5.00',
			unit_price_excl: '4.55',
			total: '10.00',
			line_subtotal: '10.00',
			line_subtotal_incl: '10.00',
			line_subtotal_excl: '9.09',
			discounts: '0.00',
			discounts_incl: '0.00',
			discounts_excl: '0.00',
			line_total: '10.00',
			line_total_incl: '10.00',
			line_total_excl: '9.09',
			sku: 'SKU-001',
			meta: [{ key: 'size', value: 'M' }],
		},
		{
			name: 'Gadget B',
			quantity: 1,
			price: 15.0,
			unit_price: '15.00',
			unit_price_incl: '15.00',
			unit_price_excl: '13.64',
			total: '15.00',
			line_subtotal: '15.00',
			line_subtotal_incl: '15.00',
			line_subtotal_excl: '13.64',
			discounts: '0.00',
			discounts_incl: '0.00',
			discounts_excl: '0.00',
			line_total: '15.00',
			line_total_incl: '15.00',
			line_total_excl: '13.64',
			sku: 'SKU-002',
			meta: [],
		},
	],
	totals: {
		subtotal: '25.00',
		subtotal_incl: '25.00',
		subtotal_excl: '22.73',
		tax_total: '2.27',
		discount_total: '0.00',
		discount_total_incl: '0.00',
		discount_total_excl: '0.00',
		grand_total: '25.00',
		grand_total_incl: '25.00',
		grand_total_excl: '22.73',
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
	presentation_hints: {
		display_tax: 'incl',
		prices_entered_with_tax: true,
		rounding_mode: 'round',
		locale: 'en-US',
	},
};

const offlineReceiptDataWithAdjustments = {
	...offlineReceiptData,
	fees: [
		{
			label: 'Service Fee',
			total_incl: '2.00',
			total_excl: '1.82',
			meta: [null, {}, { display_key: 'Type', display_value: 'Handling' }],
			taxes: [null, {}, { rate_code: 'VAT', tax_amount: '0.18' }],
		},
	],
	shipping: [
		{
			label: 'Shipping',
			total: '3.00',
			total_excl: '2.73',
			total_incl: '3.00',
			meta: [null, {}],
			taxes: [null, {}],
		},
	],
	discounts: [{ label: 'Promo', total_incl: '1.50', total_excl: '1.36' }],
};

describe('mapReceiptData', () => {
	describe('passthrough for canonical shape', () => {
		it('normalizes canonical data so aliases and defaults are available', () => {
			const legacyCanonical = {
				...sampleReceiptData,
				lines: sampleReceiptData.lines.map(
					({ unit_price, line_subtotal, discounts, line_total, ...line }) => line
				),
				fees: [{ label: 'Service Fee', total_incl: 2, total_excl: 1.82 }],
				shipping: [{ label: 'Shipping', total_incl: 3, total_excl: 2.73 }],
				discounts: [{ label: 'Promo', total_incl: 1.5, total_excl: 1.36 }],
				totals: {
					...sampleReceiptData.totals,
					subtotal: undefined,
					discount_total: undefined,
					grand_total: undefined,
				},
				presentation_hints: undefined,
			};
			const result = mapReceiptData(legacyCanonical as Record<string, any>);

			expect(result).not.toBe(legacyCanonical);
			expect(result.lines[0].unit_price).toBe(5);
			expect(result.lines[0].line_subtotal).toBe(10);
			expect(result.lines[0].discounts).toBe(0);
			expect(result.lines[0].line_total).toBe(10);
			expect(result.totals.subtotal).toBe(25);
			expect(result.totals.discount_total).toBe(0);
			expect(result.totals.grand_total).toBe(25);
			expect(result.presentation_hints).toEqual({
				display_tax: 'incl',
				prices_entered_with_tax: true,
				rounding_mode: 'round',
				locale: 'en-US',
			});
			expect(result.fees[0]).toEqual({
				label: 'Service Fee',
				total: 2,
				total_incl: 2,
				total_excl: 1.82,
			});
		});

		it('falls back to prices_entered_with_tax when display_tax is hidden', () => {
			const legacyCanonical = {
				...sampleReceiptData,
				lines: sampleReceiptData.lines.map(
					({ unit_price, line_subtotal, discounts, line_total, ...line }) => line
				),
				fees: [{ label: 'Service Fee', total_incl: 2, total_excl: 1.82 }],
				shipping: [{ label: 'Shipping', total_incl: 3, total_excl: 2.73 }],
				discounts: [{ label: 'Promo', total_incl: 1.5, total_excl: 1.36 }],
				totals: {
					...sampleReceiptData.totals,
					subtotal: undefined,
					discount_total: undefined,
					grand_total: undefined,
				},
				presentation_hints: {
					display_tax: 'hidden',
					prices_entered_with_tax: false,
					rounding_mode: 'round',
					locale: 'en-US',
				},
			};

			const result = mapReceiptData(legacyCanonical as Record<string, any>);

			expect(result.presentation_hints.display_tax).toBe('hidden');
			expect(result.lines[0].unit_price).toBe(sampleReceiptData.lines[0].unit_price_excl);
			expect(result.lines[0].line_subtotal).toBe(sampleReceiptData.lines[0].line_subtotal_excl);
			expect(result.lines[0].line_total).toBe(sampleReceiptData.lines[0].line_total_excl);
			expect(result.fees[0].total).toBe(1.82);
			expect(result.shipping[0].total).toBe(2.73);
			expect(result.discounts[0].total).toBe(1.36);
			expect(result.totals.subtotal).toBe(sampleReceiptData.totals.subtotal_excl);
			expect(result.totals.discount_total).toBe(sampleReceiptData.totals.discount_total_excl);
			expect(result.totals.grand_total).toBe(sampleReceiptData.totals.grand_total_excl);
		});

		it('detects canonical shape when both meta and totals markers are present', () => {
			const data = {
				meta: { schema_version: 1, order_id: 5 },
				totals: { subtotal_incl: 10 },
			};
			const result = mapReceiptData(data);
			expect(result.meta.schema_version).toBe(1);
			expect(result.meta.order_id).toBe(5);
			expect(result.totals.subtotal_incl).toBe(10);
			expect(result.presentation_hints.display_tax).toBe('incl');
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
			expect(first.unit_price).toBe(5);
			expect(first.line_subtotal).toBe(10);
			expect(first.discounts).toBe(0);
			expect(first.line_total).toBe(10);
			expect(first.meta).toEqual([{ key: 'size', value: 'M' }]);

			const second = mapped.lines[1];
			expect(second.name).toBe('Gadget B');
			expect(second.qty).toBe(1);
			expect(second.line_total_incl).toBe(15);
			expect(second.unit_price_incl).toBe(15); // 15 / 1
			expect(second.unit_price).toBe(15);
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
			expect(mapped.totals.subtotal).toBe(25);
			expect(mapped.totals.discount_total).toBe(0);
			expect(mapped.totals.grand_total).toBe(25);
		});

		it('maps payments with method used as both id and title', () => {
			expect(mapped.payments).toHaveLength(1);
			const payment = mapped.payments[0];
			expect(payment.method_id).toBe('Cash');
			expect(payment.method_title).toBe('Cash');
			expect(payment.amount).toBe(25);
			expect(payment.transaction_id).toBe('txn-123');
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

		it('maps fees, shipping, and discounts with display-aware totals', () => {
			const mappedWithAdjustments = mapReceiptData(offlineReceiptDataWithAdjustments);

			expect(mappedWithAdjustments.fees).toEqual([
				{
					label: 'Service Fee',
					total: 2,
					total_incl: 2,
					total_excl: 1.82,
					meta: [{ key: 'Type', value: 'Handling' }],
					taxes: [{ code: 'VAT', amount: 0.18 }],
				},
			]);
			expect(mappedWithAdjustments.shipping).toEqual([
				{ label: 'Shipping', total: 3, total_incl: 3, total_excl: 2.73 },
			]);
			expect(mappedWithAdjustments.discounts).toEqual([
				{ label: 'Promo', total: 1.5, total_incl: 1.5, total_excl: 1.36 },
			]);
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

	describe('fiscal extra_fields', () => {
		const cases: [string, ReceiptData['fiscal']['extra_fields']][] = [
			['empty array', []],
			['array entries', [{ key: 'terminal_id', value: 'T-100' }]],
			['empty record', {}],
			['record entries', { terminal_id: 'T-100', sequence: 42 }],
		];

		for (const [label, extraFields] of cases) {
			it(`accepts ${label}`, () => {
				const data: ReceiptData = {
					...sampleReceiptData,
					fiscal: {
						...sampleReceiptData.fiscal,
						extra_fields: extraFields,
					},
				};

				const mapped = mapReceiptData(data as Record<string, any>);
				expect(mapped.fiscal.extra_fields).toEqual(extraFields);
				expect(ReceiptDataSchema.safeParse(mapped).success).toBe(true);
			});
		}
	});
});
