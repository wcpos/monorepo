import { describe, expect, it } from 'vitest';

import { ReceiptDataSchema } from '@wcpos/printer/encoder';

import { createPrng, createRandomReceipt, formatSeed, parseSeed } from '../randomizer';

describe('template-studio randomizer', () => {
	it('produces canonical-shape ReceiptData that validates against the schema', () => {
		const result = createRandomReceipt({ seed: 'seed-default' });
		const parsed = ReceiptDataSchema.safeParse(result.data);
		expect(parsed.success).toBe(true);
		if (!parsed.success) throw new Error(parsed.error.message);
	});

	it('is deterministic for a given seed', () => {
		const a = createRandomReceipt({ seed: 0xc0ffee });
		const b = createRandomReceipt({ seed: 0xc0ffee });
		expect(JSON.stringify(a.data)).toEqual(JSON.stringify(b.data));
		expect(a.scenarios).toEqual(b.scenarios);
	});

	it('produces different shapes for different seeds', () => {
		const a = createRandomReceipt({ seed: 1 });
		const b = createRandomReceipt({ seed: 2 });
		expect(JSON.stringify(a.data)).not.toEqual(JSON.stringify(b.data));
	});

	it('honors scenario overrides for empty cart', () => {
		const result = createRandomReceipt({ seed: 1, overrides: { emptyCart: true } });
		expect(result.scenarios.emptyCart).toBe(true);
		expect(result.data.lines).toEqual([]);
		expect(result.data.totals.grand_total_incl).toBe(0);
	});

	it('honors scenario overrides for refund (negative qty + refund mode)', () => {
		const result = createRandomReceipt({
			seed: 7,
			overrides: { refund: true, emptyCart: false, cartSize: 2 },
		});
		expect(result.scenarios.refund).toBe(true);
		expect(result.data.meta.mode).toBe('refund');
		expect(result.data.lines.every((line) => line.qty < 0)).toBe(true);
	});

	it('does not generate cash tendered/change for refund payments', () => {
		// Seed picked because it deterministically lands the single payment on
		// `cash`; the assertion is about the cash-only branch suppressing
		// tendered/change for refunds.
		const result = createRandomReceipt({
			seed: 1,
			overrides: { refund: true, emptyCart: false, multiPayment: false, cartSize: 1 },
		});
		const payment = result.data.payments[0];

		expect(payment.method_id).toBe('cash');
		expect(payment.amount).toBeLessThan(0);
		expect(payment.tendered).toBeUndefined();
		expect(payment.change).toBeUndefined();
		expect(result.data.totals.paid_total).toBe(result.data.totals.grand_total_incl);
		expect(result.data.totals.change_total).toBe(0);
	});

	it('does not emit payments for unpaid order modes', () => {
		const result = createRandomReceipt({
			seed: 1,
			overrides: { refund: false, emptyCart: false, multiPayment: false, cartSize: 1 },
		});

		expect(['quote', 'kitchen']).toContain(result.data.meta.mode);
		expect(result.data.payments).toEqual([]);
		expect(result.data.totals.paid_total).toBe(0);
		expect(result.data.totals.change_total).toBe(0);
		expect(result.data.order?.paid.datetime).toBe('');
		expect(result.data.order?.completed.datetime).toBe('');
	});

	it('honors RTL override (Arabic locale + SAR currency without multicurrency override)', () => {
		const result = createRandomReceipt({
			seed: 9,
			overrides: { rtl: true, multicurrency: false, emptyCart: false },
		});
		expect(result.data.presentation_hints.locale).toBe('ar_SA');
		expect(result.data.meta.currency).toBe('SAR');
	});

	it('produces fiscal data when fiscal override is on', () => {
		const result = createRandomReceipt({ seed: 11, overrides: { fiscal: true } });
		expect(result.data.fiscal.immutable_id).toBeTruthy();
		expect(result.data.fiscal.qr_payload).toBeTruthy();
	});

	it('produces multi-payment splits that sum to grand total', () => {
		const result = createRandomReceipt({
			seed: 13,
			overrides: { multiPayment: true, emptyCart: false, cartSize: 3 },
		});
		expect(result.data.payments.length).toBeGreaterThanOrEqual(2);
		const sum = result.data.payments.reduce((acc, p) => acc + p.amount, 0);
		expect(Math.round(sum * 100) / 100).toBe(result.data.totals.grand_total_incl);
	});

	it('keeps grand totals internally consistent when fees and shipping are present', () => {
		const result = createRandomReceipt({
			seed: 21,
			overrides: {
				emptyCart: false,
				refund: false,
				hasDiscounts: false,
				hasFees: true,
				hasShipping: true,
				cartSize: 2,
			},
		});
		const lineTotalExcl = result.data.lines.reduce(
			(sum, line) => sum + (line.line_subtotal_excl ?? 0),
			0
		);
		const feeTotalExcl = result.data.fees.reduce((sum, fee) => sum + fee.total_excl, 0);
		const shippingTotalExcl = result.data.shipping.reduce((sum, item) => sum + item.total_excl, 0);
		const discountTotalExcl = result.data.discounts.reduce((sum, item) => sum + item.total_excl, 0);
		const expectedGrandExcl =
			Math.round((lineTotalExcl + feeTotalExcl + shippingTotalExcl + discountTotalExcl) * 100) /
			100;

		expect(result.data.totals.grand_total_excl).toBe(expectedGrandExcl);
		expect(result.data.totals.tax_total).toBe(
			Math.round((result.data.totals.grand_total_incl - expectedGrandExcl) * 100) / 100
		);
		const summaryTax = result.data.tax_summary.reduce((sum, tax) => sum + tax.tax_amount, 0);
		expect(Math.round(summaryTax * 100) / 100).toBe(result.data.totals.tax_total);
	});

	it('generates GMT order dates in MySQL datetime format', () => {
		// Mirrors PHP `current_time( 'mysql', true )` — `Y-m-d H:i:s`.
		const result = createRandomReceipt({ seed: 'seed-utc' });
		expect(result.data.meta.created_at_gmt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});

	it('derives printed receipt dates from seeded order data', () => {
		const result = createRandomReceipt({ seed: 'seed-printed' });
		expect(result.data.receipt).toBeDefined();
		expect(result.data.order).toBeDefined();
		expect(result.data.receipt!.printed.datetime).toBe(result.data.order!.created.datetime);
	});

	it('keeps seeded date formatting stable across runtime time zones', () => {
		const originalTimeZone = process.env.TZ;
		try {
			process.env.TZ = 'UTC';
			const utc = createRandomReceipt({ seed: 'seed-timezone' });
			process.env.TZ = 'Pacific/Honolulu';
			const honolulu = createRandomReceipt({ seed: 'seed-timezone' });

			expect(honolulu.data.meta.created_at_local).toBe(utc.data.meta.created_at_local);
			expect(honolulu.data.receipt).toEqual(utc.data.receipt);
			expect(honolulu.data.order).toEqual(utc.data.order);
		} finally {
			if (originalTimeZone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTimeZone;
			}
		}
	});

	it('parses textual seeds via FNV fallback', () => {
		const a = parseSeed('seed-rtl');
		const b = parseSeed('seed-rtl');
		expect(a).toBe(b);
		expect(parseSeed('seed-rtl')).not.toBe(parseSeed('seed-fiscal'));
	});

	it('formats seed as a stable 4-hex token', () => {
		expect(formatSeed(0xdeadbeef)).toBe('beef');
		expect(formatSeed(1)).toBe('0001');
	});

	it('exposes a usable xorshift PRNG closure', () => {
		const rand = createPrng(0x1234);
		const values = Array.from({ length: 8 }, () => rand());
		for (const value of values) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
		const next = createPrng(0x1234);
		const second = Array.from({ length: 8 }, () => next());
		expect(values).toEqual(second);
	});
});
