import { categories, topProducts } from '../cards/aggregate';
import { calculateTotals } from '../report/utils';
import { brandChoices, categoryChoices, filterLines } from './line-filters';

import type { LocalProduct } from '../cards/aggregate';
import type { ReportOrder } from '../context';
import type { CategoryTree } from '../margin';

const tree: CategoryTree = new Map([
	[10, { id: 10, name: 'Clothes' }],
	[11, { id: 11, name: 'Shirts', parent: 10 }],
	[12, { id: 12, name: 'Hats', parent: 10 }],
	[20, { id: 20, name: 'Accessories' }],
]);
const products: LocalProduct[] = [
	{
		id: 1,
		categories: [{ id: 11 }, { id: 20 }],
		brands: [
			{ id: 2, name: 'Zulu' },
			{ id: 1, name: 'Alpha' },
		],
	},
	{ id: 2, categories: [{ id: 12 }], brands: [{ id: 1, name: 'Alpha' }] },
	{ id: 3, categories: [{ id: 11 }], brands: [{ id: 1, name: 'Alpha' }] },
	{ id: 4, categories: [{ id: 20 }] },
];
const orders = [
	{
		uuid: 'order',
		total: '66',
		line_items: [
			{ product_id: 1, total: '10', total_tax: '2', quantity: 1 },
			{ product_id: 2, total: '20', total_tax: '4', quantity: 1 },
			{ product_id: 3, total: '5', total_tax: '1', quantity: 1 },
			{ product_id: 4, total: '10', total_tax: '2', quantity: 1 },
			{ product_id: 99, total: '10', total_tax: '2', quantity: 1 },
		],
	},
] as ReportOrder[];

it('offers first categories and their ancestors once, sorted by their full chain labels', () => {
	expect(categoryChoices(products, tree, ' / ', 'Unknown')).toEqual([
		{ value: '20', label: 'Accessories' },
		{ value: '10', label: 'Clothes' },
		{ value: '12', label: 'Clothes / Hats' },
		{ value: '11', label: 'Clothes / Shirts' },
	]);
	expect(categoryChoices([products[0]], tree, ' / ', 'Unknown')).toHaveLength(2);
});
it('labels a category the local tree has not cached from the product, never blank', () => {
	const uncached: LocalProduct[] = [
		{ id: 5, categories: [{ id: 77, name: 'Pop-up' }] },
		{ id: 6, categories: [{ id: 78 }] },
	];
	expect(categoryChoices(uncached, tree, ' / ', 'Unknown')).toEqual([
		{ value: '77', label: 'Pop-up' },
		{ value: '78', label: 'Unknown' },
	]);
});
it('offers only first brands, deduplicated and sorted by label', () => {
	expect(brandChoices(products)).toEqual([
		{ value: '1', label: 'Alpha' },
		{ value: '2', label: 'Zulu' },
	]);
	expect(brandChoices([products[0]])).toEqual([{ value: '2', label: 'Zulu' }]);
});
it.each([
	[{ categoryId: '10' }, [1, 2, 3]],
	[{ categoryId: '11' }, [1, 3]],
	[{ brandId: '1' }, [2, 3]],
	[{ categoryId: '11', brandId: '1' }, [3]],
	[{ categoryId: '20' }, [4]],
] as const)(
	'narrows lines with %o, excluding unknown products and second assignments',
	(filters, ids) => {
		const result = filterLines(orders, products, tree, filters);
		expect(result[0].line_items?.map((line) => line.product_id)).toEqual(ids);
		expect(result[0].uuid).toBe('order');
		expect(orders[0].line_items).toHaveLength(5);
	}
);
it('keeps empty rows and accepts refund lines', () => {
	const refunds = [{ id: 7, line_items: [{ product_id: 1, total: '-10', quantity: -1 }] }];
	expect(filterLines(refunds, products, tree, { brandId: '2' })).toEqual(refunds);
	expect(filterLines(refunds, products, tree, { brandId: '1' })).toEqual([
		{ id: 7, line_items: [] },
	]);
});
it('returns the original array when neither filter is selected', () => {
	expect(filterLines(orders, products, tree, {})).toBe(orders);
});
it('matches the leaf category row amount including tax', () => {
	const totals = calculateTotals({ orders });
	const filtered = filterLines(orders, products, tree, { categoryId: '11' });
	const amount = topProducts(filtered, totals).reduce((sum, row) => sum + row.amount, 0);
	expect(amount).toBe(18);
	expect(amount).toBe(
		categories(orders, products, totals).parts.find((row) => row.key === '11')?.amount
	);
});
it('caps cyclic ancestor walks and uses the caller’s separator and unknown label', () => {
	const cyclic: CategoryTree = new Map([[11, { id: 11, parent: 11 }]]);
	expect(categoryChoices([products[0]], cyclic, '/', '?')).toEqual([
		{ value: '11', label: Array(10).fill('?').join('/') },
	]);
	expect(filterLines(orders, products, cyclic, { categoryId: '10' })[0].line_items).toEqual([]);
});
