import { afterEach, vi } from 'vitest';

import { mapReceiptData } from '../map-receipt-data';
import { ReceiptDataSchema } from '../schema';
import { sampleReceiptData } from './fixtures';

import type { ReceiptData } from '../types';

/**
 * Offline rendering shape — non-canonical input (no nested `order` block).
 * Mirrors a producer that scatters order metadata at the top level so the
 * mapper can synthesise a canonical `order` block from those keys.
 */
const offlineReceiptData = {
	order_number: '1042',
	order_date: '2026-03-06T14:30:00',
	currency: 'USD',
	status: 'completed',
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
			taxes: [{ code: 'VAT', rate: '10', label: 'VAT 10%', compound: true, amount: '0.91' }],
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
		total: '25.00',
		total_incl: '25.00',
		total_excl: '22.73',
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
			taxes: [null, {}, { rate_code: 'VAT', tax_amount: '0.18', compound: true }],
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
	refunds: [
		null,
		{
			id: '10',
			amount: '4.50',
			reason: 'Customer return',
			refunded_by_id: '7',
			refunded_by_name: 'Sam',
			refunded_payment: true,
			lines: [{ name: 'Widget A', qty: '1', total: '4.50' }],
		},
	],
};

describe('mapReceiptData', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

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
					total: undefined,
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
			expect(result.totals.total).toBe(25);
			expect(result.presentation_hints).toEqual({
				display_tax: 'incl',
				prices_entered_with_tax: true,
				rounding_mode: 'round',
				locale: 'en-US',
				order_barcode_type: 'code128',
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
					total: undefined,
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
			expect(result.totals.total).toBe(sampleReceiptData.totals.total_excl);
		});

		it('detects canonical shape when both order and totals markers are present', () => {
			const data = {
				order: { id: 5, number: '5' },
				totals: { subtotal_incl: 10 },
			};
			const result = mapReceiptData(data);
			expect(result.order.id).toBe(5);
			expect(result.order.number).toBe('5');
			expect(result.totals.subtotal_incl).toBe(10);
			expect(result.presentation_hints.display_tax).toBe('incl');
		});

		it('fills missing date blocks on partial canonical order data', () => {
			const result = mapReceiptData({
				order: {
					id: 5,
					number: '5',
					currency: 'USD',
					customer_note: '',
					created: { datetime: '2026-03-06T14:30:00' },
				},
				totals: { subtotal_incl: 10 },
			});

			expect(result.order.created.datetime).toBe('2026-03-06T14:30:00');
			expect(result.order.created.date).toBe('');
			expect(result.order.paid.datetime).toBe('');
			expect(result.order.completed.datetime).toBe('');
			expect(ReceiptDataSchema.safeParse(result).success).toBe(true);
		});

		it('synthesizes printed datetime when canonical input omits it', () => {
			const printedAt = new Date('2026-05-08T12:34:00Z');
			vi.useFakeTimers();
			vi.setSystemTime(printedAt);

			const result = mapReceiptData({
				order: {
					id: 5,
					number: '5',
					currency: 'USD',
					customer_note: '',
					created: { datetime: '2026-03-06T14:30:00' },
				},
				store: { timezone: 'UTC' },
				totals: { subtotal_incl: 10 },
			});

			expect(result.order.printed.datetime).toBe('May 8, 2026, 12:34 PM');
			expect(ReceiptDataSchema.safeParse(result).success).toBe(true);
		});

		// ──────────────────────────────────────────────────────────────────
		// NO LEGACY COMPAT — these tests exist to lock the v1 contract and
		// catch any future PR that re-introduces a `grand_total*` bridge or
		// re-widens schema_version. If you find yourself "fixing" these
		// tests by adding fallbacks, stop and read the comment block at the
		// top of `mapTotals` in map-receipt-data.ts.
		// ──────────────────────────────────────────────────────────────────
		it('does NOT bridge legacy grand_total* keys (out-of-spec → zero totals)', () => {
			const outOfSpec = {
				...sampleReceiptData,
				totals: {
					subtotal: 25,
					subtotal_incl: 25,
					subtotal_excl: 22.73,
					discount_total: 0,
					discount_total_incl: 0,
					discount_total_excl: 0,
					tax_total: 2.27,
					// Renamed v1 keys absent on purpose; only legacy keys present.
					grand_total: 25,
					grand_total_incl: 25,
					grand_total_excl: 22.73,
					change_total: 0,
				},
			};
			const result = mapReceiptData(outOfSpec as Record<string, any>);

			// v1 contract: total_incl/excl are required; legacy keys are NOT a fallback.
			expect(result.totals.total_incl).toBe(0);
			expect(result.totals.total_excl).toBe(-2.27); // 0 - tax_total
			expect(result.totals.total).toBe(0);
		});

		it('does NOT translate legacy i18n.grand_total_incl_tax → total_incl_tax', () => {
			const outOfSpec = {
				...sampleReceiptData,
				i18n: {
					grand_total_incl_tax: 'Grand Total (incl. tax)',
				},
			};
			const result = mapReceiptData(outOfSpec as Record<string, any>);

			// The legacy key passes through (we don't drop unrecognized i18n keys),
			// but the canonical `total_incl_tax` is NOT auto-populated from it.
			expect(result.i18n?.total_incl_tax).toBeUndefined();
		});

		it('does not treat partial canonical markers as canonical', () => {
			// Only order marker, no totals marker — should map, not passthrough
			const data = { order: { id: 5, number: '5' }, totals: {} };
			const result = mapReceiptData(data);
			expect(result).not.toBe(data);
			expect(result.totals.total_incl).toBe(0);
		});
	});

	describe('mapping from offline rendering shape', () => {
		let mapped: ReceiptData;

		beforeAll(() => {
			mapped = mapReceiptData(offlineReceiptData);
		});

		it('synthesises order block from top-level offline keys', () => {
			expect(mapped.order.number).toBe('1042');
			expect(mapped.order.created.datetime).toBe('2026-03-06T14:30:00');
			expect(mapped.order.currency).toBe('USD');
			expect(mapped.order.id).toBe(0);
		});

		it('reads top-level wc_status / created_via from offline shape', () => {
			const result = mapReceiptData({
				wc_status: 'processing',
				created_via: 'checkout',
			});

			expect(result.order.wc_status).toBe('processing');
			expect(result.order.created_via).toBe('checkout');
		});

		it('prefers wc_status over legacy status when both are present', () => {
			const result = mapReceiptData({
				status: 'completed',
				wc_status: 'processing',
			});

			expect(result.order.wc_status).toBe('processing');
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
			expect(first.taxes).toEqual([
				{ code: 'VAT', rate: 10, label: 'VAT 10%', compound: true, amount: 0.91 },
			]);

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
			expect(mapped.totals.total_incl).toBe(25);
			expect(mapped.totals.subtotal_excl).toBeCloseTo(22.73, 2);
			expect(mapped.totals.total_excl).toBeCloseTo(22.73, 2);
			expect(mapped.totals.paid_total).toBe(25);
			expect(mapped.totals.change_total).toBe(0);
			expect(mapped.totals.subtotal).toBe(25);
			expect(mapped.totals.discount_total).toBe(0);
			expect(mapped.totals.total).toBe(25);
		});

		it('maps payments with method used as both id and title', () => {
			expect(mapped.payments).toHaveLength(1);
			const payment = mapped.payments[0];
			expect(payment.method_id).toBe('Cash');
			expect(payment.method_title).toBe('Cash');
			expect(payment.amount).toBe(25);
			expect(payment.transaction_id).toBe('txn-123');
		});

		it('maps payments transaction_id from legacy reference when transaction_id is missing', () => {
			const result = mapReceiptData({
				payments: [{ method: 'Card', amount: '10.00', reference: 'legacy-ref-1' }],
			});

			expect(result.payments[0]).toMatchObject({
				method_id: 'Card',
				method_title: 'Card',
				amount: 10,
				transaction_id: 'legacy-ref-1',
			});
		});

		it('falls back to legacy reference when transaction_id is blank', () => {
			const result = mapReceiptData({
				payments: [
					{
						method: 'Card',
						amount: '10.00',
						transaction_id: '',
						reference: 'legacy-ref-2',
					},
				],
			});

			expect(result.payments[0].transaction_id).toBe('legacy-ref-2');
		});

		it('maps fiscal with empty fiscal_id resulting in undefined immutable_id', () => {
			expect(mapped.fiscal.immutable_id).toBeUndefined();
		});

		it('provides default presentation_hints', () => {
			expect(mapped.presentation_hints.display_tax).toBe('incl');
			expect(mapped.presentation_hints.prices_entered_with_tax).toBe(true);
			expect(mapped.presentation_hints.rounding_mode).toBe('round');
			expect(mapped.presentation_hints.locale).toBe('en-US');
			expect(mapped.presentation_hints.order_barcode_type).toBe('code128');
		});

		it('normalizes QR barcode presentation hints from offline shape', () => {
			const result = mapReceiptData({
				presentation_hints: {
					order_barcode_type: ' QR ',
				},
			});

			expect(result.presentation_hints.order_barcode_type).toBe('qrcode');
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
					taxes: [{ code: 'VAT', rate: null, label: undefined, compound: true, amount: 0.18 }],
				},
			]);
			expect(mappedWithAdjustments.shipping).toEqual([
				{ label: 'Shipping', total: 3, total_incl: 3, total_excl: 2.73 },
			]);
			expect(mappedWithAdjustments.discounts).toEqual([
				{ label: 'Promo', total: 1.5, total_incl: 1.5, total_excl: 1.36 },
			]);
			expect(mappedWithAdjustments.refunds).toEqual([
				{
					id: 10,
					amount: 4.5,
					reason: 'Customer return',
					refunded_by_id: 7,
					refunded_by_name: 'Sam',
					refunded_payment: true,
					lines: [{ name: 'Widget A', sku: undefined, qty: 1, total: 4.5, line_total: 4.5 }],
				},
			]);
		});
	});

	describe('defensive handling of bad input', () => {
		it('returns empty structure for null input', () => {
			const result = mapReceiptData(null as any);
			expect(result.order.number).toBe('');
			expect(result.lines).toEqual([]);
			expect(result.payments).toEqual([]);
		});

		it('returns empty structure for undefined input', () => {
			const result = mapReceiptData(undefined as any);
			expect(result.order.number).toBe('');
		});

		it('returns empty structure for non-object input', () => {
			const result = mapReceiptData('string' as any);
			expect(result.totals.total_incl).toBe(0);
		});

		it('handles completely empty object', () => {
			const result = mapReceiptData({});
			expect(result.order.number).toBe('');
			expect(result.store.name).toBe('');
			expect(result.lines).toEqual([]);
			expect(result.totals.subtotal_incl).toBe(0);
		});

		it('handles missing nested objects gracefully', () => {
			const result = mapReceiptData({
				store: undefined,
				customer: 'not an object',
				lines: 'not an array',
				payments: 42,
				totals: false,
			});

			expect(result.order.number).toBe('');
			expect(result.store.name).toBe('');
			expect(result.customer.name).toBe('');
			expect(result.lines).toEqual([]);
			expect(result.payments).toEqual([]);
			expect(result.totals.total_incl).toBe(0);
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
					total_incl: NaN,
				},
			});
			expect(result.totals.subtotal_incl).toBe(0);
			expect(result.totals.tax_total).toBe(0);
			expect(result.totals.discount_total_incl).toBe(0);
			expect(result.totals.total_incl).toBe(0);
		});

		it('handles line with zero quantity without division-by-zero', () => {
			const result = mapReceiptData({
				lines: [{ name: 'Free Item', quantity: 0, price: 5, total: '0.00' }],
			});
			// qty is 0, so unit_price should fall back to price (5)
			expect(result.lines[0].unit_price_incl).toBe(5);
		});

		it('preserves price fallback when no line total is present', () => {
			const result = mapReceiptData({
				lines: [{ name: 'Priced Item', quantity: 2, price: 5 }],
			});

			expect(result.lines[0].unit_price_incl).toBe(5);
			expect(result.lines[0].unit_price).toBe(5);
		});

		it('falls back to price when line total is not numeric', () => {
			const result = mapReceiptData({
				lines: [{ name: 'Priced Item', quantity: 2, price: 5, total: 'not a number' }],
			});

			expect(result.lines[0].unit_price_incl).toBe(5);
			expect(result.lines[0].unit_price).toBe(5);
		});

		it('derives unit price for negative-quantity refund lines', () => {
			const result = mapReceiptData({
				lines: [{ name: 'Refunded Item', quantity: -2, price: 0, total: '-20.00' }],
			});

			expect(result.lines[0].unit_price_incl).toBe(10);
			expect(result.lines[0].unit_price).toBe(10);
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
