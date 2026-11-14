import { createCartConfig } from '@wcpos/order-math';

import type { settleCartWrite } from '../src/screens/main/pos/commands/settle-cart-write';

export const config = createCartConfig({
	rates: [],
	allRates: [],
	calcTaxes: false,
	pricesIncludeTax: false,
	taxRoundAtSubtotal: false,
	dp: 2,
	shippingTaxClass: '',
	taxClassSlugs: [],
	calcDiscountsSequentially: false,
});
export const useCartConfigReader = jest.fn(() => () => config);

/** Coupon commands leave the aggregate to continuation; other commands merge it. */
export function expectSettledWrites(patch: jest.Mock) {
	for (const [input] of patch.mock.calls) {
		const coupons = input.data.coupon_lines ?? input.document.payload.coupon_lines;
		if (coupons?.some((line: { code?: string }) => line.code != null)) {
			for (const key of ['total', 'total_tax', 'tax_lines', 'discount_total', 'discount_tax'])
				expect(input.data).not.toHaveProperty(key);
			continue;
		}
		expect(input.data).toEqual(
			expect.objectContaining({
				total: expect.any(String),
				total_tax: expect.any(String),
				tax_lines: expect.any(Array),
				discount_total: expect.any(String),
				discount_tax: expect.any(String),
			})
		);
	}
}

export const resolveCartWrite =
	(mock: jest.Mock): Parameters<typeof settleCartWrite>[1]['localPatch'] =>
	({ document, changes }) => {
		const data = changes({ status: 'pos-open', ...document.payload });
		return Object.keys(data).length ? mock({ document, data }) : Promise.resolve(document);
	};
