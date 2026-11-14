import { createTestT } from '../../../../jest/translate';
import { brands, chainLabel, cogsEnabled, lineCost, marginOf, topLevelOf } from './margin';
import { categories, topProducts } from './cards/aggregate';
import { calculateTotals } from './report/utils';

import type { ReportOrder } from './context';

// Reading cogs_value, multiplying cost again, using gross sales, or counting missing cost as zero breaks these.
it('a costed line reads cost_of_goods_sold.value', () => {
	expect(lineCost({ quantity: 2, cost_of_goods_sold: { value: 25 } })).toBe(25);
	expect(lineCost({ cost_of_goods_sold: { value: 0 } })).toBe(0);
	expect(lineCost({ cost_of_goods_sold: { value: Infinity } })).toBeNull();
});
it('a line with cogs_value null and no cost_of_goods_sold is cost missing, not zero', () => {
	const line = { total: '10', cogs_value: null };
	expect(lineCost(line)).toBeNull();
	expect(lineCost({ cost_of_goods_sold: { value: null } })).toBeNull();
});
it('profit is net sales minus cost and margin is profit over net', () => {
	expect(
		marginOf([{ total: '100', total_tax: '20', quantity: 2, cost_of_goods_sold: { value: 25 } }], 2)
	).toMatchObject({ net: 100, cost: 25, profit: 75, marginPct: 0.75, missing: 0, items: 2 });
});
it('a row with every cost missing has null margin', () => {
	expect(marginOf([{ total: '100', quantity: 1.5 }])).toMatchObject({
		marginPct: null,
		missing: 1,
		items: 1.5,
	});
});
it('partial margins use only costed sales, but retain the missing quantity', () => {
	expect(
		marginOf([
			{ total: '100', quantity: 2, cost_of_goods_sold: { value: 25 } },
			{ total: '50', quantity: 1.5 },
		])
	).toMatchObject({
		net: 150,
		cost: 25,
		profit: 75,
		marginPct: 0.75,
		missing: 1,
		missingItems: 1.5,
		items: 3.5,
	});
});
it('cogsEnabled is true from an order-level object alone', () => {
	expect(cogsEnabled([{ cost_of_goods_sold: { total_value: 0 } }], [])).toBe(true);
	expect(cogsEnabled([], [{ id: 1, cost_of_goods_sold: {} }])).toBe(true);
});
it('cogsEnabled is false for orders without the key and products without it', () => {
	expect(cogsEnabled([{}], [{ id: 1 }])).toBe(false);
	expect(cogsEnabled([{ cost_of_goods_sold: null }], [])).toBe(false);
});
const tree = new Map([
	[1, { id: 1, name: 'Coffee', parent: 0 }],
	[2, { id: 2, name: 'Beans', parent: 1 }],
	[3, { id: 3, name: 'Lost', parent: 99 }],
]);
it('topLevelOf walks parents and stops at a missing node', () => {
	expect(topLevelOf(2, tree)).toEqual({ id: 1, name: 'Coffee' });
	expect(topLevelOf(3, tree)).toEqual({ id: 3, name: 'Lost' });
});
it('chainLabel joins the chain', () => {
	expect(chainLabel(2, tree, createTestT()('reports.chain_separator'))).toBe('Coffee › Beans');
});
it("brands groups by the product's first brand with unknown and nobrand keys", () => {
	const orders = [
		{
			line_items: [
				{ product_id: 1, total: '10', quantity: 1 },
				{ product_id: 2, total: '5', quantity: 1.5 },
				{ product_id: 3, total: '2', quantity: 1 },
			],
		},
	] as ReportOrder[];
	const result = brands(
		orders,
		[
			{
				id: 1,
				brands: [
					{ id: 4, name: 'Acme' },
					{ id: 5, name: 'Ignored' },
				],
			},
			{ id: 2 },
		],
		calculateTotals({ orders }),
		2
	);
	expect(result.parts.map(({ key, amount }) => [key, amount])).toEqual([
		['4', 10],
		['nobrand', 5],
		['unknown', 2],
	]);
	expect(result).toMatchObject({ unknownLines: 1, totalLines: 3 });
	expect(result.parts[0].lines).toHaveLength(1);
});

const sale = [
	{ line_items: [{ product_id: 1, quantity: 2, total: '100', cost_of_goods_sold: { value: 25 } }] },
] as ReportOrder[];
const refund = {
	id: 8,
	parent_id: 7,
	date_created_gmt: '',
	line_items: [{ product_id: 1, quantity: -1, total: '-50', cost_of_goods_sold: { value: -12.5 } }],
};
const local = [{ id: 1, categories: [{ id: 2 }], brands: [{ id: 3 }] }];
// Omitting refund lines from any grouping or subtracting their already-negative costs breaks these.
it('a refund line nets its negative total, cost and quantity into the grouping', () => {
	const totals = calculateTotals({ orders: sale });
	const groups = [
		topProducts(sale, totals, 2, [refund], local)[0],
		categories(sale, local, totals, 2, undefined, undefined, [refund]).parts[0],
		brands(sale, local, totals, 2, [refund]).parts[0],
	];
	for (const group of groups) {
		expect(group.quantity).toBe(1);
		expect(marginOf(group.lines ?? [])).toMatchObject({
			net: 50,
			cost: 12.5,
			profit: 37.5,
			items: 3,
		});
	}
});
it('a refund line without a cost counts as missing', () => {
	const rows = topProducts(
		sale,
		calculateTotals({ orders: sale }),
		2,
		[{ ...refund, line_items: [{ product_id: 1, quantity: -1, total: '-50' }] }],
		local
	);
	expect(marginOf(rows[0].lines ?? [])).toMatchObject({ missing: 1, missingItems: 1, items: 3 });
});
it('a grouping netted to zero stays a row', () => {
	const rows = topProducts(
		sale,
		calculateTotals({ orders: sale }),
		2,
		[
			{
				...refund,
				line_items: [
					{ product_id: 1, quantity: -2, total: '-100', cost_of_goods_sold: { value: -25 } },
				],
			},
		],
		local
	);
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({ quantity: 0, amount: 0 });
	expect(marginOf(rows[0].lines ?? [])).toMatchObject({ net: 0, cost: 0, marginPct: null });
});

it('refund products missing locally join the unknown row in every grouping', () => {
	const totals = calculateTotals({ orders: [] });
	const groups = [
		topProducts([], totals, 2, [refund], [])[0],
		categories([], [], totals, 2, undefined, undefined, [refund]).parts[0],
		brands([], [], totals, 2, [refund]).parts[0],
	];
	expect(groups.map((row) => row.key)).toEqual(['', 'unknown', 'unknown']);
	for (const group of groups)
		expect(marginOf(group.lines ?? [])).toMatchObject({ net: -50, cost: -12.5 });
});
