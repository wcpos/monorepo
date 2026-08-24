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
	taxClassSlugs: ['standard', 'reduced-rate', 'zero-rate'],
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
					id: 1,
					subtotal: '33.330000',
					total: '33.330000',
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

	it('authors per-rate line taxes at the fixed six-decimal contract width', () => {
		const config = createCartConfig({
			...baseConfig,
			rates: [rate20],
			allRates: [rate20],
			taxRoundAtSubtotal: true,
		});
		const lineItem = {
			quantity: 1,
			tax_class: 'standard',
			meta_data: [posDataMeta({ price: 18.38235, tax_status: 'taxable' })],
		};

		const { line } = calculateCartLine({ kind: 'line_item', line: lineItem }, config);

		expect(line.taxes).toEqual([{ id: 1, subtotal: '3.676470', total: '3.676470' }]);
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

		const { line, warnings } = calculateCartLine(
			{ kind: 'shipping', cartLineItems: [], line: shippingLine },
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

		const { line } = calculateCartLine(
			{ kind: 'shipping', cartLineItems: [], line: shippingLine },
			config
		);

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

		const { line } = calculateCartLine(
			{ kind: 'shipping', cartLineItems: [], line: shippingLine },
			config
		);

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

		const { line } = calculateCartLine(
			{ kind: 'shipping', cartLineItems: [], line: shippingLine },
			config
		);

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

		const { line } = calculateCartLine(
			{ kind: 'shipping', cartLineItems: [], line: shippingLine },
			config
		);

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

		const { line } = calculateCartLine(
			{ kind: 'shipping', cartLineItems: [], line: shippingLine },
			config
		);

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

		const { line } = calculateCartLine(
			{ kind: 'shipping', cartLineItems: [], line: shippingLine },
			config
		);

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
		// 'inherit' resolves against the cart's line items — with none, WooCommerce falls
		// back to standard. The cart-dependent cases live in the describe below.
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
					cartLineItems: [],
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
			taxClassSlugs: ['standard', 'reduced-rate', 'zero-rate'],
		});

		const { line } = calculateCartLine(
			{
				kind: 'shipping',
				cartLineItems: [],
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

		const result = calculateCartLine({ kind: 'shipping', line, cartLineItems: [] }, config);

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
			{
				kind: 'shipping',
				line,
				cartLineItems: [],
				changes: { amount: 25, method_title: 'Express' },
			},
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
			{ kind: 'shipping', line, cartLineItems: [], changes: { tax_status: 'none' } },
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
 * `'inherit'` — WooCommerce's "shipping tax class based on cart items" — ported from
 * the `'inherit'` branch of `WC_Abstract_Order::calculate_taxes()`. It is NOT a
 * spelling of the standard class, which is what this package used to treat it as:
 * `extractShippingLineData` collapsed it to `''`, so a cart of entirely reduced-rate
 * items was charged standard-rate shipping tax.
 */
describe('calculateCartLine — inherited shipping tax class', () => {
	const shippingRate = (id: number, cls: string, rate: string): TaxRateInput => ({
		id,
		class: cls,
		rate,
		compound: false,
		order: 1,
		shipping: true,
	});

	const rates = [
		shippingRate(101, 'standard', '10.0000'),
		shippingRate(202, 'reduced-rate', '5.0000'),
		shippingRate(303, 'zero-rate', '0.0000'),
	];

	const config = createCartConfig({
		...baseConfig,
		rates,
		shippingTaxClass: 'inherit',
		taxClassSlugs: ['standard', 'reduced-rate', 'zero-rate'],
	});

	const item = (tax_class: string, tax_status: 'taxable' | 'none' = 'taxable') => ({
		name: 'Item',
		quantity: 1,
		tax_class,
		meta_data: [
			{
				key: '_woocommerce_pos_data',
				value: JSON.stringify({ price: '10', regular_price: '10', tax_status }),
			},
		],
	});

	const shippingTaxFor = (cartLineItems: ReturnType<typeof item>[]) => {
		const { line } = calculateCartLine(
			{
				kind: 'shipping',
				cartLineItems,
				line: { method_title: 'Flat rate', total: '100', total_tax: '0' },
			},
			config
		);
		return line;
	};

	it('takes the class from a cart of a single non-standard class', () => {
		const line = shippingTaxFor([item('reduced-rate')]);

		// The bug this fixes: standard ('10') was charged here.
		expect(line.total_tax).toBe('5');
		expect(line.taxes).toEqual([{ id: 202, total: '5' }]);
	});

	it('lets the standard class win whenever ANY item carries it', () => {
		// Order in the CART is reduced-first; WooCommerce's array_intersect walks the
		// CANDIDATE order, which puts standard ahead of everything.
		const line = shippingTaxFor([item('reduced-rate'), item('')]);

		expect(line.taxes).toEqual([{ id: 101, total: '10' }]);
	});

	it('falls to the first CONFIGURED class when the cart has several non-standard ones', () => {
		// Cart order is zero-rate first, but reduced-rate comes first in taxClassSlugs.
		const line = shippingTaxFor([item('zero-rate'), item('reduced-rate')]);

		expect(line.taxes).toEqual([{ id: 202, total: '5' }]);
	});

	it('falls back to the standard class when there are no line items at all', () => {
		// A shipping-only order has nothing to inherit from. Matches WooCommerce's
		// "Orders without product line items have no tax class to inherit" branch.
		expect(shippingTaxFor([]).taxes).toEqual([{ id: 101, total: '10' }]);
	});

	it('charges NO shipping tax when every line item is non-taxable', () => {
		// get_items_tax_classes() skips non-taxable items, so $found_classes is empty
		// while $this->get_items() is not — WooCommerce yields false, not ''. Charging
		// standard here would invent tax on an order WooCommerce leaves untaxed.
		const line = shippingTaxFor([item('', 'none')]);

		expect(line.total_tax).toBe('0');
		expect(line.taxes).toEqual([]);
	});

	it('ignores tombstoned line items when inheriting', () => {
		// Tombstone convention for line items is product_id === null (see snapshot.ts).
		const tombstone = { ...item('reduced-rate'), product_id: null } as never;
		const line = shippingTaxFor([tombstone]);

		// Only a removed line remains, so the cart is empty for inheritance purposes.
		expect(line.taxes).toEqual([{ id: 101, total: '10' }]);
	});

	it('never inherits when the LINE carries its own tax class', () => {
		const { line } = calculateCartLine(
			{
				kind: 'shipping',
				cartLineItems: [item('reduced-rate')],
				line: {
					method_title: 'Flat rate',
					total: '100',
					total_tax: '0',
					meta_data: [
						{
							key: '_woocommerce_pos_data',
							value: JSON.stringify({ amount: '100', tax_class: 'zero-rate' }),
						},
					],
				},
			},
			config
		);

		// The merchant chose zero-rate; the cart does not override that.
		expect(line.taxes).toEqual([{ id: 303, total: '0' }]);
	});
});
