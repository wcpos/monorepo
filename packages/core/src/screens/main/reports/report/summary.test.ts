import { createTestT } from '../../../../../jest/translate';
import { summarySpec } from './summary';
import { calculateTotals } from './utils';

const t = createTestT();
const formats = {
	money: (n: number | null | undefined) => `£${Number(n).toFixed(2)}`,
	number: String,
	quantity: (n: number | null | undefined) => `${n} items`,
};
const orders = ['cash', 'card'].map((method) => ({
	total: '12',
	total_tax: '2',
	payment_method: method,
	payment_method_title: method,
	tax_lines: [{ rate_id: 1, label: 'VAT', tax_total: '2' }],
	line_items: [{ quantity: 1.5 }],
	meta_data: [
		{ key: '_wcpos_register', value: 'front' },
		{ key: '_pos_user', value: '7' },
		{ key: '_pos_store', value: '1' },
	],
}));
const inputs = () => ({
	totals: calculateTotals({ orders }),
	orders: 2,
	registerNames: { front: 'Front', back: 'Back' },
	cashierNames: { '7': 'Priya', '8': 'Alex' },
	num_decimals: 2,
});
// Missing groups, wrong signs, or rendering identifiers instead of names changes the paper.
it('groups two orders into Sales, Payment methods, Taxes and Orders with the sales subtotal', () => {
	const spec = summarySpec(inputs(), t, formats);
	expect(spec.keys).toEqual(['line', 'count', 'amount']);
	expect(spec.groups?.map((group) => group.label)).toEqual([
		'Sales',
		'Payment Methods',
		'Taxes',
		'Orders',
	]);
	expect(spec.groups?.[0].total).toEqual(['Total sales', '', '£24.00']);
	expect(spec.totalRaw).toEqual(['Total sales', 2, 24]);
	expect(spec.groups?.at(-1)?.rows[0].cells).toEqual(['Items sold', '3 items', '']);
	expect(spec.groups?.at(-1)?.totalRaw).toEqual(['', '', '']);
});
it('includes both register names only for multiple registers', () => {
	const input = inputs();
	input.totals.registerArray = [
		{ registerId: 'front', totalOrders: 1, totalAmount: 12 },
		{ registerId: 'back', totalOrders: 1, totalAmount: 12 },
	];
	const group = summarySpec(input, t, formats).groups?.find((group) => group.key === 'registers');
	expect(group?.rows.map((row) => row.cells)).toEqual([
		['Front', '1', '£12.00'],
		['Back', '1', '£12.00'],
	]);
});
it('uses known period refunds, otherwise embedded refunds, and omits zero refunds', () => {
	const input = inputs();
	input.totals.refundTotal = 9;
	const sales = (extra = {}) => summarySpec({ ...input, ...extra }, t, formats).groups![0];
	expect(sales().rows.find((row) => row.key === 'refunds')?.raw).toEqual(['Refunded', '', -9]);
	expect(sales({ periodRefunds: [] }).rows.some((row) => row.key === 'refunds')).toBe(false);
	expect(
		sales({ periodRefunds: [{ id: 1, parent_id: 42, amount: '3.456' }] }).rows.find(
			(row) => row.key === 'refunds'
		)
	).toMatchObject({ raw: ['Refunded', 1, -3.46], cells: ['Refunded', '1', '£-3.46'] });
});
it('includes shipping and cashier names, with empty cells left empty', () => {
	const input = inputs();
	input.totals.shippingTotalsArray = [{ method_id: 'pickup', total: 2, total_tax: 0 }];
	input.totals.userStoreArray = [
		{ cashierId: '7', storeId: '1', totalOrders: 1, totalAmount: 12 },
		{ cashierId: '8', storeId: '1', totalOrders: 1, totalAmount: 12 },
	];
	const groups = summarySpec(input, t, formats).groups!;
	expect(groups.find((group) => group.key === 'cashiers')?.rows.map((row) => row.cells[0])).toEqual(
		['Priya', 'Alex']
	);
	expect(groups.find((group) => group.key === 'shipping')?.rows[0]).toMatchObject({
		raw: ['pickup', '', 2],
		cells: ['pickup', '', '£2.00'],
	});
});
