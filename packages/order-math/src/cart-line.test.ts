import { calculateCartLine } from './cart-line';
import { createCartConfig } from './config';

import type { CartConfigInput } from './config';
import type { TaxRateInput } from './types';

/**
 * Migrated from:
 * - packages/core/src/screens/main/pos/hooks/use-calculate-line-item-tax-and-totals.test.ts
 * - packages/core/src/screens/main/pos/hooks/use-calculate-fee-line-tax-and-totals.test.ts
 * - packages/core/src/screens/main/pos/hooks/use-calculate-shipping-line-tax-and-totals.test.ts
 *   (that hook and both of its suites are now DELETED — this file is the shipping coverage)
 *
 * Every expected value is pinned unchanged. The old tests mocked the data hooks
 * (getLineItemData/getFeeLineData/getShippingLineData) and the tax gate; here the
 * same per-line data is provided via real `_woocommerce_pos_data` meta and the
 * same rates via `createCartConfig` (rates gain `class`/`shipping` fields so the
 * real gate — which the old mocks bypassed — selects them identically).
 */

const baseConfig: Omit<CartConfigInput, 'rates'> = {
	allRates: [],
	calcTaxes: true,
	pricesIncludeTax: false,
	taxRoundAtSubtotal: false,
	dp: 2,
	shippingTaxClass: '',
	calcDiscountsSequentially: false,
};

const rate20: TaxRateInput = {
	id: 1,
	rate: '20.0000',
	compound: false,
	order: 1,
	class: 'standard',
	shipping: true,
};

const posDataMeta = (data: Record<string, unknown>) => ({
	key: '_woocommerce_pos_data',
	value: JSON.stringify(data),
});

const getPosData = (line: { meta_data?: { key?: string; value?: unknown }[] }) => {
	const meta = (line.meta_data ?? []).find((m) => m.key === '_woocommerce_pos_data');
	if (typeof meta?.value === 'object' && meta.value !== null) return meta.value;
	return typeof meta?.value === 'string' ? JSON.parse(meta.value) : null;
};

describe('calculateCartLine — line_item', () => {
	it('should correctly calculate line item tax and totals when prices exclude tax', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const lineItem = {
			quantity: 2,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 100, regular_price: 120, tax_status: 'taxable' })],
		};

		const { line, warnings } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(warnings).toEqual([]);
		expect(line).toEqual({
			...lineItem,
			price: 100,
			total: '200',
			total_tax: '40',
			subtotal: '200',
			subtotal_tax: '40',
			taxes: [
				{
					id: 1,
					subtotal: '40.000000',
					total: '40.000000',
				},
			],
		});
	});

	it('should correctly calculate line item tax and totals when prices include tax', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: true });
		const lineItem = {
			quantity: 2,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 100, regular_price: 120, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line).toEqual({
			...lineItem,
			price: 83.333333, // rounding precision (6dp), not dp
			total: '166.666667', // rounding precision (6dp)
			total_tax: '33.33', // rounded to dp when roundAtSubtotal=false
			subtotal: '166.666667',
			subtotal_tax: '33.33',
			taxes: [
				{
					// Per-rate taxes stay UNROUNDED — see PER_RATE_TAXES_ARE_UNROUNDED in
					// cart-line.ts. This pair previously read '33.330000': the 2dp value
					// zero-padded to 6dp, which is visually indistinguishable from the
					// genuine 6dp `total` two lines up. That is how the rounding bug became
					// canon. `total_tax` above is the field round-at-subtotal governs.
					id: 1,
					subtotal: '33.333333',
					total: '33.333333',
				},
			],
		});
	});

	it('should correctly round line item tax and totals when prices include tax', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: true });
		const lineItem = {
			quantity: 3,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 25, regular_price: 30, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line).toEqual({
			...lineItem,
			price: 20.833333,
			total: '62.5',
			subtotal: '62.5',
			subtotal_tax: '12.5',
			total_tax: '12.5',
			taxes: [
				{
					id: 1,
					subtotal: '12.500000',
					total: '12.500000',
				},
			],
		});
	});

	it('authors per-rate line taxes at the configured storage precision', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [rate20],
			allRates: [rate20],
			taxRoundAtSubtotal: true,
			dp: 5,
		});
		const lineItem = {
			quantity: 1,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 0.6172835, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line.total_tax).toBe('0.1234567');
		expect(line.taxes).toEqual([{ id: 1, subtotal: '0.1234567', total: '0.1234567' }]);
	});

	it('rounds half-up before padding per-rate taxes', () => {
		const rate5 = { ...rate20, rate: '5.0000' };
		const config = createCartConfig({
			...baseConfig,
			rates: [rate5],
			allRates: [rate5],
			taxRoundAtSubtotal: true,
		});
		const lineItem = {
			quantity: 1,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 0.10003, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line.taxes).toEqual([{ id: 1, subtotal: '0.005002', total: '0.005002' }]);
	});

	it('should correctly calculate when prices do not include tax', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const lineItem = {
			quantity: 1,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 100, regular_price: 120, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line).toEqual({
			...lineItem,
			price: 100, // Price remains same as prices exclude tax
			total: '100', // price * quantity
			subtotal: '100', // price * quantity (same as total)
			total_tax: '20', // 20% tax on total (100)
			taxes: [
				{
					id: 1,
					subtotal: '20.000000', // subtotal tax on 100
					total: '20.000000', // total tax on 100
				},
			],
			subtotal_tax: '20',
		});
	});

	describe('dp parameter (price_num_decimals)', () => {
		const rate10: TaxRateInput = {
			id: 1,
			rate: '10.0000',
			compound: false,
			order: 1,
			class: 'standard',
			shipping: true,
		};

		it('dp=0 (JPY): ¥1000 exclusive at 10%', () => {
			const config = createCartConfig({
				...baseConfig,
				rates: [rate10],
				pricesIncludeTax: false,
				dp: 0,
			});
			const lineItem = {
				quantity: 1,
				tax_class: 'standard',
				meta_data: [posDataMeta({ price: 1000, regular_price: 1200, tax_status: 'taxable' })],
			};

			const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

			expect(line.price).toBe(1000);
			expect(line.total).toBe('1000');
			expect(line.subtotal).toBe('1000');
			expect(line.total_tax).toBe('100');
			expect(line.subtotal_tax).toBe('100');
		});

		it('dp=0 (JPY): ¥999 inclusive at 10%', () => {
			const config = createCartConfig({
				...baseConfig,
				rates: [rate10],
				pricesIncludeTax: true,
				dp: 0,
			});
			const lineItem = {
				quantity: 1,
				tax_class: 'standard',
				meta_data: [posDataMeta({ price: 999, regular_price: 999, tax_status: 'taxable' })],
			};

			const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

			// 999/1.1 = 908.181818..., tax = 90.818182 (at 6dp)
			// roundTaxTotal(90.818182, 0, true) = roundHalfDown(90.818182, 0) = 91
			// totalExclTax = 999 - 90.818182 = 908.181818
			// roundHalfUp(908.181818, 6) = 908.181818 (rounding precision, not dp)
			expect(line.total_tax).toBe('91');
			expect(line.total).toBe('908.181818');
			expect(line.price).toBe(908.181818);
		});

		it('dp=3: $9.999 exclusive at 20%', () => {
			const config = createCartConfig({
				...baseConfig,
				rates: [rate20],
				pricesIncludeTax: false,
				dp: 3,
			});
			const lineItem = {
				quantity: 2,
				tax_class: 'standard',
				meta_data: [posDataMeta({ price: 9.999, regular_price: 9.999, tax_status: 'taxable' })],
			};

			const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

			// total = 9.999*2 = 19.998
			// tax = 19.998 * 0.2 = 3.9996 at 6dp
			// roundTaxTotal(3.9996, 3, false) = roundHalfUp(3.9996, 3) = 4
			expect(line.price).toBe(9.999);
			expect(line.total).toBe('19.998');
			expect(line.total_tax).toBe('4');
		});
	});
});

describe('calculateCartLine — fee', () => {
	it('should correctly calculate fee line tax and totals when prices exclude tax', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			meta_data: [
				posDataMeta({
					amount: 10,
					percent: false,
					prices_include_tax: false,
					percent_of_cart_total_with_tax: false,
				}),
			],
		};

		const { line, warnings } = calculateCartLine(
			{ kind: 'fee', line: feeLine, cartLineItems: [] },
			config
		);

		expect(warnings).toEqual([]);
		expect(line.total).toBe('10');
		expect(line.total_tax).toBe('2');
		expect(line.taxes).toEqual([
			{
				id: 1,
				total: '2',
			},
		]);
	});

	it('should correctly calculate fee line tax and totals when prices include tax', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: true });
		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			meta_data: [
				posDataMeta({
					amount: 12,
					percent: false,
					prices_include_tax: true,
					percent_of_cart_total_with_tax: false,
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'fee', line: feeLine, cartLineItems: [] }, config);

		// 12 includes tax, so total = 12 - 2 = 10
		expect(line.total).toBe('10');
		expect(line.total_tax).toBe('2');
	});

	it('should calculate percent-based fee from cart total (excluding tax)', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const cartLineItems = [
			{ product_id: 1, total: '100', total_tax: '20' },
			{ product_id: 2, total: '50', total_tax: '10' },
		];
		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			meta_data: [
				posDataMeta({
					amount: 10, // 10% fee
					percent: true,
					prices_include_tax: false,
					percent_of_cart_total_with_tax: false,
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'fee', line: feeLine, cartLineItems }, config);

		// Cart total = 100 + 50 = 150
		// 10% of 150 = 15
		expect(line.total).toBe('15');
		expect(line.total_tax).toBe('3');
	});

	it('should calculate percent-based fee from cart total (including tax)', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const cartLineItems = [
			{ product_id: 1, total: '100', total_tax: '20' },
			{ product_id: 2, total: '50', total_tax: '10' },
		];
		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			meta_data: [
				posDataMeta({
					amount: 10, // 10% fee
					percent: true,
					prices_include_tax: false,
					percent_of_cart_total_with_tax: true,
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'fee', line: feeLine, cartLineItems }, config);

		// Cart total with tax = (100 + 20) + (50 + 10) = 180
		// 10% of 180 = 18
		expect(line.total).toBe('18');
		expect(line.total_tax).toBe('3.6');
	});

	it('should skip items with null product_id when calculating cart total', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const cartLineItems = [
			{ product_id: 1, total: '100', total_tax: '20' },
			{ product_id: null, total: '50', total_tax: '10' }, // This should be skipped
		];
		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			meta_data: [
				posDataMeta({
					amount: 10, // 10% fee
					percent: true,
					prices_include_tax: false,
					percent_of_cart_total_with_tax: false,
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'fee', line: feeLine, cartLineItems }, config);

		// Only first item counts: cart total = 100
		// 10% of 100 = 10
		expect(line.total).toBe('10');
		expect(line.total_tax).toBe('2');
	});

	it('should handle empty cart for percent-based fee', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const feeLine = {
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			meta_data: [
				posDataMeta({
					amount: 10, // 10% fee
					percent: true,
					prices_include_tax: false,
					percent_of_cart_total_with_tax: false,
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'fee', line: feeLine, cartLineItems: [] }, config);

		// 10% of 0 = 0
		expect(line.total).toBe('0');
		expect(line.total_tax).toBe('0');
	});
});

describe('calculateCartLine — shipping', () => {
	it('should correctly calculate shipping line tax and totals when prices exclude tax', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const shippingLine = {
			method_title: 'Flat Rate',
			meta_data: [
				posDataMeta({
					amount: 10,
					prices_include_tax: false,
					tax_status: 'taxable',
					tax_class: 'standard',
				}),
			],
		};

		const { line, warnings } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		expect(warnings).toEqual([]);
		expect(line.total).toBe('10');
		expect(line.total_tax).toBe('2');
		expect(line.taxes).toEqual([
			{
				id: 1,
				total: '2',
			},
		]);
	});

	it('should correctly calculate shipping line tax and totals when prices include tax', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: true });
		const shippingLine = {
			method_title: 'Flat Rate',
			meta_data: [
				posDataMeta({
					amount: 12,
					prices_include_tax: true,
					tax_status: 'taxable',
					tax_class: 'standard',
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		// 12 includes tax, so total = 12 - 2 = 10
		expect(line.total).toBe('10');
		expect(line.total_tax).toBe('2');
	});

	it('should handle zero shipping amount', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const shippingLine = {
			method_title: 'Free Shipping',
			meta_data: [
				posDataMeta({
					amount: 0,
					prices_include_tax: false,
					tax_status: 'taxable',
					tax_class: 'standard',
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		expect(line.total).toBe('0');
		expect(line.total_tax).toBe('0');
	});

	it('should handle non-taxable shipping', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const shippingLine = {
			method_title: 'Flat Rate',
			meta_data: [
				posDataMeta({
					amount: 10,
					prices_include_tax: false,
					tax_status: 'none',
					tax_class: '',
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		expect(line.total).toBe('10');
		expect(line.total_tax).toBe('0');
		expect(line.taxes).toEqual([]);
	});

	it('should handle multiple tax rates', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [
				{ id: 1, rate: '10.0000', compound: false, order: 1, class: 'standard', shipping: true },
				{ id: 2, rate: '5.0000', compound: false, order: 2, class: 'standard', shipping: true },
			],
			pricesIncludeTax: false,
		});
		const shippingLine = {
			method_title: 'Express Shipping',
			meta_data: [
				posDataMeta({
					amount: 100,
					prices_include_tax: false,
					tax_status: 'taxable',
					tax_class: 'standard',
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		expect(line.total).toBe('100');
		expect(line.total_tax).toBe('15');
		expect(line.taxes).toHaveLength(2);
		expect(line.taxes?.[0]).toEqual({ id: 1, total: '10' });
		expect(line.taxes?.[1]).toEqual({ id: 2, total: '5' });
	});

	it('should preserve original shipping line properties', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const shippingLine = {
			method_id: 'flat_rate',
			method_title: 'Flat Rate',
			instance_id: '1',
			meta_data: [
				posDataMeta({
					amount: 10,
					prices_include_tax: false,
					tax_status: 'taxable',
					tax_class: 'standard',
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		expect(line).toMatchObject({
			method_id: 'flat_rate',
			method_title: 'Flat Rate',
			instance_id: '1',
		});
	});

	it('should handle decimal shipping amounts', () => {
		const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });
		const shippingLine = {
			method_title: 'Standard Shipping',
			meta_data: [
				posDataMeta({
					amount: 9.99,
					prices_include_tax: false,
					tax_status: 'taxable',
					tax_class: 'standard',
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		expect(line.total).toBe('9.99');
		// With dp=2 and roundAtSubtotal=false, tax is rounded to 2dp
		expect(line.total_tax).toBe('2');
	});
});

/**
 * Migrated from use-calculate-shipping-line-tax-and-totals.tax-class.test.ts.
 *
 * A shipping line carrying no `_woocommerce_pos_data` falls back to the STORE's
 * shipping tax class, so that value decides which rate the line is taxed at. The
 * hook read the store field raw and let `taxClassFromWire` normalise it downstream;
 * the config carries the wire spelling instead (`useCartConfig` does the round-trip),
 * which is what these cases pin.
 */
describe('calculateCartLine — shipping tax class contract', () => {
	const standardShippingRate: TaxRateInput = {
		id: 101,
		class: 'standard',
		rate: '10.0000',
		compound: false,
		order: 1,
		shipping: true,
	};
	const reducedShippingRate: TaxRateInput = {
		id: 202,
		class: 'reduced-rate',
		rate: '5.0000',
		compound: false,
		order: 1,
		shipping: true,
	};

	it.each([
		// wire spelling of the store's shipping_tax_class → rate it selects
		['', 101, '10'],
		['reduced-rate', 202, '5'],
		// 'inherit' is WooCommerce's "same as the cart" sentinel; extract maps it to standard.
		['inherit', 101, '10'],
	])(
		'applies the matching rate when config.shippingTaxClass is %p',
		(shippingTaxClass, expectedRateId, expectedTax) => {
			const config = createCartConfig({
				...baseConfig,
				rates: [standardShippingRate, reducedShippingRate],
				shippingTaxClass,
			});

			const { line } = calculateCartLine(
				{
					kind: 'shipping',
					line: { method_title: 'Flat rate', total: '100', total_tax: '0' },
				},
				config
			);

			expect(line.total_tax).toBe(expectedTax);
			expect(line.taxes).toEqual([{ id: expectedRateId, total: expectedTax }]);
		}
	);

	it('lets the LINE own tax_class when its pos_data carries one', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [standardShippingRate, reducedShippingRate],
			shippingTaxClass: '',
		});

		const { line } = calculateCartLine(
			{
				kind: 'shipping',
				line: {
					method_title: 'Flat rate',
					meta_data: [
						posDataMeta({
							amount: 100,
							prices_include_tax: false,
							tax_status: 'taxable',
							tax_class: 'reduced-rate',
						}),
					],
				},
			},
			config
		);

		expect(line.taxes).toEqual([{ id: 202, total: '5' }]);
	});
});

describe('calculateCartLine — tombstone passthrough', () => {
	const config = createCartConfig({ ...baseConfig, rates: [rate20] });

	it('returns a tombstoned line item unchanged, even with changes', () => {
		const line = { product_id: null, total: '100', total_tax: '20' };

		const result = calculateCartLine({ kind: 'line_item', line, changes: { price: 50 } }, config);

		expect(result.line).toBe(line);
		expect(result.warnings).toEqual([]);
	});

	it('returns a tombstoned fee line unchanged', () => {
		const line = { name: null, total: '5', total_tax: '1' };

		const result = calculateCartLine({ kind: 'fee', line, cartLineItems: [] }, config);

		expect(result.line).toBe(line);
		expect(result.warnings).toEqual([]);
	});

	it('returns a tombstoned shipping line unchanged', () => {
		const line = { method_id: null, total: '7', total_tax: '1.4' };

		const result = calculateCartLine({ kind: 'shipping', line }, config);

		expect(result.line).toBe(line);
		expect(result.warnings).toEqual([]);
	});
});

describe('calculateCartLine — changes merge', () => {
	const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });

	it('merges line item price into pos_data and quantity top-level, preserving other pos_data', () => {
		const line = {
			quantity: 1,
			tax_class: 'standard',
			meta_data: [
				{
					id: 5,
					key: '_woocommerce_pos_data',
					value: JSON.stringify({ price: 100, regular_price: 120, tax_status: 'taxable' }),
				},
			],
		};

		const { line: updated, warnings } = calculateCartLine(
			{ kind: 'line_item', line, changes: { price: 50, quantity: 3 } },
			config
		);

		expect(warnings).toEqual([]);
		expect(updated.quantity).toBe(3);
		expect(updated.total).toBe('150');
		expect(updated.total_tax).toBe('30');
		expect(getPosData(updated)).toEqual({ price: 50, regular_price: 120, tax_status: 'taxable' });
		// existing meta entry is updated in place (id preserved)
		expect(updated.meta_data?.[0]?.id).toBe(5);
	});

	/**
	 * The misc-product pos_data fields. `edit-line-item/form.tsx` submits all three on every
	 * save, and `convertProductToLineItem` writes them at creation for product_id 0. They
	 * take no `?? prev` fallback — an ABSENT key must leave pos_data's existing value alone,
	 * which is why they are spread conditionally rather than merged with undefined.
	 */
	it('writes misc-product flags into pos_data when the caller supplies them', () => {
		const line = {
			quantity: 1,
			meta_data: [
				posDataMeta({
					price: 10,
					regular_price: 10,
					tax_status: 'taxable',
					virtual: false,
					downloadable: false,
				}),
			],
		};

		const { line: updated } = calculateCartLine(
			{
				kind: 'line_item',
				line,
				changes: {
					virtual: true,
					downloadable: true,
					categories: [{ id: 7, name: 'Services' }],
				},
			},
			config
		);

		expect(getPosData(updated)).toEqual({
			price: 10,
			regular_price: 10,
			tax_status: 'taxable',
			virtual: true,
			downloadable: true,
			categories: [{ id: 7, name: 'Services' }],
		});
	});

	it('leaves existing misc-product flags untouched when the changes omit them', () => {
		const line = {
			quantity: 1,
			meta_data: [
				posDataMeta({
					price: 10,
					regular_price: 10,
					tax_status: 'taxable',
					virtual: true,
					downloadable: true,
					categories: [{ id: 7, name: 'Services' }],
				}),
			],
		};

		// A quantity edit from the cart cell — it knows nothing about misc-product flags.
		const { line: updated } = calculateCartLine(
			{ kind: 'line_item', line, changes: { quantity: 4 } },
			config
		);

		expect(getPosData(updated)).toEqual({
			price: 10,
			regular_price: 10,
			tax_status: 'taxable',
			virtual: true,
			downloadable: true,
			categories: [{ id: 7, name: 'Services' }],
		});
	});

	it('merges line item tax_status=none into pos_data and zeroes taxes', () => {
		const line = {
			quantity: 1,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 100, regular_price: 120, tax_status: 'taxable' })],
		};

		const { line: updated } = calculateCartLine(
			{ kind: 'line_item', line, changes: { tax_status: 'none' } },
			config
		);

		expect(updated.total).toBe('100');
		expect(updated.total_tax).toBe('0');
		expect(updated.taxes).toEqual([]);
		expect(getPosData(updated)).toEqual({ price: 100, regular_price: 120, tax_status: 'none' });
	});

	it('merges fee amount into pos_data and name top-level, preserving other pos_data', () => {
		const line = {
			name: 'Handling',
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			meta_data: [
				posDataMeta({
					amount: 10,
					percent: false,
					prices_include_tax: false,
					percent_of_cart_total_with_tax: false,
				}),
			],
		};

		const { line: updated } = calculateCartLine(
			{ kind: 'fee', line, changes: { amount: 20, name: 'Renamed' }, cartLineItems: [] },
			config
		);

		expect(updated.name).toBe('Renamed');
		expect(updated.total).toBe('20');
		expect(updated.total_tax).toBe('4');
		expect(getPosData(updated)).toEqual({
			amount: 20,
			percent: false,
			prices_include_tax: false,
			percent_of_cart_total_with_tax: false,
		});
	});

	it('creates fee pos_data from prev-data fallbacks when no pos_data meta exists', () => {
		const line = {
			name: 'Fee',
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			total: '10',
			total_tax: '2',
		};

		const { line: updated } = calculateCartLine(
			{ kind: 'fee', line, changes: { amount: 15 }, cartLineItems: [] },
			config
		);

		expect(updated.total).toBe('15');
		expect(updated.total_tax).toBe('3');
		// prevData fallbacks: percent=false, prices_include_tax/percent_of_cart_total_with_tax
		// default to store pricesIncludeTax (false)
		expect(getPosData(updated)).toEqual({
			amount: 15,
			percent: false,
			prices_include_tax: false,
			percent_of_cart_total_with_tax: false,
		});
	});

	it('toggles fee percent via changes and recomputes from the explicit cart basis', () => {
		const line = {
			name: 'Service',
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			meta_data: [
				posDataMeta({
					amount: 10,
					percent: false,
					prices_include_tax: false,
					percent_of_cart_total_with_tax: false,
				}),
			],
		};

		const { line: updated } = calculateCartLine(
			{
				kind: 'fee',
				line,
				changes: { percent: true },
				cartLineItems: [{ product_id: 1, total: '100', total_tax: '20' }],
			},
			config
		);

		// 10% of 100 = 10
		expect(updated.total).toBe('10');
		expect(updated.total_tax).toBe('2');
		expect(getPosData(updated)).toEqual({
			amount: 10,
			percent: true,
			prices_include_tax: false,
			percent_of_cart_total_with_tax: false,
		});
	});

	it('merges shipping amount into pos_data and method_title top-level', () => {
		const line = {
			method_title: 'Flat Rate',
			meta_data: [
				posDataMeta({
					amount: 10,
					prices_include_tax: false,
					tax_status: 'taxable',
					tax_class: 'standard',
				}),
			],
		};

		const { line: updated } = calculateCartLine(
			{ kind: 'shipping', line, changes: { amount: 25, method_title: 'Express' } },
			config
		);

		expect(updated.method_title).toBe('Express');
		expect(updated.total).toBe('25');
		expect(updated.total_tax).toBe('5');
		expect(getPosData(updated)).toEqual({
			amount: 25,
			prices_include_tax: false,
			tax_status: 'taxable',
			tax_class: 'standard',
		});
	});

	it('merges shipping tax_status=none into pos_data and zeroes taxes', () => {
		const line = {
			method_title: 'Flat Rate',
			meta_data: [
				posDataMeta({
					amount: 10,
					prices_include_tax: false,
					tax_status: 'taxable',
					tax_class: 'standard',
				}),
			],
		};

		const { line: updated } = calculateCartLine(
			{ kind: 'shipping', line, changes: { tax_status: 'none' } },
			config
		);

		expect(updated.total).toBe('10');
		expect(updated.total_tax).toBe('0');
		expect(updated.taxes).toEqual([]);
		expect(getPosData(updated)).toEqual({
			amount: 10,
			prices_include_tax: false,
			tax_status: 'none',
			tax_class: 'standard',
		});
	});
});

describe('calculateCartLine — malformed pos_data warnings', () => {
	const config = createCartConfig({ ...baseConfig, rates: [rate20], pricesIncludeTax: false });

	it('emits malformed_pos_data for a line item with unparseable meta and falls back to totals', () => {
		const line = {
			quantity: 1,
			tax_class: 'standard',
			total: '100',
			meta_data: [{ key: '_woocommerce_pos_data', value: '{not json' }],
		};

		const { line: computed, warnings } = calculateCartLine({ kind: 'line_item', line }, config);

		expect(warnings).toEqual([
			{ code: 'malformed_pos_data', where: { lineType: 'line_item', index: -1 } },
		]);
		// extract* fell back to totals-derived price: 100 / qty 1
		expect(computed.total).toBe('100');
		expect(computed.total_tax).toBe('20');
	});

	it('emits malformed_pos_data for a fee line with unparseable meta and falls back to totals', () => {
		const line = {
			name: 'Fee',
			tax_class: 'standard',
			tax_status: 'taxable' as const,
			total: '10',
			meta_data: [{ key: '_woocommerce_pos_data', value: 'not-json' }],
		};

		const { line: computed, warnings } = calculateCartLine(
			{ kind: 'fee', line, cartLineItems: [] },
			config
		);

		expect(warnings).toEqual([
			{ code: 'malformed_pos_data', where: { lineType: 'fee_line', index: -1 } },
		]);
		// extract* fell back to the default amount (total = 10, prices exclude tax)
		expect(computed.total).toBe('10');
		expect(computed.total_tax).toBe('2');
	});
});

/**
 * WooCommerce stores the PER-RATE tax array unrounded, at rounding precision (6dp),
 * and applies `wc_round_tax_total` only when SUMMING those values into `total_tax`.
 * All three item classes are identical on this point:
 *
 *   class-wc-order-item-fee.php:222-230
 *   class-wc-order-item-shipping.php:167-178
 *   class-wc-order-item-product.php:214-231
 *
 *     $tax_data['total'] = array_map( 'wc_format_decimal', $total );   // <- NOT rounded
 *     $this->set_prop( 'taxes', $tax_data );
 *     if ( 'yes' === get_option( 'woocommerce_tax_round_at_subtotal' ) ) {
 *         $this->set_total_tax( array_sum( $tax_data['total'] ) );
 *     } else {
 *         $this->set_total_tax( array_sum( array_map( 'wc_round_tax_total', $tax_data['total'] ) ) );
 *     }
 *
 * `wc_format_decimal($n)` with `$dp === false` does not round — it renders the float at
 * `wc_get_rounding_precision()` (6). So `taxRoundAtSubtotal === false` changes `total_tax`
 * and NOTHING ELSE. Rounding `taxes[]` too is a client-only invention.
 *
 * Every fixture here is deliberately NOT 2dp-clean: the pre-existing fee/shipping cases
 * above all use amounts whose tax lands exactly on a cent (10 @ 20% = 2), so they pass
 * under either rule and cannot see this.
 *
 * Measured live on dev-free.wcpos.com 2026-08-24, order 111919 (CHECKOUT401):
 * a 1.00 tax-inclusive fee at 10% — client sent taxes[6].total 0.090000, server stored
 * 0.090909, and the cashier got "your store changed this order's totals".
 */
describe('per-rate taxes[] are stored UNROUNDED (WC set_taxes contract)', () => {
	const rate10: TaxRateInput = {
		id: 6,
		rate: '10.0000',
		compound: false,
		order: 1,
		class: 'standard',
		shipping: true,
	};

	it('fee: a 1.00 tax-inclusive fee at 10% keeps 0.090909 in taxes[], rounds only total_tax', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [rate10],
			pricesIncludeTax: false,
			taxRoundAtSubtotal: false,
		});
		const feeLine = {
			tax_class: '',
			tax_status: 'taxable' as const,
			meta_data: [posDataMeta({ amount: '1', percent: false, prices_include_tax: true })],
		};

		const { line } = calculateCartLine({ kind: 'fee', line: feeLine, cartLineItems: [] }, config);

		expect(line.total).toBe('0.909091');
		expect(line.total_tax).toBe('0.09');
		expect(line.taxes).toEqual([{ id: 6, total: '0.090909' }]);
	});

	it('shipping: a 1.00 tax-inclusive shipping line at 10% keeps 0.090909 in taxes[]', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [rate10],
			pricesIncludeTax: false,
			taxRoundAtSubtotal: false,
		});
		const shippingLine = {
			method_id: 'local_pickup',
			meta_data: [
				posDataMeta({
					amount: '1',
					prices_include_tax: true,
					tax_class: '',
					tax_status: 'taxable',
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		expect(line.total).toBe('0.909091');
		expect(line.total_tax).toBe('0.09');
		expect(line.taxes).toEqual([{ id: 6, total: '0.090909' }]);
	});

	/**
	 * The rounding MODE is store-level. WooCommerce defines `WC_TAX_ROUNDING_MODE` once
	 * at boot from `woocommerce_prices_include_tax` (class-woocommerce.php:532) and
	 * `wc_round_tax_total()` reads that constant for every value — a line's own
	 * `prices_include_tax` never reaches it.
	 *
	 * This needs BOTH an override and an exact half-cent tie to show, which is why no
	 * pre-existing shipping fixture caught it: 1.25 excl. at 10% is 0.125, and the two
	 * modes land a cent apart. Store says prices include tax (HALF-DOWN → 0.12); the
	 * line overrides to exclusive, which the old code let flip it to HALF-UP → 0.13.
	 */
	it('shipping: the rounding mode follows the STORE, not the line override', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [rate10],
			pricesIncludeTax: true,
			taxRoundAtSubtotal: false,
		});
		const shippingLine = {
			method_id: 'flat_rate',
			meta_data: [
				posDataMeta({
					amount: '1.25',
					prices_include_tax: false,
					tax_class: '',
					tax_status: 'taxable',
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		expect(line.total).toBe('1.25');
		// HALF-DOWN, because the STORE has prices-include-tax on. 0.13 means the line
		// override reached the rounding mode.
		expect(line.total_tax).toBe('0.12');
		expect(line.taxes).toEqual([{ id: 6, total: '0.125' }]);
	});

	it('line_item: a 1.00 tax-inclusive product at 10% keeps 0.090909 in taxes[]', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [rate10],
			pricesIncludeTax: true,
			taxRoundAtSubtotal: false,
		});
		const lineItem = {
			quantity: 1,
			tax_class: '',
			meta_data: [posDataMeta({ price: 1, regular_price: 1, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line.total_tax).toBe('0.09');
		expect(line.taxes).toEqual([{ id: 6, subtotal: '0.090909', total: '0.090909' }]);
	});
});

/**
 * A line's `total_tax` is the sum of its STORED per-rate taxes — round each rate to
 * storage precision FIRST, then add. Not `round(a + b)`. See `sumStoredLineTax` in
 * cart-line.ts for the WooCommerce source this mirrors.
 *
 * Invisible on a single-rate store, which is why every fixture above missed it: with
 * one rate, `round(a)` and `round(a)` are the same number. It takes TWO rates whose
 * raw sum sits on a boundary.
 *
 * These are dev-pro's real numbers, measured 2026-08-24 on a 1.00 tax-inclusive fee
 * at 10% + 2.2%. The till sent `total_tax` 0.108734 against the store's 0.108735 and
 * raised the totals-changed banner on a correctly rung sale. The one-microunit gap was
 * previously recorded in `apps/main/e2e/order-lifecycle.ts` as an unavoidable
 * PHP-float-vs-decimal rounding tie, and tolerated. It was never a tie.
 */
describe('total_tax sums the STORED per-rate taxes, not the raw total', () => {
	const rate10: TaxRateInput = {
		id: 13,
		rate: '10.0000',
		compound: false,
		order: 1,
		class: 'standard',
		shipping: true,
	};
	const rate22: TaxRateInput = {
		id: 14,
		rate: '2.2000',
		compound: false,
		order: 2,
		class: 'standard',
		shipping: true,
	};

	// net = 1 / 1.122 = 0.891266 → 0.089127 (10%) + 0.019608 (2.2%) = 0.108735.
	// The raw sum is 0.1087344, which rounds to 0.108734 — one microunit low.
	it('fee: two rates on a 1.00 inclusive fee sum to 0.108735, not 0.108734', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [rate10, rate22],
			pricesIncludeTax: false,
			taxRoundAtSubtotal: true,
		});
		const feeLine = {
			tax_class: '',
			tax_status: 'taxable' as const,
			meta_data: [posDataMeta({ amount: '1', percent: false, prices_include_tax: true })],
		};

		const { line } = calculateCartLine({ kind: 'fee', line: feeLine, cartLineItems: [] }, config);

		expect(line.taxes).toEqual([
			{ id: 13, total: '0.089127' },
			{ id: 14, total: '0.019608' },
		]);
		expect(line.total_tax).toBe('0.108735');
	});

	it('shipping: the same two rates sum the same way', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [rate10, rate22],
			pricesIncludeTax: false,
			taxRoundAtSubtotal: true,
		});
		const shippingLine = {
			method_id: 'flat_rate',
			meta_data: [
				posDataMeta({
					amount: '1',
					prices_include_tax: true,
					tax_class: '',
					tax_status: 'taxable',
				}),
			],
		};

		const { line } = calculateCartLine({ kind: 'shipping', line: shippingLine }, config);

		expect(line.taxes).toEqual([
			{ id: 13, total: '0.089127' },
			{ id: 14, total: '0.019608' },
		]);
		expect(line.total_tax).toBe('0.108735');
	});

	it('line_item: total_tax and subtotal_tax both sum the stored rates', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [rate10, rate22],
			pricesIncludeTax: true,
			taxRoundAtSubtotal: true,
		});
		const lineItem = {
			quantity: 1,
			tax_class: '',
			meta_data: [posDataMeta({ price: 1, regular_price: 1, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line.taxes).toEqual([
			{ id: 13, subtotal: '0.089127', total: '0.089127' },
			{ id: 14, subtotal: '0.019608', total: '0.019608' },
		]);
		expect(line.total_tax).toBe('0.108735');
		expect(line.subtotal_tax).toBe('0.108735');
	});
});

/**
 * The three rules above, at NON-2-DECIMAL currencies.
 *
 * The suite already exercised dp=0 (JPY/KRW/VND) and dp=3 (KWD/BHD/OMR) — the
 * personas page records real merchants on all of them — but every one of those cases
 * asserted `price`, `total`, `total_tax` and `subtotal_tax` and **never `taxes[]`**.
 * That is precisely the field all three of the 2026-08-24 bugs lived in: the suite had
 * non-2dp coverage of everything except the thing that was broken.
 *
 * `getRoundingPrecision(dp) = max(dp + 2, 6)`, so per-rate storage stays at 6dp for
 * every currency ≤ 4 decimals while `total_tax` rounds to `dp`. At dp=0 that spread is
 * at its widest — the per-rate array holds six decimals and the sum rounds to a whole
 * unit — which makes round-each-then-sum vs round-the-sum a WHOLE YEN apart, not a
 * microunit.
 */
describe('line taxes at non-2-decimal currencies', () => {
	const half: TaxRateInput = {
		id: 1,
		rate: '1.0500',
		compound: false,
		order: 1,
		class: 'standard',
		shipping: true,
	};
	const halfAgain: TaxRateInput = { ...half, id: 2, order: 2 };
	const ten: TaxRateInput = {
		id: 6,
		rate: '10.0000',
		compound: false,
		order: 1,
		class: 'standard',
		shipping: true,
	};
	const twenty: TaxRateInput = { ...ten, id: 7, rate: '20.0000' };

	it('dp=0 (JPY): per-rate taxes keep 6dp while total_tax rounds to a whole yen', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [ten],
			pricesIncludeTax: true,
			taxRoundAtSubtotal: false,
			dp: 0,
		});
		const lineItem = {
			quantity: 1,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 999, regular_price: 999, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		// 999 − 999/1.1 = 90.818182 stored; half-DOWN to 0dp (prices include tax) = 91.
		expect(line.taxes).toEqual([{ id: 6, subtotal: '90.818182', total: '90.818182' }]);
		expect(line.total_tax).toBe('91');
	});

	/**
	 * The whole-yen case. Two rates of 1.05% on ¥1000 give 10.5 each.
	 *
	 *   round each, then sum (WooCommerce)  → 11 + 11 = 22
	 *   round the raw sum (the old bug)     → round(21) = 21
	 *
	 * At dp=2 the same defect was worth one microunit and was written off for sixteen
	 * days as a float tie. At dp=0 it is a whole unit of currency on the receipt.
	 */
	it('dp=0 (JPY): total_tax sums the ROUNDED per-rate taxes — 22, not 21', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [half, halfAgain],
			pricesIncludeTax: false,
			taxRoundAtSubtotal: false,
			dp: 0,
		});
		const lineItem = {
			quantity: 1,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 1000, regular_price: 1000, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line.taxes).toEqual([
			{ id: 1, subtotal: '10.500000', total: '10.500000' },
			{ id: 2, subtotal: '10.500000', total: '10.500000' },
		]);
		expect(line.total_tax).toBe('22');
	});

	it('dp=0 (JPY): round-at-subtotal ON sums the RAW per-rate taxes — 21', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [half, halfAgain],
			pricesIncludeTax: false,
			taxRoundAtSubtotal: true,
			dp: 0,
		});
		const lineItem = {
			quantity: 1,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 1000, regular_price: 1000, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line.total_tax).toBe('21');
	});

	it('dp=3 (KWD): per-rate taxes keep 6dp while total_tax rounds to 3', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [twenty],
			pricesIncludeTax: false,
			taxRoundAtSubtotal: false,
			dp: 3,
		});
		const lineItem = {
			quantity: 2,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 9.999, regular_price: 9.999, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		// 19.998 × 20% = 3.9996 stored; half-up to 3dp = 4.
		expect(line.taxes).toEqual([{ id: 7, subtotal: '3.999600', total: '3.999600' }]);
		expect(line.total_tax).toBe('4');
	});

	it('dp=0 (JPY): a fee keeps its per-rate tax unrounded too', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [ten],
			pricesIncludeTax: false,
			taxRoundAtSubtotal: false,
			dp: 0,
		});
		const feeLine = {
			tax_class: '',
			tax_status: 'taxable' as const,
			meta_data: [posDataMeta({ amount: '999', percent: false, prices_include_tax: true })],
		};

		const { line } = calculateCartLine({ kind: 'fee', line: feeLine, cartLineItems: [] }, config);

		expect(line.taxes).toEqual([{ id: 6, total: '90.818182' }]);
		expect(line.total_tax).toBe('91');
	});
});
