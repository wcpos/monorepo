import { describe, expect, it } from 'vitest';

import { mapReceiptData } from '../map-receipt-data';
import { ReceiptDataSchema, ReceiptDisplayTaxSchema } from '../schema';
import { sampleReceiptData } from './fixtures';

describe('ReceiptDataSchema', () => {
	it('parses the canonical fixture without errors', () => {
		const result = ReceiptDataSchema.safeParse(sampleReceiptData);
		expect(result.success).toBe(true);
	});

	it('parses and preserves order payment-state fields', () => {
		const result = ReceiptDataSchema.safeParse({
			...sampleReceiptData,
			order: {
				...sampleReceiptData.order,
				needs_payment: true,
				payment_url: 'https://example.test/checkout/order-pay/1042',
			},
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error(result.error.message);
		expect(result.data.order.needs_payment).toBe(true);
		expect(result.data.order.payment_url).toBe('https://example.test/checkout/order-pay/1042');
	});

	it('parses output of mapReceiptData', () => {
		const mapped = mapReceiptData(sampleReceiptData as unknown as Record<string, unknown>);
		const result = ReceiptDataSchema.safeParse(mapped);
		expect(result.success).toBe(true);
	});

	it('maps store.id to an integer', () => {
		const mapped = mapReceiptData({ store: { id: '42.9' } });
		expect(mapped.store.id).toBe(42);
		expect(ReceiptDataSchema.safeParse(mapped).success).toBe(true);
	});

	it('falls back to 0 for non-numeric store.id primitives', () => {
		for (const id of [true, false, 'true', '42abc', '1e2', '']) {
			const mapped = mapReceiptData({ store: { id } });
			expect(mapped.store.id).toBe(0);
			expect(ReceiptDataSchema.safeParse(mapped).success).toBe(true);
		}
	});

	it('maps structured store tax IDs', () => {
		const mapped = mapReceiptData({
			store: {
				tax_ids: [
					{ type: 'other', value: 'TAX-123', country: 'US', label: 'Tax ID' },
					{ type: 'custom_tax_id', value: 'CUSTOM-456' },
					{ type: '', value: 'missing-type' },
					{ type: 'other', value: '' },
					null,
				],
			},
		});

		expect(mapped.store.tax_ids).toEqual([
			{ type: 'other', value: 'TAX-123', country: 'US', label: 'Tax ID' },
			{ type: 'custom_tax_id', value: 'CUSTOM-456' },
		]);
		expect(ReceiptDataSchema.safeParse(mapped).success).toBe(true);
	});

	it('normalizes canonical store and customer tax ID fields', () => {
		const canonical = JSON.parse(JSON.stringify(sampleReceiptData));
		canonical.store.id = '42.9';
		canonical.store.tax_id = 'STORE-TAX-123';
		delete canonical.store.tax_ids;
		canonical.customer.tax_id = 'CUSTOMER-TAX-456';

		const mapped = mapReceiptData(canonical);

		expect(mapped.store.id).toBe(42);
		expect(mapped.store.address_lines).toEqual(sampleReceiptData.store.address_lines);
		expect(mapped.store).not.toHaveProperty('tax_id');
		expect(mapped.store.tax_ids).toEqual([{ type: 'other', value: 'STORE-TAX-123' }]);
		expect(mapped.customer).not.toHaveProperty('tax_id');
		expect(mapped.customer.tax_ids).toEqual([{ type: 'other', value: 'CUSTOMER-TAX-456' }]);
		expect(ReceiptDataSchema.safeParse(mapped).success).toBe(true);
	});

	it('rejects missing required top-level keys', () => {
		const broken = { ...sampleReceiptData } as Record<string, unknown>;
		delete broken.totals;
		const result = ReceiptDataSchema.safeParse(broken);
		expect(result.success).toBe(false);
	});

	it('rejects wrong-typed numeric field', () => {
		const broken = JSON.parse(JSON.stringify(sampleReceiptData));
		broken.totals.total_incl = 'not-a-number';
		const result = ReceiptDataSchema.safeParse(broken);
		expect(result.success).toBe(false);
	});

	it('rejects invalid display_tax enum', () => {
		expect(ReceiptDisplayTaxSchema.safeParse('bogus').success).toBe(false);
		expect(ReceiptDisplayTaxSchema.safeParse('incl').success).toBe(true);
		expect(ReceiptDisplayTaxSchema.safeParse('excl').success).toBe(true);
		expect(ReceiptDisplayTaxSchema.safeParse('hidden').success).toBe(true);
	});

	it('accepts empty arrays for fees, shipping, discounts, payments', () => {
		const minimal = {
			...sampleReceiptData,
			fees: [],
			shipping: [],
			discounts: [],
			payments: [],
		};
		const result = ReceiptDataSchema.safeParse(minimal);
		expect(result.success).toBe(true);
	});

	it('keeps v1 discount total incl/excl fields optional', () => {
		const legacy = JSON.parse(JSON.stringify(sampleReceiptData));
		delete legacy.totals.discount_total_incl;
		delete legacy.totals.discount_total_excl;

		const result = ReceiptDataSchema.safeParse(legacy);
		expect(result.success).toBe(true);
	});

	it('rejects negative discount magnitudes', () => {
		for (const field of ['total', 'total_incl', 'total_excl'] as const) {
			const broken = JSON.parse(JSON.stringify(sampleReceiptData));
			broken.discounts = [{ label: 'Promo', total: 1, total_incl: 1, total_excl: 1 }];
			broken.discounts[0][field] = -1;

			expect(ReceiptDataSchema.safeParse(broken).success).toBe(false);
		}

		for (const field of ['discount_total', 'discount_total_incl', 'discount_total_excl'] as const) {
			const broken = JSON.parse(JSON.stringify(sampleReceiptData));
			broken.totals[field] = -1;

			expect(ReceiptDataSchema.safeParse(broken).success).toBe(false);
		}
	});

	it('preserves optional store/customer fields when omitted', () => {
		const stripped = JSON.parse(JSON.stringify(sampleReceiptData));
		delete stripped.store.phone;
		delete stripped.customer.billing_address;
		const result = ReceiptDataSchema.safeParse(stripped);
		expect(result.success).toBe(true);
	});

	it('exposes store.id and rejects scalar tax ID shortcuts in the v1 receipt contract', () => {
		expect(ReceiptDataSchema.safeParse(sampleReceiptData).success).toBe(true);
		expect(sampleReceiptData.store.id).toEqual(expect.any(Number));
		expect(sampleReceiptData.store).not.toHaveProperty('tax_id');
		expect(sampleReceiptData.customer).not.toHaveProperty('tax_id');

		const withStoreScalar = JSON.parse(JSON.stringify(sampleReceiptData));
		withStoreScalar.store.tax_id = 'TAX-12345';
		const parsedStoreScalar = ReceiptDataSchema.parse(withStoreScalar);
		expect(parsedStoreScalar.store).not.toHaveProperty('tax_id');

		const withCustomerScalar = JSON.parse(JSON.stringify(sampleReceiptData));
		withCustomerScalar.customer.tax_id = 'TAX-12345';
		const parsedCustomerScalar = ReceiptDataSchema.parse(withCustomerScalar);
		expect(parsedCustomerScalar.customer).not.toHaveProperty('tax_id');
	});

	it('parses store.tax_ids as an array of TaxId entries', () => {
		const withTaxIds = JSON.parse(JSON.stringify(sampleReceiptData));
		withTaxIds.store.tax_ids = [
			{ type: 'eu_vat', value: 'DE123456789', country: 'DE' },
			{ type: 'de_steuernummer', value: '05/123/45678', country: 'DE' },
		];
		const result = ReceiptDataSchema.safeParse(withTaxIds);
		expect(result.success).toBe(true);
	});

	it('parses supported customer.tax_ids entries with regional business ID types', () => {
		const withTaxIds = JSON.parse(JSON.stringify(sampleReceiptData));
		withTaxIds.customer.tax_ids = [
			{ type: 'de_ust_id', value: 'DE123456789', country: 'DE' },
			{ type: 'de_steuernummer', value: '05/123/45678', country: 'DE' },
			{ type: 'de_hrb', value: 'HRB 123456', country: 'DE' },
			{ type: 'nl_kvk', value: '12345678', country: 'NL' },
			{ type: 'fr_siret', value: '12345678900012', country: 'FR' },
			{ type: 'fr_siren', value: '123456789', country: 'FR' },
			{ type: 'gb_company', value: '12345678', country: 'GB' },
			{ type: 'ch_uid', value: 'CHE-123.456.789', country: 'CH' },
		];
		const result = ReceiptDataSchema.safeParse(withTaxIds);
		expect(result.success).toBe(true);
	});

	it('accepts an unknown tax_ids[].type as a forgiving string', () => {
		const withCustomType = JSON.parse(JSON.stringify(sampleReceiptData));
		withCustomType.store.tax_ids = [
			{ type: 'pl_nip', value: '1234567890', country: 'PL' }, // not in our enum yet
		];
		const result = ReceiptDataSchema.safeParse(withCustomType);
		expect(result.success).toBe(true);
	});

	it('omits tax_ids cleanly when not provided', () => {
		const stripped = JSON.parse(JSON.stringify(sampleReceiptData));
		delete stripped.store.tax_ids;
		const result = ReceiptDataSchema.safeParse(stripped);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.store).not.toHaveProperty('tax_ids');
		}
	});
});
