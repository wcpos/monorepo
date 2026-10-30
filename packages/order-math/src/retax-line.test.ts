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

it.each(['none', 'taxable', 'shipping'] as const)(
	'uses the product taxStatus override: %s',
	(taxStatus) => {
		const line = { product_id: 1, quantity: 1, subtotal: '100', total: '90', price: 100 };
		const result = retaxLine(
			{ kind: 'line_item', line, taxStatus },
			makeConfig({ rates: [{ ...rate, rate: '10' }] })
		);
		expect(result.line).toEqual({
			...line,
			total_tax: taxStatus === 'taxable' ? '9' : '0',
			subtotal_tax: taxStatus === 'taxable' ? '10' : '0',
			taxes: taxStatus === 'taxable' ? [{ id: 1, total: '9.000000', subtotal: '10.000000' }] : [],
		});
	}
);

it('lets the explicit product tax status win over POS metadata', () => {
	const line = { ...product, total: '100', subtotal: '100' };
	expect(retaxLine({ kind: 'line_item', line, taxStatus: 'none' }, makeConfig()).line).toEqual({
		...line,
		total_tax: '0',
		subtotal_tax: '0',
		taxes: [],
	});
});

it.each([false, true])('passes tombstones through unchanged, exempt=%s', (vatExempt) => {
	const config = makeConfig({ vatExempt });
	const productLine = {
		product_id: null,
		total: '90',
		subtotal: '100',
		total_tax: '9',
		subtotal_tax: '10',
		taxes: [{ id: 1, total: '9', subtotal: '10' }],
	};
	const fee = { name: null, total: '10', total_tax: '1', taxes: [{ id: 1, total: '1' }] };
	expect(retaxLine({ kind: 'line_item', line: productLine }, config)).toEqual({
		line: productLine,
		warnings: [],
	});
	expect(retaxLine({ kind: 'line_item', line: productLine }, config).line).toBe(productLine);
	expect(retaxLine({ kind: 'fee', line: fee }, config)).toEqual({ line: fee, warnings: [] });
	expect(retaxLine({ kind: 'fee', line: fee }, config).line).toBe(fee);
});
