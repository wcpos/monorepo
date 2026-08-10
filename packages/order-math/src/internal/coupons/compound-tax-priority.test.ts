/** @jest-environment node */
import { recalculateCoupons } from './recalculate';

/**
 * woocommerce-pos#1548 — compound-tax sequencing on a DISCOUNTED line.
 *
 * Fixture is the exact shape the app passes: RxDB tax-rate documents, which
 * carry BOTH `priority` (WooCommerce `tax_rate_priority` — what WC_Tax sorts
 * by) and `order` (`tax_rate_order`, display-only, commonly 0 on every rate).
 *
 * Numbers are from the mono#1119 CI run against dev-next's GB store (VAT 20%
 * + Surcharge 2%, both compound; 10% coupon; prices include tax; £25.00 incl
 * → £22.50 incl):
 *
 *   WooCommerce (server, correct):  VAT 3.676471  Surcharge 0.441176
 *   Client before this fix:         VAT 3.750000  Surcharge 0.367647
 *
 * Both sum to 4.117647 — a REDISTRIBUTION between the two compound rates, so
 * order totals matched and only the per-rate split (and the cashier's
 * totals-changed banner) exposed it.
 */
describe('#1548 compound tax sequencing on a couponed line', () => {
	/** VAT: priority 1. `order` is 0 on the real store — the trap. */
	const VAT = {
		id: 10,
		rate: '20.0000',
		compound: true,
		priority: 1,
		order: 0,
		class: 'standard',
	};
	/** Surcharge: priority 2 → applied OUTERMOST by WC's reversed compound pass. */
	const SURCHARGE = {
		id: 7,
		rate: '2.0000',
		compound: true,
		priority: 2,
		order: 0,
		class: 'standard',
	};

	const line = {
		id: 1,
		product_id: 65,
		name: 'Compound item',
		quantity: 1,
		subtotal: '20.424837',
		subtotal_tax: '4.575163',
		total: '20.424837',
		total_tax: '4.575163',
		tax_class: '',
		price: 25,
		taxes: [
			{ id: 10, subtotal: '4.084967', total: '4.084967' },
			{ id: 7, subtotal: '0.490196', total: '0.490196' },
		],
		meta_data: [
			{
				key: '_woocommerce_pos_data',
				value: { price: '25', regular_price: '25', tax_status: 'taxable' },
			},
		],
	};

	const couponConfigs = new Map([
		[
			'tenpct',
			{
				discount_type: 'percent' as const,
				amount: '10',
				limit_usage_to_x_items: null,
				product_ids: [],
				excluded_product_ids: [],
				product_categories: [],
				excluded_product_categories: [],
				exclude_sale_items: false,
			},
		],
	]);

	function recalculate(rates: (typeof VAT)[]) {
		return recalculateCoupons({
			lineItems: [line as never],
			couponLines: [{ code: 'tenpct', meta_data: [] } as never],
			couponConfigs,
			taxRates: rates,
			productCategories: new Map(),
			pricesIncludeTax: true,
			calcDiscountsSequentially: false,
			dp: 2,
		});
	}

	it('splits per-rate tax exactly as WooCommerce does (priority decides the outermost compound)', () => {
		const taxes = recalculate([VAT, SURCHARGE]).lineItems[0].taxes ?? [];
		const vat = taxes.find((tax) => tax.id === 10);
		const surcharge = taxes.find((tax) => tax.id === 7);

		expect(Number(vat?.total)).toBeCloseTo(3.676471, 5);
		expect(Number(surcharge?.total)).toBeCloseTo(0.441176, 5);
		// The split must not merely sum correctly — that held while it was wrong.
		expect(Number(vat?.total) + Number(surcharge?.total)).toBeCloseTo(4.117647, 5);
	});

	it('is independent of the order the rates arrive in', () => {
		const taxes = recalculate([SURCHARGE, VAT]).lineItems[0].taxes ?? [];
		expect(Number(taxes.find((tax) => tax.id === 10)?.total)).toBeCloseTo(3.676471, 5);
		expect(Number(taxes.find((tax) => tax.id === 7)?.total)).toBeCloseTo(0.441176, 5);
	});

	it('still honours `order` for callers that map priority onto it (legacy contract)', () => {
		const legacy = [
			{ ...VAT, priority: undefined, order: 1 },
			{ ...SURCHARGE, priority: undefined, order: 2 },
		] as never as (typeof VAT)[];
		const taxes = recalculate(legacy).lineItems[0].taxes ?? [];
		expect(Number(taxes.find((tax) => tax.id === 10)?.total)).toBeCloseTo(3.676471, 5);
		expect(Number(taxes.find((tax) => tax.id === 7)?.total)).toBeCloseTo(0.441176, 5);
	});
});
