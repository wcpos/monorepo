import { calculateCartLine } from './cart-line';
import { createCartConfig } from './config';
import { retaxLine } from './retax-line';

import type { CartConfigInput } from './config';
import type { LineItemInput } from './types';

const rate = { id: 1, rate: '7.25', compound: false, order: 1, class: 'standard', shipping: true };
const makeConfig = (overrides: Partial<CartConfigInput> = {}) =>
	createCartConfig({
		rates: [rate],
		allRates: [rate],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		taxClassSlugs: ['standard', 'reduced'],
		calcDiscountsSequentially: false,
		...overrides,
	});
const product: LineItemInput = {
	product_id: 1,
	quantity: 3,
	tax_class: '',
	meta_data: [{ key: '_woocommerce_pos_data', value: { price: 12.37, tax_status: 'taxable' } }],
};

// A non-whole-cent tax catches per-rate/aggregate rounding and string-shape drift.
describe.each([false, true])(
	'stored-money equivalence, roundAtSubtotal=%s',
	(taxRoundAtSubtotal) => {
		describe.each([false, true])('compound=%s', (compound) => {
			const rates = compound
				? [rate, { ...rate, id: 2, rate: '3.5', compound: true, order: 2 }]
				: [rate];
			const config = makeConfig({ rates, allRates: rates, taxRoundAtSubtotal });
			const exempt = createCartConfig({ ...config, vatExempt: true });
			it('pins product equivalence, idempotence and exemption round trip', () => {
				const line = calculateCartLine({ kind: 'line_item', line: product }, config).line;
				const once = retaxLine({ kind: 'line_item', line }, config);
				expect(once).toEqual({ line, warnings: [] });
				expect(retaxLine({ kind: 'line_item', line: once.line }, config)).toEqual(once);
				const zero = retaxLine({ kind: 'line_item', line }, exempt).line;
				expect(zero).toEqual({ ...line, taxes: [], total_tax: '0', subtotal_tax: '0' });
				expect(retaxLine({ kind: 'line_item', line: zero }, config).line).toEqual(line);
			});
			it('pins fee equivalence, idempotence and exemption round trip', () => {
				const line = calculateCartLine(
					{
						kind: 'fee',
						line: { name: 'Fee', total: '12.37', tax_class: '', tax_status: 'taxable' },
						cartLineItems: [],
					},
					config
				).line;
				const once = retaxLine({ kind: 'fee', line }, config);
				expect(once).toEqual({ line, warnings: [] });
				expect(retaxLine({ kind: 'fee', line: once.line }, config)).toEqual(once);
				const zero = retaxLine({ kind: 'fee', line }, exempt).line;
				expect(zero).toEqual({ ...line, taxes: [], total_tax: '0' });
				expect(retaxLine({ kind: 'fee', line: zero }, config).line).toEqual(line);
			});
			it.each(['', 'inherit'])(
				'pins shipping equivalence, idempotence and round trip for class %s',
				(shippingTaxClass) => {
					const shippingConfig = createCartConfig({ ...config, shippingTaxClass });
					const input = {
						kind: 'shipping' as const,
						line: { method_id: 'flat_rate', total: '12.37' },
						cartLineItems: [product],
					};
					const line = calculateCartLine(input, shippingConfig).line;
					const once = retaxLine({ ...input, line }, shippingConfig);
					expect(once).toEqual({ line, warnings: [] });
					expect(retaxLine({ ...input, line: once.line }, shippingConfig)).toEqual(once);
					const zero = retaxLine(
						{ ...input, line },
						createCartConfig({ ...shippingConfig, vatExempt: true })
					).line;
					expect(zero).toEqual({ ...line, taxes: [], total_tax: '0' });
					expect(retaxLine({ ...input, line: zero }, shippingConfig).line).toEqual(line);
				}
			);
		});
	}
);

it.each([undefined, [{ id: 9, key: 'custom', value: 'untouched' }]])(
	'preserves discounted imported money and metadata: %s',
	(meta_data) => {
		const line = {
			product_id: 1,
			quantity: 1,
			subtotal: '100',
			total: '90',
			price: 100,
			meta_data,
		};
		const before = structuredClone(line);
		const result = retaxLine(
			{ kind: 'line_item', line },
			makeConfig({ rates: [{ ...rate, rate: '10' }] })
		);
		expect(result.line).toEqual({
			...line,
			total_tax: '9',
			subtotal_tax: '10',
			taxes: [{ id: 1, total: '9.000000', subtotal: '10.000000' }],
		});
		expect(result.line.meta_data).toBe(meta_data);
		expect(line).toEqual(before);
	}
);

it('inherits a reduced shipping class and excludes non-shipping rates', () => {
	const config = makeConfig({
		shippingTaxClass: 'inherit',
		rates: [
			rate,
			{ ...rate, id: 2, class: 'reduced', rate: '5' },
			{ ...rate, id: 3, class: 'reduced', shipping: false },
		],
	});
	const line = { total: '100' };
	expect(
		retaxLine(
			{ kind: 'shipping', line, cartLineItems: [{ ...product, tax_class: 'reduced' }] },
			config
		).line
	).toEqual({ ...line, total_tax: '5', taxes: [{ id: 2, total: '5' }] });
	expect(
		retaxLine(
			{
				kind: 'shipping',
				line,
				cartLineItems: [
					{
						...product,
						meta_data: [{ key: '_woocommerce_pos_data', value: { tax_status: 'none' } }],
					},
				],
			},
			config
		).line
	).toEqual({ ...line, total_tax: '0', taxes: [] });
});
