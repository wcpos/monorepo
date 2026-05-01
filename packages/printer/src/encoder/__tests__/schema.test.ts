import { describe, expect, it } from 'vitest';

import { mapReceiptData } from '../map-receipt-data';
import { ReceiptDataSchema, ReceiptDisplayTaxSchema } from '../schema';
import { sampleReceiptData } from './fixtures';

describe('ReceiptDataSchema', () => {
	it('parses the canonical fixture without errors', () => {
		const result = ReceiptDataSchema.safeParse(sampleReceiptData);
		expect(result.success).toBe(true);
	});

	it('parses output of mapReceiptData', () => {
		const mapped = mapReceiptData(sampleReceiptData as unknown as Record<string, unknown>);
		const result = ReceiptDataSchema.safeParse(mapped);
		expect(result.success).toBe(true);
	});

	it('rejects missing required top-level keys', () => {
		const broken = { ...sampleReceiptData } as Record<string, unknown>;
		delete broken.totals;
		const result = ReceiptDataSchema.safeParse(broken);
		expect(result.success).toBe(false);
	});

	it('rejects wrong-typed numeric field', () => {
		const broken = JSON.parse(JSON.stringify(sampleReceiptData));
		broken.totals.grand_total_incl = 'not-a-number';
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

	it('preserves optional store/customer fields when omitted', () => {
		const stripped = JSON.parse(JSON.stringify(sampleReceiptData));
		delete stripped.store.tax_id;
		delete stripped.store.phone;
		delete stripped.customer.billing_address;
		const result = ReceiptDataSchema.safeParse(stripped);
		expect(result.success).toBe(true);
	});
});
