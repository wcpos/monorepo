import {
	collectionMap,
	type EngineDocument,
	type FieldMapEntry,
	type LegacyCollectionName,
	readEnginePath,
	resolveLegacyField,
	sortAliasFor,
	sortTiebreakFor,
	wooOrderbyFor,
} from '@wcpos/query/collection-map';
import { variationAllMatch } from '@wcpos/query';
import type { CompiledQueryRead, CompiledSortPart } from '@wcpos/query';
import type {
	EngineRequirement,
	OrderBrowseDimensions,
	ProductBrowseDimensions,
} from '@wcpos/sync-engine';

import { parseRemoteId } from '../utils/parse-remote-id';

import type { CollectionKey, FiltersOf, QueryStateOf } from './query-state-types';

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
	mapping?: WireField;
};

type WireField = FieldMapEntry & {
	wireFace: NonNullable<FieldMapEntry['wireFace']>;
};
type MappedFilterTranslator = FilterTranslator & { mapping: WireField };

const entry = (legacyPath: string, operator: Operator = 'value'): FilterTranslator => ({
	legacyPath,
	operator,
});

const mappedEntry = (mapping: WireField, operator: Operator = 'value'): MappedFilterTranslator => ({
	legacyPath: mapping.legacy,
	operator,
	mapping,
});

export const FILTER_TRANSLATORS = {
	products: {
		categories: mappedEntry(collectionMap.products.fields.categories, 'taxonomy-many'),
		tags: mappedEntry(collectionMap.products.fields.tags, 'taxonomy-many'),
		brands: mappedEntry(collectionMap.products.fields.brands, 'taxonomy-many'),
		featured: mappedEntry(collectionMap.products.fields.featured),
		on_sale: mappedEntry(collectionMap.products.fields.on_sale),
		stock_status: mappedEntry(collectionMap.products.fields.stock_status),
		status: mappedEntry(collectionMap.products.fields.status),
	},
	orders: {
		status: mappedEntry(collectionMap.orders.fields.status),
		customer_id: mappedEntry(collectionMap.orders.fields.customer_id),
		cashier: mappedEntry(collectionMap.orders.fields.cashier, 'metadata'),
		store: mappedEntry(collectionMap.orders.fields.store, 'store'),
		dateRange: mappedEntry(collectionMap.orders.fields.date_created_gmt, 'date-range'),
	},
	coupons: {
		discount_type: mappedEntry(collectionMap.coupons.fields.discount_type),
		status: mappedEntry(collectionMap.coupons.fields.status),
		dateRange: mappedEntry(collectionMap.coupons.fields.date_expires_gmt, 'date-range'),
	},
	variations: {
		attributeMatches: mappedEntry(collectionMap.variations.fields.attributes, 'all-match'),
		status: mappedEntry(collectionMap.variations.fields.status),
	},
	customers: {},
	'tax-rates': {},
	logs: {
		level: entry('level', 'in'),
		category_prefix: entry('category', 'prefix-range'),
		has_actor: entry('actor', 'exists'),
	},
} as const satisfies {
	[C in CollectionKey]: {
		[F in keyof FiltersOf<C>]-?: C extends 'logs' ? FilterTranslator : MappedFilterTranslator;
	};
};

/** Normalize persisted UI column keys before they enter query state. */
export function normalizeQuerySortField(
	collection: CollectionKey,
	field: unknown
): string | undefined {
	if (typeof field !== 'string') return undefined;
	return collection === 'products' ? (sortAliasFor(collection, field) ?? field) : field;
}

export function translateLogsQueryState(state: QueryStateOf<'logs'>) {
	const filters = state.filters;
	const conditions = (
		[
			filters.level?.length ? { level: { $in: filters.level } } : undefined,
			filters.category_prefix
				? {
						category: {
							$gte: filters.category_prefix,
							$lt: `${filters.category_prefix}/`,
						},
					}
				: undefined,
			filters.has_actor ? { actor: { $exists: true } } : undefined,
		] as (Record<string, unknown> | undefined)[]
	).filter((condition): condition is Record<string, unknown> => condition !== undefined);
	return {
		selector: conditions.length > 0 ? { $and: conditions } : {},
		sort: [{ [state.sort.field]: state.sort.direction }],
		limit: state.limit,
		search: state.search.trim(),
	};
}

function mappedValue(mapping: FieldMapEntry, document: EngineDocument): unknown {
	return mapping.compute
		? mapping.compute(document)
		: readEnginePath(document, mapping.readEnginePath ?? mapping.enginePath);
}

function compileReadFilter(
	entryValue: MappedFilterTranslator,
	value: unknown
): {
	prefilter?: Record<string, unknown>;
	matches: (document: EngineDocument) => boolean;
} {
	const { mapping, operator } = entryValue;
	const actual = (document: EngineDocument) => mappedValue(mapping, document);
	if (operator === 'taxonomy-many') {
		const ids = [...new Set(value as number[])].sort((a, b) => a - b);
		return {
			...(mapping.kind === 'promoted' ? { prefilter: { [mapping.enginePath]: { $in: ids } } } : {}),
			matches: (document) =>
				Array.isArray(actual(document)) &&
				(actual(document) as unknown[]).some((item) => {
					const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : item;
					return ids.includes(Number(id));
				}),
		};
	}
	if (operator === 'metadata') {
		const id = parseRemoteId(value)!;
		return { matches: (document) => String(actual(document)) === String(id) };
	}
	if (operator === 'store') {
		const numeric = typeof value === 'number' || /^\d+$/.test(String(value));
		return {
			matches: (document) => {
				const payload = readEnginePath(document, 'payload') as Record<string, unknown> | undefined;
				if (!numeric) return payload?.created_via === value;
				const metadata = payload?.meta_data;
				return (
					Array.isArray(metadata) &&
					metadata.some(
						(item) =>
							item &&
							typeof item === 'object' &&
							(item as Record<string, unknown>).key === '_pos_store' &&
							String((item as Record<string, unknown>).value) === String(value)
					)
				);
			},
		};
	}
	if (operator === 'all-match') {
		return {
			matches: (document) => variationAllMatch(readEnginePath(document, mapping.enginePath), value),
		};
	}
	const condition =
		operator === 'date-range'
			? {
					$gte: (value as { from: string }).from,
					$lte: (value as { to: string }).to,
				}
			: operator === 'in'
				? { $in: value }
				: value;
	const pushable = !mapping.compute && mapping.readEnginePath === undefined;
	return {
		...(pushable ? { prefilter: { [mapping.enginePath]: condition } } : {}),
		matches: (document) => {
			const current = actual(document);
			if (operator === 'date-range') {
				const range = value as { from: string; to: string };
				return String(current) >= range.from && String(current) <= range.to;
			}
			if (operator === 'in') return (value as unknown[]).some((item) => Object.is(current, item));
			return Object.is(current, value);
		},
	};
}

function orderRangeBoundSeconds(value: unknown): number | undefined {
	if (typeof value !== 'string') return undefined;
	const normalized =
		/^\d{4}-\d{2}-\d{2}$/.test(value) || /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
			? value
			: `${value}Z`;
	const milliseconds = Date.parse(normalized);
	return Number.isFinite(milliseconds) && milliseconds >= 0
		? Math.floor(milliseconds / 1_000)
		: undefined;
}

function requirementId(id: string, kind: EngineRequirement['kind']): string {
	const suffix = {
		'targeted-records': 'targeted',
		search: 'search',
		refresh: 'reference-refresh',
		'orders-browse': 'orders-browse',
		'product-browse': 'products-browse-window',
		'customer-browse': 'customers-browse-window',
	}[kind];
	return `${id}:${suffix}`;
}

export function requirementsForCompiledQuery(
	demand: readonly EngineRequirement[],
	overlay: { id: string; priority?: number; forceRefresh?: boolean }
): EngineRequirement[] {
	return demand.map((requirement) => ({
		...requirement,
		id: requirementId(overlay.id, requirement.kind),
		...(overlay.priority !== undefined ? { priority: overlay.priority } : {}),
		...(overlay.forceRefresh && requirement.kind !== 'refresh' ? { forceRefresh: true } : {}),
	}));
}

/** Compile UI query state once into its remote-demand and local-read faces. */
export function compileQuery<C extends Exclude<CollectionKey, 'logs'>>(
	collection: C,
	state: QueryStateOf<C>,
	options: {
		id: string;
		targeted?: readonly number[];
		searchFields?: string[];
	}
) {
	const legacyCollection = (
		collection === 'tax-rates' ? 'taxes' : collection
	) as LegacyCollectionName;
	const translators = FILTER_TRANSLATORS[collection] as Record<string, MappedFilterTranslator>;
	const active = Object.entries(state.filters).flatMap(([field, value]) => {
		if (value === undefined || (Array.isArray(value) && value.length === 0)) return [];
		const translator = translators[field]!;
		if (translator.operator === 'metadata' && parseRemoteId(value) === undefined) return [];
		return [{ field, value, translator }];
	});
	const targeted = options.targeted?.map(Number).filter(Number.isFinite);
	const readFilters = active.map(({ translator, value }) => compileReadFilter(translator, value));
	if (targeted !== undefined) {
		const idMapping = resolveLegacyField(legacyCollection, 'id');
		readFilters.push({
			prefilter: { [idMapping.enginePath]: { $in: targeted } },
			matches: (document) => targeted.includes(Number(mappedValue(idMapping, document))),
		});
	}
	const prefilters = readFilters.flatMap((filter) => (filter.prefilter ? [filter.prefilter] : []));
	const uiSortField = String(state.sort.field);
	const adapterSortField = sortAliasFor(legacyCollection, uiSortField) ?? uiSortField;
	const sortFields = [adapterSortField, ...(sortTiebreakFor(legacyCollection, uiSortField) ?? [])];
	const sort: CompiledSortPart[] = sortFields.map((field, index) => {
		const mapping = resolveLegacyField(legacyCollection, field);
		return {
			direction: index === 0 ? state.sort.direction : 'asc',
			...(!mapping.compute &&
			!mapping.numeric &&
			mapping.readEnginePath === undefined &&
			(mapping.kind === 'promoted' || mapping.kind === 'identifier') &&
			!mapping.enginePath.includes('.')
				? { enginePath: mapping.enginePath }
				: {}),
			value: (document) => {
				const value = mappedValue(mapping, document);
				if (!mapping.numeric) return value;
				const number = Number(value);
				return Number.isNaN(number) ? Number.NEGATIVE_INFINITY : number;
			},
		};
	});
	const search = state.search.trim();
	const read: CompiledQueryRead = {
		prefilter: (prefilters.length === 1 ? prefilters[0] : { $and: prefilters }) as never,
		residual: (document) => readFilters.every((filter) => filter.matches(document)),
		complete: prefilters.length === readFilters.length,
		sort,
		sortPushable: sort.every((part) => part.enginePath !== undefined),
		skip: 0,
		limit: state.limit,
		search,
		searchFields: options.searchFields,
	};
	if (prefilters.length === 0) read.prefilter = {};

	if (targeted !== undefined && targeted.length === 0) {
		return {
			collection: legacyCollection,
			demand: [],
			represented: false,
			read,
		};
	}
	const engineCollection = collection === 'tax-rates' ? 'taxRates' : collection;
	const demand: EngineRequirement[] = [];
	if (targeted?.length) {
		demand.push({
			id: requirementId(options.id, 'targeted-records'),
			collection: engineCollection,
			kind: 'targeted-records',
			wooIds: targeted,
		} as EngineRequirement);
	}
	if (
		search &&
		(['products', 'customers', 'variations'] as string[]).includes(collection) &&
		(collection !== 'variations' || !targeted?.length) &&
		(collection !== 'customers' || search.length >= 3)
	) {
		demand.push({
			id: requirementId(options.id, 'search'),
			collection: engineCollection,
			kind: 'search',
			term: search,
			limit: state.limit,
		} as EngineRequirement);
	}
	if (demand.length > 0) return { collection: legacyCollection, demand, represented: false, read };

	let represented = active.every(({ translator }) => translator.mapping.wireFace !== 'local-only');
	if (collection === 'orders') {
		const wooOrderby = wooOrderbyFor('orders', uiSortField);
		const dimensions: OrderBrowseDimensions = { limit: state.limit };
		let scoped = false;
		for (const { field, value } of active) {
			if (field === 'status' && typeof value === 'string' && value) dimensions.status = value;
			else if (field === 'customer_id' && Number.isSafeInteger(value) && Number(value) >= 0) {
				dimensions.customerId = Number(value);
				scoped = true;
			} else if (field === 'status' || field === 'customer_id') {
				represented = false;
			} else if (field === 'cashier') {
				dimensions.cashierId = parseRemoteId(value);
				scoped = true;
			} else if (field === 'store') {
				const store = String(value);
				if (/^\d+$/.test(store) || /^[a-z0-9_-]+$/.test(store)) {
					dimensions.store = store;
					scoped = true;
				} else represented = false;
			} else if (field === 'dateRange') {
				const range = value as { from: string; to: string };
				dimensions.afterSeconds = orderRangeBoundSeconds(range.from);
				dimensions.beforeSeconds = orderRangeBoundSeconds(range.to);
				scoped = dimensions.afterSeconds !== undefined || dimensions.beforeSeconds !== undefined;
				if (dimensions.afterSeconds === undefined || dimensions.beforeSeconds === undefined)
					represented = false;
			}
		}
		if (search) dimensions.search = search;
		if (wooOrderby) {
			dimensions.orderby = wooOrderby;
			dimensions.order = state.sort.direction;
		}
		if (
			(dimensions.afterSeconds !== undefined || dimensions.beforeSeconds !== undefined) &&
			state.limit >= Number.MAX_SAFE_INTEGER
		)
			dimensions.limit = 'all';
		demand.push({
			id: requirementId(options.id, 'orders-browse'),
			collection: 'orders',
			kind: 'orders-browse',
			...dimensions,
			...(scoped ? { priority: 700 } : {}),
		});
	} else if (collection === 'products') {
		const wooOrderby = wooOrderbyFor('products', uiSortField);
		const dimensions: ProductBrowseDimensions = { limit: state.limit };
		for (const { field, value } of active) {
			if (field === 'categories' || field === 'tags' || field === 'brands') {
				const ids = [
					...new Set((value as number[]).filter((id) => Number.isSafeInteger(id) && id > 0)),
				].sort((a, b) => a - b);
				dimensions[field === 'categories' ? 'category' : (field.slice(0, -1) as 'tag' | 'brand')] =
					ids;
				if (ids.length !== new Set(value as number[]).size) represented = false;
			} else if (field === 'featured' || field === 'on_sale') dimensions[field] = Boolean(value);
			else if (
				field === 'stock_status' &&
				['instock', 'outofstock', 'onbackorder'].includes(String(value))
			) {
				dimensions.stock_status = value as ProductBrowseDimensions['stock_status'];
			} else if (field === 'stock_status' || (field === 'status' && value !== 'publish'))
				represented = false;
		}
		if (wooOrderby) {
			dimensions.orderby = wooOrderby;
			dimensions.order = state.sort.direction;
		}
		demand.push({
			id: requirementId(options.id, 'product-browse'),
			collection: 'products',
			kind: 'product-browse',
			...dimensions,
			...(active.some(({ field }) => field !== 'status') ? { priority: 700 } : {}),
		});
	} else if (collection === 'customers' && wooOrderbyFor('customers', uiSortField)) {
		const wooOrderby = wooOrderbyFor('customers', uiSortField)!;
		demand.push({
			id: requirementId(options.id, 'customer-browse'),
			collection: 'customers',
			kind: 'customer-browse',
			limit: state.limit,
			orderby: wooOrderby,
			order: state.sort.direction,
		});
	} else if (collection === 'coupons') {
		demand.push({
			id: requirementId(options.id, 'refresh'),
			collection: 'coupons',
			kind: 'refresh',
			priority: 700,
		});
		represented = false;
	} else represented = false;
	return { collection: legacyCollection, demand, represented, read };
}
