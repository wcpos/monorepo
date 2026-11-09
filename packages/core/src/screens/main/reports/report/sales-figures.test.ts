import sumBy from 'lodash/sumBy';

import { createTestT } from '../../../../../jest/translate';
import { panelSpec } from '../panels/specs';
import { salesFigures } from './sales-figures';
import { summarySpec } from './summary';

import type { DetailId, RefundRow, ReportOrder } from '../context';
import type { SalesFigures } from './sales-figures';

const t = createTestT();
const formats = {
	money: (n: number | null | undefined) => `£${Number(n).toFixed(2)}`,
	number: String,
	quantity: String,
	percent: String,
};
const identity = (register: string, cashier: string) => [
	{ key: '_wcpos_register', value: register },
	{ key: '_pos_user', value: cashier },
	{ key: '_pos_store', value: '1' },
];
// One period: a split sale at the front till (cash and card) refunded in part the same day, an
// online card order, and a sale at the back till that still needs paying.
const split = {
	id: 1,
	uuid: 'split',
	number: '101',
	total: '99',
	total_tax: '9',
	created_via: 'woocommerce-pos',
	payment_method: 'pos_cash',
	payment_method_title: 'Cash drawer',
	tax_lines: [{ rate_id: 1, label: 'VAT', tax_total: '9' }],
	line_items: [
		{ product_id: 1, name: 'Shirt', quantity: 2, total: '50', total_tax: '5' },
		{ product_id: 2, name: 'Hat', quantity: 1, total: '40', total_tax: '4' },
	],
	meta_data: [
		...identity('front', '7'),
		{
			key: '_wcpos_payments',
			value: JSON.stringify({
				schema: 1,
				payments: [
					{ id: 'a', kind: 'cash', method_id: 'pos_cash', status: 'captured', amount: '40' },
					{ id: 'b', kind: 'card', method_id: 'stripe', status: 'captured', amount: '59' },
				],
			}),
		},
	],
};
const orders = [
	split,
	{
		id: 2,
		uuid: 'online',
		total: '20',
		total_tax: '2',
		created_via: 'checkout',
		payment_method: 'stripe',
		payment_method_title: 'Card',
		tax_lines: [{ rate_id: 1, label: 'VAT', tax_total: '2' }],
		line_items: [{ product_id: 1, name: 'Shirt', quantity: 1, total: '18', total_tax: '2' }],
	},
	{
		id: 3,
		uuid: 'owed',
		total: '10',
		created_via: 'woocommerce-pos',
		needs_payment: true,
		line_items: [{ product_id: 3, name: 'Mug', quantity: 1, total: '10' }],
		meta_data: identity('back', '8'),
	},
] as ReportOrder[];
const refunds = [
	{
		id: 9,
		parent_id: 1,
		parentNumber: '101',
		amount: '25',
		line_items: [{ product_id: 1, name: 'Shirt', quantity: -1, total: '-22.5', total_tax: '-2.5' }],
	},
] as RefundRow[];
const directory = [1, 2, 3].map((id) => ({ id, categories: [{ id: 10, name: 'Goods' }] }));
const figures = salesFigures({ orders, refunds, decimals: 2 });
const view = {
	orders,
	names: { cashier: { '7': 'Priya', '8': 'Alex' }, register: {}, store: { '1': 'Shop' } },
	directory,
};
const panel = (id: DetailId, over: SalesFigures = figures) => panelSpec(id, over, formats, t, view);
const amountOf = (spec: ReturnType<typeof panel>) => spec.totalRaw[spec.keys.indexOf('amount')];
const printed = (over: SalesFigures = figures, storeNames?: Record<string, string>) =>
	summarySpec({ figures: over, registerNames: {}, cashierNames: {}, storeNames }, t, formats);
const group = (key: string, over?: SalesFigures, storeNames?: Record<string, string>) =>
	printed(over, storeNames).groups!.find((row) => row.key === key);

// A surface that sums its own way, or reads a different set of orders, falls out of these.
describe('every part sums to the period figure', () => {
	it.each([
		['takenByTender', figures.takenByTender],
		['byCashier', figures.byCashier],
		['byRegister', figures.byRegister],
		['byStore', figures.byStore],
		['byChannel', figures.byChannel],
	] as const)('%s', (_name, rows) => {
		expect(figures.gross).toBe(129);
		expect(sumBy(rows, 'amount')).toBe(figures.gross);
		expect(sumBy(rows, 'orders')).toBeGreaterThanOrEqual(figures.count);
	});
	it('the printed cashier and register groups, and the taxes', () => {
		expect(group('cashiers')!.totalRaw[2]).toBe(figures.gross);
		expect(group('registers')!.totalRaw[2]).toBe(figures.gross);
		expect(sumBy(figures.taxesByRate.rows, 'tax')).toBe(figures.tax);
		expect(figures.taxesByRate.net + figures.taxesByRate.tax).toBe(figures.gross);
		expect(figures.net + figures.tax).toBe(figures.gross);
	});
	it('the split sale counts once under each tender it touched, and the owed sale is unpaid', () => {
		expect(figures.takenByTender.map((row) => [row.key, row.amount, row.orders])).toEqual([
			['stripe', 79, 2],
			['cash', 40, 1],
			['unpaid', 10, 1],
		]);
	});
});
describe('a card and its panel agree where they read the same figure', () => {
	it.each([
		['payments', figures.takenByTender],
		['cashiers', figures.byCashier],
		['channels', figures.byChannel],
		['registers', figures.byRegister],
		['stores', figures.byStore],
	] as const)('%s', (id, rows) => {
		const spec = panel(id);
		expect(spec.rows.map((row) => row.key)).toEqual(rows.map((row) => row.key));
		expect(amountOf(spec)).toBe(id === 'payments' || id === 'cashiers' ? figures.gross : 129);
	});
	it('taxes: the card figures are the panel footer', () => {
		expect(panel('taxes').totalRaw).toEqual([
			'Total',
			figures.taxesByRate.net,
			figures.taxesByRate.tax,
			figures.taxesByRate.gross,
		]);
	});
	it('refunds: the card, the panel footer and the printed row are one figure', () => {
		expect(figures.refunds.refunded).toBe(25);
		expect(amountOf(panel('refunds'))).toBe(figures.refunds.refunded);
		expect(group('sales')!.rows.find((row) => row.key === 'refunds')!.raw).toEqual([
			'Refunded',
			1,
			-figures.refunds.refunded,
		]);
	});
});
// Ledger 35, 36: the hero is gross; the panels, and the Top products and Categories cards, net the
// period refunds into their groupings.
it('netting refunds moves the products and categories by exactly the refunded lines', () => {
	const sales = salesFigures({ orders, decimals: 2 });
	const gross = sumBy(sales.products.netOfRefunds(directory), 'amount');
	expect(gross).toBe(129);
	expect(sumBy(figures.products.netOfRefunds(directory), 'amount')).toBe(gross - 25);
	expect(amountOf(panel('products'))).toBe(gross - 25);
	expect(sumBy(sales.categories.netOfRefunds(directory).parts, 'amount')).toBe(gross);
	expect(sumBy(figures.categories.netOfRefunds(directory).parts, 'amount')).toBe(gross - 25);
	expect(amountOf(panel('categories'))).toBe(gross - 25);
});
it('the printed Payment methods rows are the tenders, and Taken leaves out what is owed', () => {
	const payments = group('payments')!;
	expect(payments.rows.map((row) => [row.key, row.raw[2]])).toEqual(
		figures.takenByTender.map((row) => [row.key, row.amount])
	);
	expect(payments.totalRaw[2]).toBe(figures.gross - 10);
	expect(printed().totalRaw).toEqual(['Total sales', figures.count, figures.gross]);
	expect(panel('orders').totalRaw[4]).toBe(figures.gross);
});
it('the figures that read no refunds keep their answers when the refunds arrive', () => {
	const before = salesFigures({ orders, decimals: 2 });
	const after = before.withRefunds(refunds);
	expect(after.takenByTender).toBe(before.takenByTender);
	expect(after.orderStats).toBe(before.orderStats);
	expect(before.refunds.refunded).toBe(0);
	expect(after.refunds.refunded).toBe(25);
});

// Which named figure each panel and printed group reads. A pin fails when a surface starts
// reading another figure: change the name it reads, and this table, on purpose.
const pin = {
	key: 'pin',
	label: 'Pinned',
	name: 'Pinned',
	amount: 1,
	orders: 1,
	quantity: 1,
	share: 1,
};
const decoy = { ...pin, key: 'decoy' };
const parts = (row: typeof pin) => ({ parts: [row], unknownLines: 0, totalLines: 1 });
describe('each panel reads its named figure', () => {
	it.each([
		['payments', { takenByTender: [pin] }],
		['cashiers', { byCashier: [pin] }],
		['channels', { byChannel: [pin] }],
		['registers', { byRegister: [pin] }],
		['stores', { byStore: [pin] }],
		[
			'taxes',
			{
				taxesByRate: {
					rows: [{ ...pin, rateId: 'pin', tax: 1, net: 1 }],
					net: 1,
					tax: 1,
					gross: 2,
				},
			},
		],
		['products', { products: { netOfRefunds: () => [pin] } }],
		['categories', { categories: { netOfRefunds: () => parts(pin) } }],
		['brands', { brands: { gross: () => parts(decoy), netOfRefunds: () => parts(pin) } }],
	] as const)('%s', (id, over) => {
		const spec = panel(id, { ...figures, ...over } as unknown as SalesFigures);
		expect(spec.rows.map((row) => row.key)).toEqual(['pin']);
	});
	it('refunds reads the refunds figure; orders and the footers read gross', () => {
		const over = { ...figures, refunds: { ...figures.refunds, refunded: 7 }, gross: 3 };
		expect(amountOf(panel('refunds', over))).toBe(7);
		expect(panel('orders', over).totalRaw[4]).toBe(3);
		expect(amountOf(panel('payments', over))).toBe(3);
	});
	// Paid by is the order's own method, not the ledger: the split sale reads "Cash drawer".
	it("the Orders panel's Paid by reads the order's payment method", () => {
		const row = panel('orders').rows.find((row) => row.key === 'split')!;
		expect(row.cells[3]).toBe('Cash drawer');
	});
});
describe('each printed group reads its named figure', () => {
	const rows = (key: string, over: object, storeNames?: Record<string, string>) =>
		group(key, { ...figures, ...over } as SalesFigures, storeNames)?.rows.map((row) => row.key);
	it.each([
		['payments', { takenByTender: [pin] }, ['pin']],
		[
			'taxes',
			{ taxesByRate: { rows: [{ rateId: 5, label: 'Pinned', tax: 1, net: 1 }], tax: 1 } },
			['5'],
		],
		['shipping', { shipping: [{ method_id: 'pin', total: 1, total_tax: 0 }] }, ['pin']],
		[
			'registers',
			{
				registersStamped: [
					{ registerId: 'a', totalOrders: 1, totalAmount: 1 },
					{ registerId: 'b', totalOrders: 1, totalAmount: 1 },
				],
				byRegister: [pin, { ...pin, key: 'online' }],
			},
			['pin', 'online'],
		],
		['cashiers', { byCashier: [pin, { ...pin, key: 'pin2' }] }, ['pin', 'pin2']],
	] as const)('%s', (key, over, expected) => {
		expect(rows(key, over)).toEqual(expected);
	});
	it('stores reads byStore under All stores only', () => {
		expect(rows('stores', { byStore: [pin] }, { pin: 'Pinned' })).toEqual(['pin']);
		expect(rows('stores', { byStore: [pin] })).toBeUndefined();
	});
	it('the refund row reads the period refunds once known, the embedded ones until then', () => {
		const refundRow = (over: object) =>
			group('sales', { ...figures, ...over } as SalesFigures)!.rows.find(
				(row) => row.key === 'refunds'
			)?.raw[2];
		expect(refundRow({ refunds: { refunded: 7 }, embeddedRefunds: 5 })).toBe(-7);
		expect(refundRow({ refundRows: undefined, embeddedRefunds: 5 })).toBe(-5);
	});
});

// Paul 2026-11-09, ruling 2: the paper prints the figure its card and panel show.
describe('the printed groups print what the cards and panels show', () => {
	const rowsOf = (spec: { rows: { raw: (string | number)[] }[] }, columns: number[]) =>
		spec.rows.map((row) => columns.map((column) => row.raw[column]));
	it('Registers names the online and no-register orders, as the Where sold Registers view does', () => {
		const printedRows = group('registers')!;
		expect(printedRows.rows.map((row) => row.key)).toContain('online');
		expect(rowsOf(printedRows, [1, 2])).toEqual(rowsOf(panel('registers'), [1, 3]));
		expect(printedRows.rows.find((row) => row.key === 'online')!.raw[0]).toBe('Online');
	});
	it('Cashiers prints one row per cashier under All stores, as the Cashiers card does', () => {
		const twoStores = salesFigures({
			orders: [
				...orders,
				{
					...split,
					uuid: 'other-store',
					meta_data: [...identity('far', '7').slice(0, 2), { key: '_pos_store', value: '2' }],
				},
			] as ReportOrder[],
			decimals: 2,
		});
		const printedRows = group('cashiers', twoStores, { '1': 'Shop', '2': 'Far' })!;
		expect(printedRows.rows.map((row) => row.key)).toEqual(
			twoStores.byCashier.map((row) => row.key)
		);
		expect(new Set(printedRows.rows.map((row) => row.key)).size).toBe(printedRows.rows.length);
		expect(rowsOf(printedRows, [1, 2])).toEqual(
			rowsOf(panelSpec('cashiers', twoStores, formats, t, view), [1, 3])
		);
	});
	it('a rate with neither label nor code reads "Tax" on the panel and the paper, as on the card', () => {
		const bare = salesFigures({
			orders: [
				{ ...orders[1], tax_lines: [{ rate_id: 4, label: '', tax_total: '2' }] },
			] as ReportOrder[],
			decimals: 2,
		});
		expect(group('taxes', bare)!.rows[0].cells[0]).toBe('Tax');
		expect(panelSpec('taxes', bare, formats, t, view).rows[0].cells[0]).toBe('Tax');
	});
	it('Taxes prints the rounded rates and labels the Taxes card and panel show', () => {
		const unrounded = salesFigures({
			orders: [
				{
					...orders[1],
					tax_lines: [{ rate_id: 4, label: '', rate_code: 'GB-VAT-1', tax_total: '2.004' }],
				},
			] as ReportOrder[],
			decimals: 2,
		});
		const printedRows = group('taxes', unrounded)!;
		expect(rowsOf(printedRows, [0, 2])).toEqual([['GB-VAT-1', 2]]);
		expect(rowsOf(printedRows, [0, 2])).toEqual(
			rowsOf(panelSpec('taxes', unrounded, formats, t, view), [0, 2])
		);
	});
});
