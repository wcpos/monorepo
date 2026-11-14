import { calculateCartLine, createCartConfig, retaxCartLines } from './index';

const rate = { id: 1, rate: '10', compound: false, order: 1, class: 'standard', shipping: true };
const config = createCartConfig({
	rates: [rate],
	allRates: [rate],
	calcTaxes: true,
	pricesIncludeTax: false,
	taxRoundAtSubtotal: false,
	dp: 2,
	shippingTaxClass: '',
	taxClassSlugs: ['standard'],
	calcDiscountsSequentially: false,
});
const exempt = createCartConfig({ ...config, vatExempt: true });
const product = calculateCartLine(
	{
		kind: 'line_item',
		line: {
			product_id: 1,
			quantity: 1,
			subtotal: '10',
			total: '10',
			tax_class: '',
			meta_data: [{ key: '_woocommerce_pos_data', value: { price: 10, tax_status: 'taxable' } }],
		},
	},
	config
).line;
const fee = calculateCartLine(
	{
		kind: 'fee',
		line: {
			name: 'Handling',
			total: '5',
			tax_status: 'taxable',
			tax_class: '',
		},
		cartLineItems: [product],
	},
	config
).line;

it('zeroes only active products and fixed fees, with an exact stored-money round trip', () => {
	const tombstone = { ...product, product_id: null };
	const deletedFee = { ...fee, name: null };
	const percentFee = {
		...fee,
		meta_data: [{ key: '_woocommerce_pos_data', value: { percent: 'true' } }],
	};
	const shipping = {
		method_id: 'flat_rate',
		total: '2',
		total_tax: '0.2',
		taxes: [{ id: 1, total: '0.2' }],
	};
	const lines = {
		line_items: [product, tombstone],
		fee_lines: [fee, deletedFee, percentFee],
		shipping_lines: [shipping],
	};
	const before = JSON.stringify(lines);
	const zero = retaxCartLines(lines, exempt);
	expect(zero.changed).toBe(true);
	expect(zero.warnings).toEqual([]);
	expect(zero.line_items?.[0]).toEqual({
		...product,
		total_tax: '0',
		subtotal_tax: '0',
		taxes: [],
	});
	expect(zero.fee_lines?.[0]).toEqual({ ...fee, total_tax: '0', taxes: [] });
	expect(zero.line_items?.[1]).toBe(tombstone);
	expect(zero.fee_lines?.[1]).toBe(deletedFee);
	expect(zero.fee_lines?.[2]).toBe(percentFee);
	expect(JSON.stringify(lines)).toBe(before);
	expect(retaxCartLines(zero, config)).toEqual({
		line_items: lines.line_items,
		fee_lines: lines.fee_lines,
		changed: true,
		warnings: [],
	});
	const again = retaxCartLines(zero, exempt);
	expect(again.changed).toBe(false);
	expect(again).not.toHaveProperty('line_items');
	expect(again).not.toHaveProperty('fee_lines');
});

it('reads catalog status only for active products without POS data, preserving discounted money', () => {
	const web = { product_id: 2, quantity: 1, subtotal: '20', total: '15' };
	const taxStatusFor = jest.fn(() => 'none' as const);
	const result = retaxCartLines(
		{ line_items: [product, web, { ...web, product_id: null }] },
		config,
		{ taxStatusFor }
	);
	expect(taxStatusFor).toHaveBeenCalledTimes(1);
	expect(taxStatusFor).toHaveBeenCalledWith(web);
	expect(result.line_items?.[0]).toEqual(product);
	expect(result.line_items?.[1]).toEqual({ ...web, taxes: [], total_tax: '0', subtotal_tax: '0' });
});

it('leaves server-formatted exempt money untouched and omits both arrays', () => {
	const line = { ...product, total_tax: '0.00', subtotal_tax: '0.00', taxes: [] };
	expect(retaxCartLines({ line_items: [line] }, exempt)).toEqual({ changed: false, warnings: [] });
});
it('compares tax entry keys and numeric strings by value, retaining equal line objects', () => {
	const line = {
		...product,
		total_tax: '1.00',
		subtotal_tax: '1.00',
		taxes: product.taxes?.map(({ id, total, subtotal }) => ({ subtotal, total, id })),
	};
	expect(retaxCartLines({ line_items: [line] }, config)).toEqual({ changed: false, warnings: [] });
	const result = retaxCartLines({ line_items: [line, { ...product, total_tax: '99' }] }, config);
	expect(result.line_items?.[0]).toBe(line);
	expect(result).not.toHaveProperty('fee_lines');
});

it('omits an unchanged server-acked taxable fixed fee', () => {
	const serverFee = {
		...fee,
		total: '10.000000',
		total_tax: '1.000000',
		taxes: [{ id: 1, total: '1.000000', subtotal: '' }],
	};
	const result = retaxCartLines({ fee_lines: [serverFee] }, config);
	expect(result.changed).toBe(false);
	expect(result).not.toHaveProperty('fee_lines');
});
