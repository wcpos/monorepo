import type { QuickFilter } from './filter-bar-layout';

type Starter = {
	id: string;
	icon: 'category' | 'currency' | 'arrowDown' | 'warehouse' | 'tag';
	conditions: QuickFilter['conditions'];
	sort?: QuickFilter['sort'];
	waiting?: 'categories' | 'price' | 'tags';
	// Literal translation calls: the string extractor reads no computed key.
	title: (t: (key: string) => string) => string;
	line: (t: (key: string) => string) => string;
};

export const QUICK_FILTER_STARTERS: Starter[] = [
	{
		id: 'category',
		title: (t) => t('pos_products.starter_category_title'),
		line: (t) => t('pos_products.starter_category_line'),
		icon: 'category',
		conditions: [{ field: 'categories', value: [] }],
		waiting: 'categories',
	},
	{
		id: 'sale_in_category',
		title: (t) => t('pos_products.starter_sale_in_category_title'),
		line: (t) => t('pos_products.starter_sale_in_category_line'),
		icon: 'currency',
		conditions: [
			{ field: 'categories', value: [] },
			{ field: 'on_sale', value: true },
		],
		waiting: 'categories',
	},
	{
		id: 'under_price',
		title: (t) => t('pos_products.starter_under_price_title'),
		line: (t) => t('pos_products.starter_under_price_line'),
		icon: 'currency',
		conditions: [{ field: 'price', value: {} }],
		waiting: 'price',
	},
	{
		id: 'best_sellers',
		title: (t) => t('pos_products.starter_best_sellers_title'),
		line: (t) => t('pos_products.starter_best_sellers_line'),
		icon: 'arrowDown',
		conditions: [],
		sort: { field: 'total_sales', direction: 'desc' },
	},
	{
		id: 'new_arrivals',
		title: (t) => t('pos_products.starter_new_arrivals_title'),
		line: (t) => t('pos_products.starter_new_arrivals_line'),
		icon: 'arrowDown',
		conditions: [],
		sort: { field: 'date_created_gmt', direction: 'desc' },
	},
	{
		id: 'low_stock',
		title: (t) => t('pos_products.starter_low_stock_title'),
		line: (t) => t('pos_products.starter_low_stock_line'),
		icon: 'warehouse',
		conditions: [],
		sort: { field: 'stock_quantity', direction: 'asc' },
	},
	{
		id: 'tag',
		title: (t) => t('pos_products.starter_tag_title'),
		line: (t) => t('pos_products.starter_tag_line'),
		icon: 'tag',
		conditions: [{ field: 'tags', value: [] }],
		waiting: 'tags',
	},
];
