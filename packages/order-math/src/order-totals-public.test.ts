import { calculateOrderTotals } from './internal/order-totals';
import { getOrderTotals } from './order-totals';
import { createCartConfig } from './config';
import { snapshotFromOrderJSON } from './snapshot';

// Realistic fixture borrowed from the basic-calculations test in internal/order-totals.test.ts
const taxRates = [
	{ id: 1, name: 'Tax 1', rate: '10', compound: false },
	{ id: 2, name: 'Tax 2', rate: '5', compound: true },
];

const orderJSON = {
	line_items: [
		{
			product_id: 1,
			subtotal: '100',
			total: '90',
			subtotal_tax: '10',
			total_tax: '9',
			taxes: [{ id: 1, total: '9' }],
		},
	],
	fee_lines: [
		{ name: 'Service fee', total: '5', total_tax: '0.5', taxes: [{ id: 2, total: '0.5' }] },
	],
	shipping_lines: [
		{ method_id: 'flat_rate', total: '10', total_tax: '1', taxes: [{ id: 1, total: '1' }] },
	],
	coupon_lines: [],
};

const config = createCartConfig({
	rates: taxRates,
	allRates: taxRates,
	calcTaxes: true,
	pricesIncludeTax: false,
	taxRoundAtSubtotal: false,
	dp: 2,
	shippingTaxClass: 'standard',
	calcDiscountsSequentially: false,
});

test('getOrderTotals returns same values as calculateOrderTotals directly', () => {
	const snapshot = snapshotFromOrderJSON(orderJSON);

	const publicResult = getOrderTotals(snapshot, config);

	const internalResult = calculateOrderTotals({
		lineItems: [...(snapshot.line_items ?? [])],
		feeLines: [...(snapshot.fee_lines ?? [])],
		shippingLines: [...(snapshot.shipping_lines ?? [])],
		couponLines: [...(snapshot.coupon_lines ?? [])],
		taxRates: [...config.allRates],
		taxRoundAtSubtotal: config.taxRoundAtSubtotal,
		dp: config.dp,
		pricesIncludeTax: config.pricesIncludeTax,
	});

	expect(publicResult).toEqual(internalResult);
});

test('getOrderTotals produces correct totals for the fixture', () => {
	const snapshot = snapshotFromOrderJSON(orderJSON);
	const result = getOrderTotals(snapshot, config);

	expect(result.discount_total).toBe('10');
	expect(result.shipping_total).toBe('10');
	expect(result.cart_tax).toBe('9.5');
	expect(result.total).toBe('115.5');
	expect(result.total_tax).toBe('10.5');
	expect(result.subtotal).toBe('100');
	expect(result.fee_total).toBe('5');
});

test('getOrderTotals with empty snapshot returns zeroed totals', () => {
	const emptySnapshot = snapshotFromOrderJSON({});
	const result = getOrderTotals(emptySnapshot, config);

	expect(result.total).toBe('0');
	expect(result.total_tax).toBe('0');
	expect(result.discount_total).toBe('0');
	expect(result.tax_lines).toEqual([]);
});
