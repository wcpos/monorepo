import type { QuickFilter } from './filter-bar-layout';

type Starter = {
	id: string;
	icon: 'category' | 'currency' | 'arrowDown' | 'warehouse' | 'tag';
	conditions: QuickFilter['conditions'];
	sort?: QuickFilter['sort'];
	waiting?: 'categories' | 'price' | 'tags';
};

export const QUICK_FILTER_STARTERS: Starter[] = [
	{
		id: 'category',
		icon: 'category',
		conditions: [{ field: 'categories', value: [] }],
		waiting: 'categories',
	},
	{
		id: 'sale_in_category',
		icon: 'currency',
		conditions: [
			{ field: 'categories', value: [] },
			{ field: 'on_sale', value: true },
		],
		waiting: 'categories',
	},
	{
		id: 'under_price',
		icon: 'currency',
		conditions: [{ field: 'price', value: {} }],
		waiting: 'price',
	},
	{
		id: 'best_sellers',
		icon: 'arrowDown',
		conditions: [],
		sort: { field: 'total_sales', direction: 'desc' },
	},
	{
		id: 'new_arrivals',
		icon: 'arrowDown',
		conditions: [],
		sort: { field: 'date_created_gmt', direction: 'desc' },
	},
	{
		id: 'low_stock',
		icon: 'warehouse',
		conditions: [],
		sort: { field: 'stock_quantity', direction: 'asc' },
	},
	{ id: 'tag', icon: 'tag', conditions: [{ field: 'tags', value: [] }], waiting: 'tags' },
];
