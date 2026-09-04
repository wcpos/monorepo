import { v4 as uuidv4 } from 'uuid';
import * as z from 'zod';

export const BUILT_IN_PILL_IDS = [
	'stock_status',
	'featured',
	'on_sale',
	'categories',
	'tags',
	'brands',
] as const;

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

export type BuiltInPillId = (typeof BUILT_IN_PILL_IDS)[number];
export type QuickFilterCondition = z.infer<typeof quickFilterConditionSchema>;
export type QuickFilterSort = z.infer<typeof quickFilterSortSchema>;
export type QuickFilter = z.infer<typeof quickFilterSchema>;
export type BuiltInPill = z.infer<typeof builtInPillSchema>;
export type FilterBarItem = z.infer<typeof filterBarItemSchema>;

export const DEFAULT_FILTER_BAR: FilterBarItem[] = BUILT_IN_PILL_IDS.map((id) => ({
	id,
	type: 'pill',
	show: true,
}));

export const createQuickFilterId = (): string => uuidv4();

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
const LABEL_KEYS = {
	categories: 'common.category',
	tags: 'common.tag',
	brands: 'common.brand',
	instock: 'common.in_stock',
	outofstock: 'common.out_of_stock',
	onbackorder: 'common.on_backorder',
	simple: 'common.simple',
	variable: 'common.variable',
	grouped: 'common.grouped',
	external: 'common.external',
} as const;
const SORT_LABEL_KEYS: Record<QuickFilterSort['field'], string> = {
	name: 'common.name',
	sku: 'common.sku',
	barcode: 'common.barcode',
	type: 'common.type',
	sortable_price: 'common.price',
	date_created_gmt: 'common.date_created',
	date_modified_gmt: 'common.date_modified',
	total_sales: 'common.popularity',
	stock_quantity: 'products.stock_quantity',
	stock_status: 'common.stock_status',
	menu_order: 'common.menu_order',
};

export function getQuickFilterSortLabel(field: QuickFilterSort['field'], t: Translate): string {
	return t(SORT_LABEL_KEYS[field]);
}

export function describeQuickFilter(
	quickFilter: QuickFilter,
	t: Translate,
	formatPrice: (value: number) => string
): string {
	const parts = quickFilter.conditions.map((condition) => {
		if (
			condition.field === 'categories' ||
			condition.field === 'tags' ||
			condition.field === 'brands'
		) {
			return t('pos_products.quick_filter_selected', {
				label: t(LABEL_KEYS[condition.field]),
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
			return t(LABEL_KEYS[condition.value]);
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
	});

	if (quickFilter.sort) {
		parts.push(
			t('pos_products.quick_filter_sort', {
				field: getQuickFilterSortLabel(quickFilter.sort.field, t),
				direction: quickFilter.sort.direction === 'asc' ? '↑' : '↓',
			})
		);
	}
	return parts.join(' · ');
}
