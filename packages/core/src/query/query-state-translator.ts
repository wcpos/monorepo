import { parseRemoteId } from '../utils/parse-remote-id';

import type { CollectionKey, FiltersOf, QueryStateOf, SortFieldOf } from './query-state-types';

type Storage = 'promoted' | 'payload' | 'local';
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
	enginePath: string;
	storage: Storage;
	operator: Operator;
};

const entry = (
	legacyPath: string,
	enginePath: string,
	storage: Storage,
	operator: Operator = 'value'
): FilterTranslator => ({ legacyPath, enginePath, storage, operator });

// requirementsForQuery reads these predicates directly from the selector root.
const REQUIREMENT_TOP_LEVEL_FIELDS = new Set(['status']);

export const FILTER_TRANSLATORS = {
	products: {
		categories: entry('categories', 'categoryIds', 'promoted', 'taxonomy-many'),
		tags: entry('tags', 'payload.tags', 'payload', 'taxonomy-many'),
		brands: entry('brands', 'brandIds', 'promoted', 'taxonomy-many'),
		featured: entry('featured', 'featured', 'promoted'),
		on_sale: entry('on_sale', 'onSale', 'promoted'),
		stock_status: entry('stock_status', 'stockStatus', 'promoted'),
		status: entry('status', 'payload.status', 'payload'),
	},
	orders: {
		status: entry('status', 'status', 'promoted'),
		customer_id: entry('customer_id', 'customerId', 'promoted'),
		cashier: entry('meta_data', 'payload.meta_data[_pos_user]', 'payload', 'metadata'),
		store: entry(
			'created_via',
			'payload.created_via|payload.meta_data[_pos_store]',
			'payload',
			'store'
		),
		dateRange: entry('date_created_gmt', 'dateCreatedGmt', 'promoted', 'date-range'),
	},
	coupons: {
		discount_type: entry('discount_type', 'payload.discount_type', 'payload'),
		status: entry('status', 'payload.status', 'payload'),
		dateRange: entry('date_expires_gmt', 'payload.date_expires_gmt', 'payload', 'date-range'),
	},
	variations: {
		attributeMatches: entry('attributes', 'attributes', 'promoted', 'all-match'),
		status: entry('status', 'payload.status', 'payload'),
	},
	customers: {},
	'tax-rates': {},
	logs: {
		level: entry('level', 'level', 'local', 'in'),
		category_prefix: entry('category', 'category', 'local', 'prefix-range'),
		has_actor: entry('actor', 'actor', 'local', 'exists'),
	},
} as const satisfies {
	[C in CollectionKey]: { [F in keyof FiltersOf<C>]-?: FilterTranslator };
};

const sortPaths = {
	products: {
		id: 'wooProductId',
		name: 'payload.name',
		sku: 'payload.sku',
		barcode: 'payload.barcode',
		sortable_price: 'payload.price',
		total_sales: 'payload.total_sales',
		menu_order: 'payload.menu_order',
		stock_quantity: 'stockQuantity',
		stock_status: 'stockStatus',
		price: 'price',
		regular_price: 'payload.regular_price',
		sale_price: 'payload.sale_price',
		date_created_gmt: 'payload.date_created_gmt',
		date_modified_gmt: 'payload.date_modified_gmt',
	},
	orders: {
		status: 'status',
		number: 'number',
		customer_id: 'customerId',
		total: 'sortable_total',
		date_created_gmt: 'dateCreatedGmt',
		date_modified_gmt: 'payload.date_modified_gmt',
		date_completed_gmt: 'payload.date_completed_gmt',
		date_paid_gmt: 'payload.date_paid_gmt',
		payment_method: 'payload.payment_method',
	},
	coupons: {
		code: 'payload.code',
		amount: 'payload.amount',
		discount_type: 'payload.discount_type',
		status: 'payload.status',
		usage_count: 'payload.usage_count',
		date_expires_gmt: 'payload.date_expires_gmt',
		date_created_gmt: 'payload.date_created_gmt',
		date_modified_gmt: 'payload.date_modified_gmt',
	},
	variations: {
		id: 'wooId',
		name: 'payload.name',
		sku: 'payload.sku',
		menu_order: 'payload.menu_order',
		price: 'price',
		regular_price: 'payload.regular_price',
		sale_price: 'payload.sale_price',
		stock_quantity: 'stockQuantity',
		stock_status: 'stockStatus',
		date_created_gmt: 'payload.date_created_gmt',
		date_modified_gmt: 'payload.date_modified_gmt',
	},
	customers: {
		id: 'wooCustomerId',
		first_name: 'payload.first_name',
		last_name: 'payload.last_name',
		email: 'payload.email',
		role: 'payload.role',
		username: 'payload.username',
		date_created_gmt: 'payload.date_created_gmt',
		date_modified_gmt: 'payload.date_modified_gmt',
	},
	'tax-rates': {
		id: 'wooTaxRateId',
		name: 'payload.name',
		country: 'payload.country',
		state: 'payload.state',
		priority: 'payload.priority',
		rate: 'payload.rate',
		class: 'payload.class',
		order: 'payload.order',
	},
	logs: { timestamp: 'timestamp', level: 'level', code: 'code' },
} as const satisfies { [C in CollectionKey]: Record<SortFieldOf<C>, string> };

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
		collection === 'orders' && sortField === 'total' ? sortPaths.orders.total : sortField;
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
		sortEnginePath: (sortPaths[collection] as Record<string, string>)[sortField],
		limit: state.limit,
		search: state.search.trim(),
	};
}
