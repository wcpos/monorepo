import * as z from 'zod';

export const BUILT_IN_PILL_IDS = [
	'stock_status',
	'featured',
	'on_sale',
	'categories',
	'tags',
	'brands',
] as const;

export const getFilterPillIcon = (id: (typeof BUILT_IN_PILL_IDS)[number]) =>
	id === 'featured'
		? 'featured'
		: id === 'on_sale'
			? 'currency'
			: id === 'stock_status'
				? 'warehouse'
				: 'category';

export const SORT_FIELD_VALUES = [
	'name',
	'sku',
	'barcode',
	'type',
	'sortable_price',
	'date_created_gmt',
	'date_modified_gmt',
	'total_sales',
	'stock_quantity',
	'stock_status',
	'menu_order',
] as const;

export const quickFilterConditionSchema = z.discriminatedUnion('field', [
	z.object({ field: z.literal('categories'), value: z.array(z.number().finite()) }),
	z.object({ field: z.literal('tags'), value: z.array(z.number().finite()) }),
	z.object({ field: z.literal('brands'), value: z.array(z.number().finite()) }),
	z.object({
		field: z.literal('price'),
		value: z.object({ min: z.number().finite().optional(), max: z.number().finite().optional() }),
	}),
	z.object({ field: z.literal('on_sale'), value: z.boolean() }),
	z.object({ field: z.literal('featured'), value: z.boolean() }),
	z.object({
		field: z.literal('stock_status'),
		value: z.enum(['instock', 'outofstock', 'onbackorder']),
	}),
	z.object({
		field: z.literal('type'),
		value: z.enum(['simple', 'variable', 'grouped', 'external']),
	}),
	z.object({ field: z.literal('search'), value: z.string() }),
]);

export const quickFilterSortSchema = z.object({
	field: z.enum(SORT_FIELD_VALUES),
	direction: z.enum(['asc', 'desc']),
});

export const quickFilterSchema = z.object({
	id: z.string(),
	type: z.literal('quick'),
	label: z.string(),
	conditions: z.array(quickFilterConditionSchema),
	sort: quickFilterSortSchema.optional(),
});

export const builtInPillSchema = z.object({
	id: z.enum(BUILT_IN_PILL_IDS),
	type: z.literal('pill'),
	show: z.boolean(),
});

export const filterBarItemSchema = z.discriminatedUnion('type', [
	builtInPillSchema,
	quickFilterSchema,
]);

export type QuickFilterCondition = z.infer<typeof quickFilterConditionSchema>;
export type QuickFilterSort = z.infer<typeof quickFilterSortSchema>;
export type QuickFilter = z.infer<typeof quickFilterSchema>;
export type FilterBarItem = z.infer<typeof filterBarItemSchema>;

export const DEFAULT_FILTER_BAR: FilterBarItem[] = BUILT_IN_PILL_IDS.map((id) => ({
	id,
	type: 'pill',
	show: true,
}));

export function normalizeFilterBar(persisted: unknown): FilterBarItem[] {
	if (!Array.isArray(persisted)) return DEFAULT_FILTER_BAR;

	const seen = new Set<string>();
	const items: FilterBarItem[] = [];
	for (const entry of persisted) {
		const parsed = filterBarItemSchema.safeParse(entry);
		if (!parsed.success) continue;
		if (parsed.data.type === 'quick' && !isQuickFilterValid(parsed.data)) continue;
		if (seen.has(parsed.data.id)) continue;
		seen.add(parsed.data.id);
		items.push(parsed.data);
	}

	for (const pill of DEFAULT_FILTER_BAR) {
		if (!seen.has(pill.id)) items.push(pill);
	}
	return items;
}

const legacyQuickFilterSchema = z.object({
	id: z.string(),
	label: z.string(),
	kind: z.enum(['category', 'tag', 'brand', 'featured', 'on_sale', 'stock_status', 'search']),
	value: z.string(),
});

export function migrateLegacyQuickFilters(legacy: unknown): QuickFilter[] {
	if (!Array.isArray(legacy)) return [];

	return legacy.flatMap((entry): QuickFilter[] => {
		const parsed = legacyQuickFilterSchema.safeParse(entry);
		if (!parsed.success || parsed.data.label.trim() === '') return [];
		const { id, kind } = parsed.data;
		const label = parsed.data.label.trim();
		const value = parsed.data.value.trim();
		let condition: QuickFilterCondition | undefined;

		if (kind === 'featured' || kind === 'on_sale') {
			condition = { field: kind, value: true };
		} else if (kind === 'search' && value) {
			condition = { field: 'search', value };
		} else if (
			kind === 'stock_status' &&
			(value === 'instock' || value === 'outofstock' || value === 'onbackorder')
		) {
			condition = { field: 'stock_status', value };
		} else if (kind === 'category' || kind === 'tag' || kind === 'brand') {
			const termID = value === '' ? Number.NaN : Number(value);
			if (Number.isFinite(termID)) {
				const fields = { category: 'categories', tag: 'tags', brand: 'brands' } as const;
				condition = { field: fields[kind], value: [termID] };
			}
		}

		return condition ? [{ id, type: 'quick', label, conditions: [condition] }] : [];
	});
}

export function isQuickFilterValid(quickFilter: QuickFilter): boolean {
	if (
		quickFilter.label.trim() === '' ||
		(quickFilter.conditions.length === 0 && !quickFilter.sort)
	) {
		return false;
	}

	return quickFilter.conditions.every((condition) => {
		if (
			condition.field === 'categories' ||
			condition.field === 'tags' ||
			condition.field === 'brands'
		) {
			return condition.value.length > 0 && condition.value.every(Number.isFinite);
		}
		if (condition.field === 'search') return condition.value.trim() !== '';
		if (condition.field === 'price') {
			const { min, max } = condition.value;
			if (min === undefined && max === undefined) return false;
			if (
				(min !== undefined && !Number.isFinite(min)) ||
				(max !== undefined && !Number.isFinite(max))
			) {
				return false;
			}
			return min === undefined || max === undefined || min <= max;
		}
		return true;
	});
}

type Translate = (key: string, values?: Record<string, string | number>) => string;
export function getQuickFilterSortLabel(field: QuickFilterSort['field'], t: Translate): string {
	return {
		name: t('common.name'),
		sku: t('common.sku'),
		barcode: t('common.barcode'),
		type: t('common.type'),
		sortable_price: t('common.price'),
		date_created_gmt: t('common.date_created'),
		date_modified_gmt: t('common.date_modified'),
		total_sales: t('common.popularity'),
		stock_quantity: t('products.stock_quantity'),
		stock_status: t('common.stock_status'),
		menu_order: t('common.menu_order'),
	}[field];
}

/** Each condition kind's name, and the name of each value a condition can hold. */
export function conditionWords(t: Translate) {
	const kind: Record<QuickFilterCondition['field'], string> = {
		categories: t('pos_products.kind_categories'),
		tags: t('pos_products.kind_tags'),
		brands: t('pos_products.kind_brands'),
		price: t('pos_products.kind_price'),
		on_sale: t('pos_products.kind_on_sale'),
		featured: t('pos_products.kind_featured'),
		stock_status: t('pos_products.kind_stock_status'),
		type: t('pos_products.kind_type'),
		search: t('pos_products.kind_search'),
	};
	const value: Record<string, string> = {
		categories: t('common.category'),
		tags: t('common.tag'),
		brands: t('common.brand'),
		instock: t('common.in_stock'),
		outofstock: t('common.out_of_stock'),
		onbackorder: t('common.on_backorder'),
		simple: t('common.simple'),
		variable: t('common.variable'),
		grouped: t('common.grouped'),
		external: t('common.external'),
	};
	return { kind, value };
}

type NamedOrder = { value: string; label: (t: Translate) => string; sort?: QuickFilterSort };
export const NAMED_ORDERS: NamedOrder[] = [
	{ value: 'default', label: (t) => t('pos_products.order_default') },
	{
		value: 'sortable_price-asc',
		label: (t) => t('pos_products.order_price_asc'),
		sort: { field: 'sortable_price', direction: 'asc' },
	},
	{
		value: 'sortable_price-desc',
		label: (t) => t('pos_products.order_price_desc'),
		sort: { field: 'sortable_price', direction: 'desc' },
	},
	{
		value: 'total_sales-desc',
		label: (t) => t('pos_products.order_popularity'),
		sort: { field: 'total_sales', direction: 'desc' },
	},
	{
		value: 'date_created_gmt-desc',
		label: (t) => t('pos_products.order_newest'),
		sort: { field: 'date_created_gmt', direction: 'desc' },
	},
	{
		value: 'date_modified_gmt-desc',
		label: (t) => t('pos_products.order_recently_changed'),
		sort: { field: 'date_modified_gmt', direction: 'desc' },
	},
	{
		value: 'name-asc',
		label: (t) => t('pos_products.order_name_asc'),
		sort: { field: 'name', direction: 'asc' },
	},
	{
		value: 'name-desc',
		label: (t) => t('pos_products.order_name_desc'),
		sort: { field: 'name', direction: 'desc' },
	},
	{
		value: 'stock_quantity-asc',
		label: (t) => t('pos_products.order_fewest_left'),
		sort: { field: 'stock_quantity', direction: 'asc' },
	},
	{
		value: 'menu_order-asc',
		label: (t) => t('pos_products.order_menu'),
		sort: { field: 'menu_order', direction: 'asc' },
	},
];

export function getNamedOrderLabel(sort: QuickFilterSort | undefined, t: Translate): string {
	const named = NAMED_ORDERS.find(
		(order) => order.sort?.field === sort?.field && order.sort?.direction === sort?.direction
	);
	return named
		? named.label(t)
		: `${getQuickFilterSortLabel(sort!.field, t)} ${sort!.direction === 'asc' ? '↑' : '↓'}`;
}

export function describeCondition(
	condition: QuickFilterCondition,
	t: Translate,
	formatPrice: (value: number) => string
): string {
	if (
		condition.field === 'categories' ||
		condition.field === 'tags' ||
		condition.field === 'brands'
	) {
		return t('pos_products.quick_filter_selected', {
			label: conditionWords(t).value[condition.field],
			count: condition.value.length,
		});
	}
	if (condition.field === 'on_sale') {
		return condition.value ? t('common.on_sale') : t('pos_products.quick_filter_not_on_sale');
	}
	if (condition.field === 'featured') {
		return condition.value ? t('common.featured') : t('pos_products.quick_filter_not_featured');
	}
	if (condition.field === 'stock_status' || condition.field === 'type') {
		return conditionWords(t).value[condition.value];
	}
	if (condition.field === 'search') {
		return t('pos_products.quick_filter_search', { term: condition.value });
	}

	const { min, max } = condition.value;
	if (min !== undefined && max !== undefined) {
		return t('pos_products.quick_filter_price_range', {
			min: formatPrice(min),
			max: formatPrice(max),
		});
	}
	if (min !== undefined) {
		return t('pos_products.quick_filter_price_min', { min: formatPrice(min) });
	}
	return t('pos_products.quick_filter_price_max', { max: formatPrice(max as number) });
}

export function describeQuickFilter(
	quickFilter: QuickFilter,
	t: Translate,
	formatPrice: (value: number) => string
): string {
	const parts = quickFilter.conditions.map((condition) =>
		describeCondition(condition, t, formatPrice)
	);

	if (quickFilter.sort) parts.push(getNamedOrderLabel(quickFilter.sort, t));
	return parts.join(' · ');
}
