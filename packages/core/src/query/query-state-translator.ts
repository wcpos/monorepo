import { parseRemoteId } from '../utils/parse-remote-id';

import type { CollectionKey, FiltersOf, QueryStateOf, SortFieldOf } from './query-state-types';

type Operator =
	| 'taxonomy-many'
	| 'value'
	| 'metadata'
	| 'store'
	| 'date-range'
	| 'all-match'
	| 'in'
	| 'prefix-range'
	| 'exists';
type FilterTranslator = {
	legacyPath: string;
	operator: Operator;
};

const entry = (legacyPath: string, operator: Operator = 'value'): FilterTranslator => ({
	legacyPath,
	operator,
});

// requirementsForQuery reads these predicates directly from the selector root.
const REQUIREMENT_TOP_LEVEL_FIELDS = new Set(['status', 'customer_id', 'dateRange']);

export const FILTER_TRANSLATORS = {
	products: {
		categories: entry('categories', 'taxonomy-many'),
		tags: entry('tags', 'taxonomy-many'),
		brands: entry('brands', 'taxonomy-many'),
		featured: entry('featured'),
		on_sale: entry('on_sale'),
		stock_status: entry('stock_status'),
		status: entry('status'),
	},
	orders: {
		status: entry('status'),
		customer_id: entry('customer_id'),
		cashier: entry('meta_data', 'metadata'),
		store: entry('created_via', 'store'),
		dateRange: entry('date_created_gmt', 'date-range'),
	},
	coupons: {
		discount_type: entry('discount_type'),
		status: entry('status'),
		dateRange: entry('date_expires_gmt', 'date-range'),
	},
	variations: {
		attributeMatches: entry('attributes', 'all-match'),
		status: entry('status'),
	},
	customers: {},
	'tax-rates': {},
	logs: {
		level: entry('level', 'in'),
		category_prefix: entry('category', 'prefix-range'),
		has_actor: entry('actor', 'exists'),
	},
} as const satisfies {
	[C in CollectionKey]: { [F in keyof FiltersOf<C>]-?: FilterTranslator };
};

const UI_SORT_FIELD_ALIASES = {
	products: { price: 'sortable_price' },
	orders: {},
	coupons: {},
	variations: {},
	customers: {},
	'tax-rates': {},
	logs: {},
} as const satisfies { [C in CollectionKey]: Partial<Record<string, SortFieldOf<C>>> };

/** Normalize persisted UI column keys before they enter query state. */
export function normalizeQuerySortField(
	collection: CollectionKey,
	field: unknown
): string | undefined {
	if (typeof field !== 'string') return undefined;
	const aliases = UI_SORT_FIELD_ALIASES[collection] as Record<string, string>;
	return aliases[field] ?? field;
}

function compile(
	entryValue: FilterTranslator,
	value: unknown
): Record<string, unknown> | undefined {
	if (value === undefined || (Array.isArray(value) && value.length === 0)) return undefined;
	switch (entryValue.operator) {
		case 'value':
			return { [entryValue.legacyPath]: value };
		case 'in':
			return { [entryValue.legacyPath]: { $in: value } };
		case 'taxonomy-many':
			return {
				$or: (value as number[]).map((id) => ({ [entryValue.legacyPath]: { $elemMatch: { id } } })),
			};
		case 'metadata': {
			const cashierID = parseRemoteId(value);
			return cashierID === undefined
				? undefined
				: { meta_data: { $elemMatch: { key: '_pos_user', value: String(cashierID) } } };
		}
		case 'store': {
			const numeric = typeof value === 'number' || /^\d+$/.test(String(value));
			return numeric
				? { meta_data: { $elemMatch: { key: '_pos_store', value: String(value) } } }
				: { created_via: value };
		}
		case 'date-range': {
			const range = value as { from: string; to: string };
			return { [entryValue.legacyPath]: { $gte: range.from, $lte: range.to } };
		}
		case 'all-match':
			return { attributes: { $allMatch: value } };
		case 'prefix-range': {
			// Lexicographic prefix match usable by a string index: '/' is the code
			// point after '.', so ['sync', 'sync/') covers 'sync' and every
			// 'sync.…' category without a table-scanning $regex.
			const prefix = String(value);
			return { [entryValue.legacyPath]: { $gte: prefix, $lt: `${prefix}/` } };
		}
		case 'exists':
			return value === true ? { [entryValue.legacyPath]: { $exists: true } } : undefined;
		default: {
			const exhaustive: never = entryValue.operator;
			return exhaustive;
		}
	}
}

export function translateQueryState<C extends CollectionKey>(
	collection: C,
	state: QueryStateOf<C>
) {
	const translators = FILTER_TRANSLATORS[collection] as Record<string, FilterTranslator>;
	const topLevelConditions: Record<string, unknown> = {};
	const nestedConditions: Record<string, unknown>[] = [];
	Object.entries(state.filters).forEach(([field, value]) => {
		const condition = compile(translators[field], value);
		if (!condition) return;
		if (collection === 'orders' && REQUIREMENT_TOP_LEVEL_FIELDS.has(field)) {
			Object.assign(topLevelConditions, condition);
		} else {
			nestedConditions.push(condition);
		}
	});
	const selector = {
		...topLevelConditions,
		...(nestedConditions.length > 0 ? { $and: nestedConditions } : {}),
	};
	const sortField = normalizeQuerySortField(collection, state.sort.field)!;
	const adapterSortField =
		collection === 'orders' && sortField === 'total' ? 'sortable_total' : sortField;
	const sort: Record<string, 'asc' | 'desc'>[] = [{ [adapterSortField]: state.sort.direction }];
	if ((collection === 'products' || collection === 'variations') && sortField === 'menu_order') {
		// 1.9 catalog-order contract (#810, variations #871): equal menu_order values (usually 0)
		// are the common case, so the Woo id tiebreak is part of the sort, not an implementation detail.
		sort.push({ id: 'asc' });
	}
	return {
		collectionName: collection === 'tax-rates' ? 'taxes' : collection,
		selector,
		sort,
		limit: state.limit,
		search: state.search.trim(),
	};
}
