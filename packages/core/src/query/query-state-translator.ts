import {
	collectionMap,
	engineCollectionNameFor,
	type EngineDocument,
	type FieldMapEntry,
	type LegacyCollectionName,
	readEnginePath,
	resolveLegacyField,
	sortAliasFor,
	sortTiebreakFor,
	wooOrderbyFor,
} from '@wcpos/query/collection-map';
import { FLEXSEARCH_MIN_TERM_LENGTH, variationAttributesMatch } from '@wcpos/query';
import type { CompiledQueryRead, CompiledSortPart } from '@wcpos/query';
import type {
	EngineRequirement,
	OrderBrowseDimensions,
	ProductBrowseDimensions,
} from '@wcpos/sync-engine';
import { remoteIdOrNull, wooMetaCarrier } from '@wcpos/sync-core';

import { parseRemoteId } from '../utils/parse-remote-id';

import type { CollectionKey, FiltersOf, LogKindFilter, QueryStateOf } from './query-state-types';

type Operator = 'taxonomy-many' | 'value' | 'metadata' | 'store' | 'date-range' | 'all-match';

type WireField = FieldMapEntry & {
	wireFace: NonNullable<FieldMapEntry['wireFace']>;
};
type MappedFilterTranslator = { operator: Operator; mapping: WireField };

const mappedEntry = (mapping: WireField, operator: Operator = 'value'): MappedFilterTranslator => ({
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
	'products/categories': {},
	'products/brands': {},
	'products/tags': {},
	variations: {
		attributeMatches: mappedEntry(collectionMap.variations.fields.attributes, 'all-match'),
		status: mappedEntry(collectionMap.variations.fields.status),
	},
	customers: {},
	'tax-rates': {},
} as const satisfies {
	[C in Exclude<CollectionKey, 'logs'>]: {
		[F in keyof FiltersOf<C>]-?: MappedFilterTranslator;
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

const SYNC_KIND_PREFIX = 'wcpos.sync';

const syncCategoryRange = { $gte: SYNC_KIND_PREFIX, $lt: `${SYNC_KIND_PREFIX}/` };
// mingo has no range-negation, so "not the sync domain" is the complement union —
// including rows that carry no category at all (the schema permits them, and
// displayKind renders them info).
const notSyncCategory = {
	$or: [
		{ category: { $exists: false } },
		{ category: { $lt: SYNC_KIND_PREFIX } },
		{ category: { $gte: `${SYNC_KIND_PREFIX}/` } },
	],
};

// displayKind's actor test is `actor && (actor.id !== undefined || actor.name
// !== undefined)` — a null actor or a role-only actor is NOT an action row, so
// the selectors probe the identifying fields, not the object.
const hasActingActor = {
	$or: [{ 'actor.id': { $exists: true } }, { 'actor.name': { $exists: true } }],
};
const noActingActor = [{ 'actor.id': { $exists: false } }, { 'actor.name': { $exists: false } }];

/**
 * Strict display-kind selectors (A1.5): each kind matches exactly the rows the
 * LEVEL column renders with that kind, mirroring `displayKind`'s precedence —
 * severity wins, then actor (action), then the sync domain, then debug; info is
 * the residual, so it also absorbs absent or unrecognized levels.
 */
function kindConditions(kind: LogKindFilter): Record<string, unknown>[] {
	switch (kind) {
		case 'error':
			return [{ level: 'error' }];
		case 'warn':
			return [{ level: 'warn' }];
		case 'action':
			return [hasActingActor, { level: { $nin: ['error', 'warn'] } }];
		case 'sync':
			return [
				{ category: syncCategoryRange },
				...noActingActor,
				{ level: { $nin: ['error', 'warn'] } },
			];
		case 'info':
			return [{ level: { $nin: ['error', 'warn', 'debug'] } }, ...noActingActor, notSyncCategory];
		case 'debug':
			return [{ level: 'debug' }, ...noActingActor, notSyncCategory];
		default: {
			const exhaustive: never = kind;
			return exhaustive;
		}
	}
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
			...(filters.kind ? kindConditions(filters.kind) : []),
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
	complete?: boolean;
	matches: (document: EngineDocument) => boolean;
} {
	const { mapping, operator } = entryValue;
	const actual = (document: EngineDocument) => mappedValue(mapping, document);
	if (operator === 'taxonomy-many') {
		const ids = [...new Set(value as number[])].sort((a, b) => a - b);
		const prefilter =
			mapping.kind === 'promoted'
				? { [mapping.enginePath]: { $in: ids } }
				: {
						$or: ids.map((id) => ({
							[mapping.enginePath]: { $elemMatch: { id } },
						})),
					};
		return {
			prefilter,
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
		const identityFilter = wooMetaCarrier.identityFilter({
			cashierId: String(id),
		});
		return {
			prefilter: { [mapping.enginePath]: identityFilter.meta_data },
			matches: (document) => String(actual(document)) === String(id),
		};
	}
	if (operator === 'store') {
		const numeric = typeof value === 'number' || /^\d+$/.test(String(value));
		const identityFilter = wooMetaCarrier.identityFilter({
			storeId: String(value),
		});
		return {
			prefilter: numeric
				? { [mapping.enginePath]: identityFilter.meta_data }
				: { 'payload.created_via': value },
			matches: (document) => {
				const payload = readEnginePath(document, 'payload') as Record<string, unknown> | undefined;
				if (!numeric) return payload?.created_via === value;
				const metadata = Array.isArray(payload?.meta_data) ? payload.meta_data : undefined;
				return wooMetaCarrier.readIdentity(metadata).storeId === String(value);
			},
		};
	}
	if (operator === 'all-match') {
		return {
			complete: false,
			// Share translate-selector's missing-payload exclusion and promoted-column matching (#811).
			matches: (document) => variationAttributesMatch(document, value),
		};
	}
	const condition =
		operator === 'date-range'
			? {
					$gte: (value as { from: string }).from,
					$lte: (value as { to: string }).to,
				}
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
	state: Omit<QueryStateOf<C>, 'limit'> & { limit?: number },
	options: {
		id: string;
		targeted?: readonly unknown[];
		searchFields?: string[];
		/** A read-side predicate intentionally left outside QueryState. */
		residual?: boolean;
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
	const targeted = options.targeted?.map(remoteIdOrNull).filter((remoteId) => remoteId !== null);
	const readFilters = active.map(({ translator, value }) => compileReadFilter(translator, value));
	if (targeted !== undefined) {
		const idMapping = resolveLegacyField(legacyCollection, 'id');
		readFilters.push({
			prefilter: { [idMapping.enginePath]: { $in: targeted } },
			matches: (document) => {
				const remoteId = remoteIdOrNull(mappedValue(idMapping, document));
				return remoteId !== null && targeted.includes(remoteId);
			},
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
		complete:
			!options.residual &&
			prefilters.length === readFilters.length &&
			readFilters.every((filter) => filter.complete !== false),
		sort,
		sortPushable: sort.every((part) => part.enginePath !== undefined),
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
	const engineCollection = engineCollectionNameFor(legacyCollection);
	const demand: EngineRequirement[] = [];
	if (targeted?.length) {
		demand.push({
			id: requirementId(options.id, 'targeted-records'),
			collection: engineCollection,
			kind: 'targeted-records',
			remoteIds: targeted,
		} as EngineRequirement);
	}
	if (
		search &&
		(['products', 'customers', 'variations'] as string[]).includes(collection) &&
		(collection !== 'variations' || !targeted?.length) &&
		(collection !== 'customers' || search.length >= FLEXSEARCH_MIN_TERM_LENGTH)
	) {
		demand.push({
			id: requirementId(options.id, 'search'),
			collection: engineCollection,
			kind: 'search',
			term: search,
			...(state.limit !== undefined ? { limit: state.limit } : {}),
		} as EngineRequirement);
	}
	if (demand.length > 0) return { collection: legacyCollection, demand, represented: false, read };

	let represented =
		!options.residual &&
		active.every(({ translator }) => translator.mapping.wireFace !== 'local-only') &&
		(!search || collection === 'orders');
	if (collection === 'orders') {
		const wooOrderby = wooOrderbyFor('orders', uiSortField);
		const dimensions: OrderBrowseDimensions = {
			...(state.limit !== undefined ? { limit: state.limit } : {}),
		};
		let scoped = false;
		for (const { field, value } of active) {
			if (field === 'status' && typeof value === 'string') dimensions.status = value;
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
				const afterSeconds = orderRangeBoundSeconds(range.from);
				const beforeSeconds = orderRangeBoundSeconds(range.to);
				if (afterSeconds !== undefined) dimensions.afterSeconds = afterSeconds;
				if (beforeSeconds !== undefined) dimensions.beforeSeconds = beforeSeconds;
				scoped ||= afterSeconds !== undefined || beforeSeconds !== undefined;
				if (afterSeconds === undefined || beforeSeconds === undefined) represented = false;
			}
		}
		if (search) dimensions.search = search;
		if (wooOrderby) {
			dimensions.orderby = wooOrderby;
			dimensions.order = state.sort.direction;
		}
		if (
			(dimensions.afterSeconds !== undefined || dimensions.beforeSeconds !== undefined) &&
			state.limit !== undefined &&
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
		const dimensions: ProductBrowseDimensions = {
			...(state.limit !== undefined ? { limit: state.limit } : {}),
		};
		let filtered = false;
		for (const { field, value } of active) {
			if (field === 'categories' || field === 'tags' || field === 'brands') {
				const unique = new Set(value as number[]);
				const ids = [
					...new Set([...unique].filter((id) => Number.isSafeInteger(id) && id > 0)),
				].sort((a, b) => a - b);
				if (ids.length > 0 && ids.length === unique.size) {
					dimensions[
						field === 'categories' ? 'category' : (field.slice(0, -1) as 'tag' | 'brand')
					] = ids;
					filtered = true;
				} else represented = false;
			} else if ((field === 'featured' || field === 'on_sale') && typeof value === 'boolean') {
				dimensions[field] = value;
				filtered = true;
			} else if (field === 'featured' || field === 'on_sale') represented = false;
			else if (
				field === 'stock_status' &&
				['instock', 'outofstock', 'onbackorder'].includes(String(value))
			) {
				dimensions.stock_status = value as ProductBrowseDimensions['stock_status'];
				filtered = true;
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
			...(filtered ? { priority: 700 } : {}),
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
	} else if (
		collection === 'coupons' ||
		collection === 'products/categories' ||
		collection === 'products/brands' ||
		collection === 'products/tags'
	) {
		demand.push({
			id: requirementId(options.id, 'refresh'),
			collection: engineCollection,
			kind: 'refresh',
			priority: 700,
		});
		represented = false;
	} else represented = false;
	return { collection: legacyCollection, demand, represented, read };
}
