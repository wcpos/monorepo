/**
 * The requirement bridge (ADR 0027, the catalog demand plane).
 *
 * Translates legacy Mango params into the ONLY remote
 * demand shapes the engine's public `require()` facade actually speaks:
 *
 *  - **finite-ID selectors** (`id: {$in: [...]}` or single-id equality) over the
 *    targeted collections (products, variations, customers, orders) →
 *    `engine.require({kind: 'targeted-records', wooIds})`. Covers parent
 *    variations, grouped products and the default-customer lookup.
 *  - **search demand** (products/customers with a non-empty search term) →
 *    `engine.require({collection, kind: 'search', term, limit})`.
 *  - **orders browse** → `engine.require({kind: 'orders-browse', ...dimensions})`.
 *  - **the products browse window** (products browse — ADR 0027 §2, #909) →

 *    `engine.require({kind: 'product-browse', ...dimensions})`. It carries the grid's own
 *    raw limit, sort, and representable filters.
 *  - **reference browse** (categories/tags/brands/coupons — #952) →
 *    `engine.require({collection, kind: 'refresh'})`. These lanes are no longer seeded at
 *    boot, so mounting a picker/screen over one is what fetches it, deduped by the engine's
 *    `REFERENCE_REFRESH_DEDUPE_MS` window.
 *
 * Unbounded browse over every other collection creates NO remote demand (local residents only).
 *
 */

import { getLogger } from '@wcpos/utils/logger';
import type {
	EngineRequirement,
	OrderBrowseDimensions,
	ProductBrowseDimensions,
	RequirementHandle,
	RxdbSyncEngine,
	SyncCollectionName,
} from '@wcpos/sync-engine';

import {
	type EngineCollectionName,
	engineCollectionNameFor,
	isMappedCollection,
	wooOrderbyFor,
} from './engine-adapter/collection-map';
import { FLEXSEARCH_MIN_TERM_LENGTH } from './engine-query';

/** Engine collections with a `targeted` shape — the only ones `targeted-records` serves. */
const TARGETED_ENGINE_COLLECTIONS = new Set<EngineCollectionName>([
	'products',
	'variations',
	'customers',
	'orders',
]);

const SEARCH_ENGINE_COLLECTIONS = new Set<EngineCollectionName>([
	'products',
	'customers',
	'variations',
]);
const REFERENCE_ENGINE_COLLECTIONS: EngineCollectionName[] = [
	'categories',
	'tags',
	'brands',
	'coupons',
];

const requirementLogger = getLogger(['wcpos', 'query', 'requirement-bridge']);

/**
 * Interactive priority for a browse the cashier has actually narrowed (customer, cashier,
 * store or a date range) — ratified on #943: a cashier-applied dimension rides the same
 * priority band as the browse it replaces.
 */
const ORDER_SCOPED_QUERY_PRIORITY = 700;
/**
 * The "give me every result" sentinel a screen passes when it wants a ranged fetch run to
 * completion. Reports is the only such screen (`REPORTS_ALL_RESULTS_LIMIT =
 * Number.MAX_SAFE_INTEGER`); ordinary grids extend their limit one page at a time (orders:
 * 10, 20 … 200, 210 …) and must stay windowed even once they climb past the browse cap,
 * per the ruling that Reports is the ONLY fetch-to-completion case.
 */
const ORDER_COMPLETE_REQUEST_LIMIT = Number.MAX_SAFE_INTEGER;

function finiteWooIds(selector: Record<string, unknown> | undefined): number[] | null {
	const idSelector = selector?.id as unknown;
	if (idSelector === undefined || idSelector === null) {
		return null;
	}
	const coerce = (value: unknown): number | null => {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : null;
	};
	if (typeof idSelector === 'number' || typeof idSelector === 'string') {
		const single = coerce(idSelector);
		return single === null ? null : [single];
	}
	if (typeof idSelector === 'object') {
		const record = idSelector as Record<string, unknown>;
		if (Array.isArray(record.$in)) {
			const ids = record.$in.map(coerce).filter((id): id is number => id !== null);
			return ids.length > 0 ? ids : null;
		}
		if ('$eq' in record) {
			const single = coerce(record.$eq);
			return single === null ? null : [single];
		}
	}
	return null;
}

/**
 * A `date_created_gmt` range bound as epoch seconds, or `undefined` when the bound cannot be
 * represented as a wire dimension.
 *
 * `YYYY-MM-DD` is already UTC-anchored by the Date Time String Format; `YYYY-MM-DDZ` is NOT a
 * production of that format, so appending `Z` would drop it into each engine's
 * implementation-defined fallback (this app runs on Hermes and JSC as well as V8). Only a
 * time-of-day with no offset needs the explicit UTC designator — the shape
 * `convertLocalDateToUTCString` emits (`yyyy-MM-dd'T'HH:mm:ss`).
 */
function orderRangeBoundSeconds(value: unknown): number | undefined {
	if (typeof value !== 'string') return undefined;
	const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
	const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
	const normalized = dateOnly || hasTimezone ? value : `${value}Z`;
	const milliseconds = Date.parse(normalized);
	if (!Number.isFinite(milliseconds) || milliseconds < 0) return undefined;
	return Math.floor(milliseconds / 1_000);
}

function orderBrowseDimensions(
	selector: Record<string, unknown> | undefined,
	limit: number | undefined,
	sort: readonly RequirementSortPart[] | undefined
): { dimensions: OrderBrowseDimensions; scoped: boolean; residual: boolean } {
	const dimensions: OrderBrowseDimensions = {};
	const conditions = [
		...(selector ? [selector] : []),
		...(Array.isArray(selector?.$and) ? selector.$and : []),
	];
	const consumed = conditions.map(() => new Set<string>());
	if (selector && Array.isArray(selector.$and)) consumed[0]?.add('$and');
	const statusValue = (() => {
		const status = selector?.status as unknown;
		if (typeof status === 'string' && status.length > 0) {
			consumed[0]?.add('status');
			return status;
		}
		if (status && typeof status === 'object') {
			const record = status as Record<string, unknown>;
			if (Object.keys(record).length === 1 && typeof record.$eq === 'string' && record.$eq) {
				consumed[0]?.add('status');
				return record.$eq;
			}
		}
		return undefined;
	})();
	if (statusValue !== undefined) dimensions.status = statusValue;
	if (typeof selector?.search === 'string') {
		dimensions.search = selector.search;
		consumed[0]?.add('search');
	}
	const customerValue = selector?.customer_id;
	const customerId = (() => {
		if (typeof customerValue === 'number') return customerValue;
		if (
			customerValue &&
			typeof customerValue === 'object' &&
			Object.keys(customerValue).length === 1
		) {
			return (customerValue as Record<string, unknown>).$eq;
		}
		return undefined;
	})();
	if (Number.isSafeInteger(customerId) && (customerId as number) >= 0) {
		dimensions.customerId = customerId as number;
		consumed[0]?.add('customer_id');
	}
	// Only `status`, `customer_id` and `dateRange` are promoted to the selector ROOT
	// (`REQUIREMENT_TOP_LEVEL_FIELDS` in query-state-translator); cashier and store compile
	// into `$and` conditions instead, because both meta filters land on the same `meta_data`
	// key and would otherwise overwrite each other. Every dimension below therefore has to
	// look in both places.
	const metaValue = (
		key: '_pos_user' | '_pos_store'
	): { value: string; index: number; exact: boolean } | undefined => {
		for (const [index, condition] of conditions.entries()) {
			if (condition === null || typeof condition !== 'object') continue;
			const record = condition as Record<string, unknown>;
			const metaData = record.meta_data;
			if (metaData === null || typeof metaData !== 'object') continue;
			const elemMatch = (metaData as Record<string, unknown>).$elemMatch;
			if (
				elemMatch !== null &&
				typeof elemMatch === 'object' &&
				(elemMatch as Record<string, unknown>).key === key &&
				typeof (elemMatch as Record<string, unknown>).value === 'string'
			) {
				return {
					value: (elemMatch as Record<string, unknown>).value as string,
					index,
					exact: Object.keys(record).length === 1,
				};
			}
		}
		return undefined;
	};
	const cashierMeta = metaValue('_pos_user');
	const cashier = cashierMeta?.value;
	const cashierId = cashier !== undefined && /^\d+$/.test(cashier) ? Number(cashier) : undefined;
	if (cashierId !== undefined && Number.isSafeInteger(cashierId)) {
		dimensions.cashierId = cashierId;
		if (cashierMeta?.exact) consumed[cashierMeta.index]?.add('meta_data');
	}
	const storeMeta = metaValue('_pos_store');
	const metaStore = storeMeta?.value;
	// A store-less install selects its store by slug, which the translator compiles to
	// `created_via` — a nested `$and` condition, not a root field (see the note above). A
	// root-only read silently dropped `:store=` for exactly that case, leaving the ranged
	// reports fetch unscoped and letting other stores' orders consume its record backstop.
	const createdVia = (() => {
		for (const [index, condition] of conditions.entries()) {
			if (condition === null || typeof condition !== 'object') continue;
			const record = condition as Record<string, unknown>;
			const value = record.created_via;
			if (typeof value === 'string') {
				return { value, index, exact: Object.keys(record).length === 1 };
			}
			if (value !== null && typeof value === 'object') {
				const valueRecord = value as Record<string, unknown>;
				const eq = valueRecord.$eq;
				if (typeof eq === 'string') {
					return {
						value: eq,
						index,
						exact: Object.keys(record).length === 1 && Object.keys(valueRecord).length === 1,
					};
				}
			}
		}
		return undefined;
	})();
	const store =
		typeof metaStore === 'string' && /^\d+$/.test(metaStore)
			? metaStore
			: createdVia && /^[a-z0-9_-]+$/.test(createdVia.value)
				? createdVia.value
				: undefined;
	if (store !== undefined) {
		dimensions.store = store;
		if (storeMeta?.exact && store === metaStore) consumed[storeMeta.index]?.add('meta_data');
	}
	if (metaStore === undefined && createdVia?.exact && store === createdVia.value) {
		consumed[createdVia.index]?.add('created_via');
	}
	const range = selector?.date_created_gmt as Record<string, unknown> | null | undefined;
	const afterSeconds =
		range && typeof range === 'object' ? orderRangeBoundSeconds(range.$gte) : undefined;
	const beforeSeconds =
		range && typeof range === 'object' ? orderRangeBoundSeconds(range.$lte) : undefined;
	if (afterSeconds !== undefined) dimensions.afterSeconds = afterSeconds;
	if (beforeSeconds !== undefined) dimensions.beforeSeconds = beforeSeconds;
	if (range && typeof range === 'object') {
		const entries = Object.entries(range);
		if (
			entries.length > 0 &&
			entries.every(
				([operator, boundary]) =>
					(operator === '$gte' || operator === '$lte') &&
					orderRangeBoundSeconds(boundary) !== undefined
			)
		) {
			consumed[0]?.add('date_created_gmt');
		}
	}
	const [primarySort] = sort ?? [];
	const [rawSortField, direction] = Object.entries(primarySort ?? {})[0] ?? [];
	const sortField = rawSortField?.replace(/^sortable_/, '');
	/**
	 * An absent order declaration falls back to the default `id desc` browse, which for an
	 * ascending sort is the far end of the catalog. `number → id` is deliberate: core Woo's
	 * order number is the post ID. A sequential-order-number plugin can decouple them, but
	 * dropping the mapping would fetch the newest orders for an ascending browse instead.
	 */
	const orderby = sortField ? wooOrderbyFor('orders', sortField) : undefined;
	if (orderby !== undefined && direction !== undefined) {
		dimensions.orderby = orderby;
		dimensions.order = direction;
	}
	const ranged = afterSeconds !== undefined || beforeSeconds !== undefined;
	if (ranged && typeof limit === 'number' && limit >= ORDER_COMPLETE_REQUEST_LIMIT) {
		dimensions.limit = 'all';
	} else if (limit !== undefined) {
		dimensions.limit = limit;
	}
	const scoped =
		dimensions.customerId !== undefined ||
		dimensions.cashierId !== undefined ||
		dimensions.store !== undefined ||
		dimensions.afterSeconds !== undefined ||
		dimensions.beforeSeconds !== undefined;
	const residual = conditions.some((condition, index) => {
		if (condition === null || typeof condition !== 'object') return true;
		return Object.keys(condition as Record<string, unknown>).some(
			(key) => !consumed[index]?.has(key)
		);
	});
	return {
		dimensions,
		scoped,
		residual,
	};
}

export type RequirementSortPart = Record<string, 'asc' | 'desc'>;

function productBrowseDimensions(
	selector: Record<string, unknown> | undefined,
	limit: number | undefined,
	sort: readonly RequirementSortPart[] | undefined
): {
	dimensions: ProductBrowseDimensions;
	filtered: boolean;
	residual: boolean;
} {
	const dimensions: ProductBrowseDimensions = {};
	if (limit !== undefined) dimensions.limit = limit;
	const [primary] = sort ?? [];
	const [field, direction] = Object.entries(primary ?? {})[0] ?? [];
	const orderby = field ? wooOrderbyFor('products', field) : undefined;
	if (orderby !== undefined && direction !== undefined) {
		dimensions.orderby = orderby;
		dimensions.order = direction;
	}
	const { filters, residual } = productBrowseWindowFilters(selector);
	return {
		dimensions: { ...dimensions, ...filters },
		filtered: Object.keys(filters).length > 0,
		residual,
	};
}

/**
 * Split the products selector for `requirementsForQuery` into browse-window filters and
 * residual local predicates. A residual keeps the wire window as a deliberate superset and
 * makes `requirementsForQuery` report that the selector was not fully represented.
 */
/** A condition value in either the bare or single-key `$eq` shape the translator can emit. */
function eqValue(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (value === null || typeof value !== 'object') return undefined;
	const record = value as Record<string, unknown>;
	return Object.keys(record).length === 1 && typeof record.$eq === 'string'
		? record.$eq
		: undefined;
}

function productBrowseWindowFilters(selector: Record<string, unknown> | undefined): {
	filters: Pick<
		ProductBrowseDimensions,
		'category' | 'tag' | 'brand' | 'featured' | 'on_sale' | 'stock_status'
	>;
	residual: boolean;
} {
	const filters: Pick<
		ProductBrowseDimensions,
		'category' | 'tag' | 'brand' | 'featured' | 'on_sale' | 'stock_status'
	> = {};
	let residual = false;
	// An absent selector is the UNFILTERED browse — nothing to represent, nothing left over.
	// A nullish entry inside `$and` is a different thing: a predicate that cannot be encoded.
	const conditions = [
		...(selector ? [selector] : []),
		...(Array.isArray(selector?.$and) ? selector.$and : []),
	];
	for (const condition of conditions) {
		if (condition === null || typeof condition !== 'object') {
			residual = true;
			continue;
		}
		const record = condition as Record<string, unknown>;
		// Keys this condition contributed to the wire key. Anything left over at the end is
		// a predicate only the local selector enforces.
		const consumed = new Set<string>();
		if (condition === selector && Array.isArray(record.$and)) consumed.add('$and');
		const alternatives = Array.isArray(record.$or) ? record.$or : [];
		for (const [local, remote] of [
			['categories', 'category'],
			['tags', 'tag'],
			['brands', 'brand'],
		] as const) {
			const ids = alternatives.map((alternative) => {
				if (alternative === null || typeof alternative !== 'object') return null;
				const taxonomy = (alternative as Record<string, unknown>)[local];
				if (taxonomy === null || typeof taxonomy !== 'object') return null;
				const elemMatch = (taxonomy as Record<string, unknown>).$elemMatch;
				if (elemMatch === null || typeof elemMatch !== 'object') return null;
				const id = (elemMatch as Record<string, unknown>).id;
				// A one-key `$elemMatch` is the whole predicate; `{id, option}` (the attribute
				// matcher's shape) narrows further than `?category=` can express.
				if (Object.keys(elemMatch as Record<string, unknown>).length !== 1) return null;
				return Number.isSafeInteger(id) && (id as number) > 0 ? (id as number) : null;
			});
			if (ids.length > 0 && ids.every((id): id is number => id !== null)) {
				const previous = filters[remote] ?? [];
				filters[remote] = [...new Set([...previous, ...ids])].sort((a, b) => a - b);
				consumed.add('$or');
			}
		}
		for (const field of ['featured', 'on_sale'] as const) {
			if (typeof record[field] === 'boolean') {
				filters[field] = record[field];
				consumed.add(field);
			}
		}
		const stockValue = eqValue(record.stock_status);
		if (stockValue === 'instock' || stockValue === 'outofstock' || stockValue === 'onbackorder') {
			filters.stock_status = stockValue;
			consumed.add('stock_status');
		}
		// `status` carries NO dimension on the key, yet `status: 'publish'` is still fully
		// represented: fetchProductBrowseWindow hardcodes `status=publish` on every window
		// request, so a published-only selector is exactly what the lane holds. The POS
		// products grid sets this on every browse — without it the main grid would lose its
		// coverage total. Any OTHER status has an empty intersection with the window.
		if (eqValue(record.status) === 'publish') consumed.add('status');
		if (Object.keys(record).some((key) => !consumed.has(key))) residual = true;
	}
	return { filters, residual };
}

export interface RequirementInput {
	id: string;
	collectionName: string;
	selector: Record<string, unknown> | undefined;
	limit: number | undefined;
	sort?: readonly RequirementSortPart[];
	priority?: number;
	forceRefresh?: boolean;
}

export type RequirementPlan = {
	requirements: EngineRequirement[];
	/** The browse selector was fully expressed as wire dimensions. */
	represented: boolean;
};

/**
 * Build the engine requirements a query implies. An empty requirements array means the
 * accepted local-residents-only case.
 */
export function requirementsForQuery(input: RequirementInput): RequirementPlan {
	const { collectionName, selector, limit } = input;
	if (!isMappedCollection(collectionName)) {
		return { requirements: [], represented: false };
	}
	const engineCollection = engineCollectionNameFor(collectionName);
	const requirements: EngineRequirement[] = [];

	const wooIds = finiteWooIds(selector);
	if (wooIds && TARGETED_ENGINE_COLLECTIONS.has(engineCollection)) {
		requirements.push({
			id: `${input.id}:targeted`,
			collection: engineCollection,
			kind: 'targeted-records',
			wooIds,
			...(input.priority !== undefined ? { priority: input.priority } : {}),
			...(input.forceRefresh ? { forceRefresh: true } : {}),
		});
	}

	const rawSearchTerm = typeof selector?.search === 'string' ? selector.search : '';
	const trimmedSearchTerm = rawSearchTerm.trim();
	if (
		trimmedSearchTerm &&
		SEARCH_ENGINE_COLLECTIONS.has(engineCollection) &&
		(engineCollection !== 'variations' || !wooIds) &&
		(engineCollection !== 'customers' || trimmedSearchTerm.length >= FLEXSEARCH_MIN_TERM_LENGTH)
	) {
		requirements.push({
			id: `${input.id}:search`,
			collection: engineCollection,
			kind: 'search',
			term: rawSearchTerm,
			...(limit !== undefined ? { limit } : {}),
			...(input.priority !== undefined ? { priority: input.priority } : {}),
			...(input.forceRefresh ? { forceRefresh: true } : {}),
		});
	}

	if (requirements.length > 0) {
		return { requirements, represented: false };
	}

	if (engineCollection === 'orders') {
		const { dimensions, scoped, residual } = orderBrowseDimensions(selector, limit, input.sort);
		const priority = input.priority ?? (scoped ? ORDER_SCOPED_QUERY_PRIORITY : undefined);
		return {
			requirements: [
				{
					id: `${input.id}:orders-browse`,
					collection: 'orders',
					kind: 'orders-browse',
					...dimensions,
					...(priority !== undefined ? { priority } : {}),
					...(input.forceRefresh ? { forceRefresh: true } : {}),
				},
			],
			represented: !residual,
		};
	}

	// Products browse → the browse window (ADR 0027 §2, #909). The window
	// carries the grid's own limit and sort, so scrolling past the cold seed fetches the
	// next rows and a sort change re-seeds a SERVER-sorted window instead of locally
	// re-sorting the wrong slice of the catalog. Representable filters travel on the key;
	// every other predicate keeps narrowing the resulting superset locally.
	if (engineCollection === 'products') {
		const extraction = productBrowseDimensions(selector, limit, input.sort);
		const priority = input.priority ?? (extraction.filtered ? 700 : undefined);
		return {
			requirements: [
				{
					id: `${input.id}:products-browse-window`,
					collection: 'products',
					kind: 'product-browse',
					...extraction.dimensions,
					...(priority !== undefined ? { priority } : {}),
					...(input.forceRefresh ? { forceRefresh: true } : {}),
				},
			],
			represented: !extraction.residual,
		};
	}

	// Reference browse → an on-demand greedy pull at open (#952). These collections are no
	// longer seeded at boot, so the picker/screen/cart binding that mounts over one is what
	// materializes it. Deliberately drops `forceRefresh`: a UI binding re-declares on every
	// render, and forcing would bypass REFERENCE_REFRESH_DEDUPE_MS and re-pull the whole
	// collection per mount — the boot-time server hammering this issue set out to remove.
	// The one caller that legitimately forces (Clear & Sync refill) re-applies it below.
	if (REFERENCE_ENGINE_COLLECTIONS.includes(engineCollection)) {
		return {
			requirements: [
				{
					id: `${input.id}:reference-refresh`,
					collection: engineCollection,
					kind: 'refresh',
					priority: input.priority ?? 700,
				},
			],
			represented: false,
		};
	}

	// Every other collection: unbounded browse → local residents only (ADR 0027).
	return { requirements: [], represented: false };
}

/**
 * Declare a query's requirements against the engine, returning the live handles.
 * Rejections are swallowed here: demand is best-effort and self-heals on the next
 * declaration (UI requirements are re-declared every render).
 */
export function declareRequirements(
	engine: RxdbSyncEngine,
	requirements: EngineRequirement[]
): RequirementHandle[] {
	return requirements.map((requirement) => {
		const handle = engine.require(requirement);
		handle.ready.catch((error) => {
			if (requirement.kind === 'search') {
				requirementLogger.warn('Search requirement failed; continuing with local results', {
					context: {
						collection: requirement.collection,
						termLength: requirement.term?.length ?? 0,
						error,
					},
				});
			}
		});
		return handle;
	});
}

/** Binding-independent refill for collections a reset may have emptied with no binding
 * mounted over them. Mounted bindings replay themselves (coverageGeneration). */
export function resetRefillRequirements(collectionNames: string[]): EngineRequirement[] {
	const wanted = new Set(collectionNames);
	const resetEngineCollections = new Set<EngineCollectionName>(
		collectionNames
			.filter(isMappedCollection)
			.map((collectionName) => engineCollectionNameFor(collectionName))
	);
	const requirements: EngineRequirement[] = [];
	// Reset refill is the one path that must beat the dedupe window: the local collection was
	// just wiped, so serving "recently refreshed" residents would serve nothing. The UI
	// binding branch of `requirementsForQuery` deliberately drops `forceRefresh` (#952), so
	// the refill declares its own forced refresh per reset reference collection.
	for (const collection of REFERENCE_ENGINE_COLLECTIONS) {
		if (!resetEngineCollections.has(collection)) continue;
		requirements.push({
			id: `${collection}:collection-reset`,
			collection,
			kind: 'refresh',
			forceRefresh: true,
			priority: 1000,
		});
	}
	if (wanted.has('taxes')) {
		requirements.push({
			id: 'taxRates:collection-reset',
			collection: 'taxRates',
			kind: 'refresh',
			priority: 1000,
		});
	}
	return requirements;
}

export async function runResetRefill(
	engine: RxdbSyncEngine,
	collectionNames: string[]
): Promise<void> {
	const requirements = resetRefillRequirements(collectionNames);
	const engineCollections = new Set<SyncCollectionName>(
		collectionNames
			.filter(isMappedCollection)
			.map((collectionName) => engineCollectionNameFor(collectionName))
	);
	// Variations count as a browse-seed trigger: the funnel usually resets
	// ['variations', 'products'] together, but a standalone variations reset (the Health
	// page's per-collection row) would otherwise declare no refill work at all. The seed
	// re-materializes the catalog surface; per-parent variation fetch stays on-demand.
	const seedProductBrowse =
		engineCollections.has('products') || engineCollections.has('variations');
	// Re-arm normal policy: the product/variation browse seed now, and the reference
	// collections through the forced refresh requirements built above — NOT through the
	// `reference-seed` maintenance lane, which gates on local residents and would skip a
	// collection the reset just emptied. Customers resume on demand plus idle trickle from
	// page 1 (not ticked while active), and orders wait for view demand or their periodic
	// window cadence.

	if (seedProductBrowse) await engine.sync('product-browse-window-seed');
	const handles = declareRequirements(engine, requirements);
	try {
		await Promise.all(handles.map((handle) => handle.ready.catch(() => undefined)));
	} finally {
		for (const handle of handles) handle.release();
	}
	await engine.sync('scheduler-drain');
}
