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

/** Every existing command case also pins its merged write contract. */
export function expectSettledWrites(patch: jest.Mock) {
	for (const [input] of patch.mock.calls) {
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
	({ document, changes }) =>
		mock({ document, data: changes(document.payload) });
