/**
 * The requirement bridge (ADR 0027, the catalog demand plane) — increment 1b.
 *
 * Translates a fluent {@link Query}'s legacy Mango params into the ONLY remote
 * demand shapes the engine's public `require()` facade actually speaks:
 *
 *  - **finite-ID selectors** (`id: {$in: [...]}` or single-id equality) over the
 *    targeted collections (products, variations, customers, orders) →
 *    `engine.require({kind: 'targeted-records', wooIds})`. Covers parent
 *    variations, grouped products and the default-customer lookup.
 *  - **search demand** (products/customers with a non-empty search term) →
 *    `engine.require({collection, kind: 'search', term, limit})`.
 *  - **order query descriptors** (unbounded orders browse) →
 *    `engine.require({collection: 'orders', kind: 'query', queryKey})` with the
 *    `orders:browser:status=…[:customer=…][:cashier=…][:store=…][:after=…][:before=…]`
 *    `[:orderby=…:order=…]:search=…:limit=…` descriptor the engine parses. Structured
 *    dimensions precede `:search=`, which stays the last free-text field; `orderby`
 *    and `order` only ever appear as a pair, and the `id`/`desc` default is omitted.
 *  - **the products browse window** (products browse — ADR 0027 §2, #909) →

 *    `engine.require({collection: 'products', kind: 'query', queryKey})` with the
 *    `products:browse-window:limit=…[:orderby=…:order=…]` descriptor plus optional native
 *    filter dimensions. It carries the grid's own limit, sort, and representable filters.
 *
 * Unbounded browse over every other collection creates NO remote demand (local residents
 * only). The `greedy`/`endpoint` keys no longer create remote work; they are accepted and
 * ignored (deleted at convergence).
 *
 */

import { getLogger } from '@wcpos/utils/logger';
import type {
	EngineRequirement,
	RequirementHandle,
	RxdbSyncEngine,
	SyncCollectionName,
} from '@wcpos/sync-engine';

import {
	type EngineCollectionName,
	engineCollectionNameFor,
	isMappedCollection,
} from './engine-adapter/collection-map';

/** Engine collections with a `targeted` shape — the only ones `targeted-records` serves. */
const TARGETED_ENGINE_COLLECTIONS = new Set<EngineCollectionName>([
	'products',
	'variations',
	'customers',
	'orders',
]);

const SEARCH_ENGINE_COLLECTIONS = new Set<EngineCollectionName>(['products', 'customers']);

const requirementLogger = getLogger(['wcpos', 'query', 'requirement-bridge']);

/** The web scheduler's browse-lane cap; the engine rejects larger order descriptors. */
const ORDER_BROWSE_MAX_LIMIT = 200;

/**
 * Interactive priority for a browse the cashier has actually narrowed (customer, cashier,
 * store or a date range) — ratified on #943: a cashier-applied dimension rides the same
 * priority band as the browse it replaces.
 */
const ORDER_SCOPED_QUERY_PRIORITY = 700;
const ORDER_BROWSE_ORDERBY_BY_SORT_FIELD = {
	date_created_gmt: 'date',
	date_modified_gmt: 'modified',
	number: 'id',
	id: 'id',
} as const;

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
 * A `date_created_gmt` range bound as epoch SECONDS, or `undefined` when the bound cannot be
 * represented in the descriptor grammar. Exported because coverage eligibility in
 * `@wcpos/core` has to accept exactly the bounds this encodes — a bound one side accepts and
 * the other drops makes the coverage lane wider than the selector it reports for.
 *
 * `YYYY-MM-DD` is already UTC-anchored by the Date Time String Format; `YYYY-MM-DDZ` is NOT a
 * production of that format, so appending `Z` would drop it into each engine's
 * implementation-defined fallback (this app runs on Hermes and JSC as well as V8). Only a
 * time-of-day with no offset needs the explicit UTC designator — the shape
 * `convertLocalDateToUTCString` emits (`yyyy-MM-dd'T'HH:mm:ss`).
 */
export function orderRangeBoundSeconds(value: unknown): number | undefined {
	if (typeof value !== 'string') return undefined;
	const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
	const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
	const normalized = dateOnly || hasTimezone ? value : `${value}Z`;
	const milliseconds = Date.parse(normalized);
	if (!Number.isFinite(milliseconds) || milliseconds < 0) return undefined;
	return Math.floor(milliseconds / 1_000);
}

/**
 * `scoped` is the cashier-applied-dimension flag that earns interactive priority. It is
 * returned alongside the key rather than re-derived by sniffing the key text: `search` is
 * arbitrary cashier input, so a term like `note:customer=42` would match a
 * `queryKey.includes(':customer=')` test and promote an entirely unfiltered browse. Sort is
 * deliberately NOT scoping — a sort change reshapes the window, it does not narrow it.
 */
function orderBrowseDescriptor(
	selector: Record<string, unknown> | undefined,
	limit: number | undefined,
	sort: readonly RequirementSortPart[] | undefined
): { queryKey: string; scoped: boolean } {
	const statusValue = (() => {
		const status = selector?.status as unknown;
		if (typeof status === 'string' && status.length > 0) return status;
		if (status && typeof status === 'object' && typeof (status as any).$eq === 'string') {
			return (status as any).$eq as string;
		}
		return 'all';
	})();
	const searchValue = typeof selector?.search === 'string' ? (selector.search as string) : '';
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
	const customerPart =
		Number.isSafeInteger(customerId) && (customerId as number) >= 0
			? `:customer=${customerId}`
			: '';
	// Only `status`, `customer_id` and `dateRange` are promoted to the selector ROOT
	// (`REQUIREMENT_TOP_LEVEL_FIELDS` in query-state-translator); cashier and store compile
	// into `$and` conditions instead, because both meta filters land on the same `meta_data`
	// key and would otherwise overwrite each other. Every dimension below therefore has to
	// look in both places.
	const conditionsToScan = () => [
		selector,
		...(Array.isArray(selector?.$and) ? selector.$and : []),
	];
	const metaValue = (key: '_pos_user' | '_pos_store'): string | undefined => {
		const conditions = conditionsToScan();
		for (const condition of conditions) {
			if (condition === null || typeof condition !== 'object') continue;
			const metaData = (condition as Record<string, unknown>).meta_data;
			if (metaData === null || typeof metaData !== 'object') continue;
			const elemMatch = (metaData as Record<string, unknown>).$elemMatch;
			if (
				elemMatch !== null &&
				typeof elemMatch === 'object' &&
				(elemMatch as Record<string, unknown>).key === key &&
				typeof (elemMatch as Record<string, unknown>).value === 'string'
			) {
				return (elemMatch as Record<string, unknown>).value as string;
			}
		}
		return undefined;
	};
	const cashier = metaValue('_pos_user');
	const cashierId = cashier !== undefined && /^\d+$/.test(cashier) ? Number(cashier) : undefined;
	const cashierPart =
		cashierId !== undefined && Number.isSafeInteger(cashierId) ? `:cashier=${cashierId}` : '';
	const metaStore = metaValue('_pos_store');
	// A store-less install selects its store by slug, which the translator compiles to
	// `created_via` — a nested `$and` condition, not a root field (see the note above). A
	// root-only read silently dropped `:store=` for exactly that case, leaving the ranged
	// reports fetch unscoped and letting other stores' orders consume its record backstop.
	const createdVia = (() => {
		for (const condition of conditionsToScan()) {
			if (condition === null || typeof condition !== 'object') continue;
			const value = (condition as Record<string, unknown>).created_via;
			if (typeof value === 'string') return value;
			if (value !== null && typeof value === 'object') {
				const eq = (value as Record<string, unknown>).$eq;
				if (typeof eq === 'string') return eq;
			}
		}
		return undefined;
	})();
	const store =
		typeof metaStore === 'string' && /^\d+$/.test(metaStore)
			? metaStore
			: typeof createdVia === 'string' && /^[a-z0-9_-]+$/.test(createdVia)
				? createdVia
				: undefined;
	const storePart = store === undefined ? '' : `:store=${store}`;
	const range = selector?.date_created_gmt as Record<string, unknown> | null | undefined;
	const afterSeconds =
		range && typeof range === 'object' ? orderRangeBoundSeconds(range.$gte) : undefined;
	const beforeSeconds =
		range && typeof range === 'object' ? orderRangeBoundSeconds(range.$lte) : undefined;
	const rangePart = `${afterSeconds === undefined ? '' : `:after=${afterSeconds}`}${
		beforeSeconds === undefined ? '' : `:before=${beforeSeconds}`
	}`;
	const [primarySort] = sort ?? [];
	const [rawSortField, direction] = Object.entries(primarySort ?? {})[0] ?? [];
	const sortField = rawSortField?.replace(/^sortable_/, '');
	const orderby = sortField
		? ORDER_BROWSE_ORDERBY_BY_SORT_FIELD[
				sortField as keyof typeof ORDER_BROWSE_ORDERBY_BY_SORT_FIELD
			]
		: undefined;
	const sortPart =
		orderby === undefined || (orderby === 'id' && direction === 'desc')
			? ''
			: `:orderby=${orderby}:order=${direction}`;
	// Structured dimensions (customer, cashier, store, the range bounds, then the sort pair)
	// precede `:search=` so arbitrary search text can never be read back as a filter or sort —
	// see the grammar note in order-browser-scheduler-descriptor.ts.
	const dimensionParts = `${customerPart}${cashierPart}${storePart}${rangePart}${sortPart}`;
	const filtered = Boolean(customerPart || cashierPart || storePart || rangePart);
	if (rangePart && typeof limit === 'number' && limit >= ORDER_COMPLETE_REQUEST_LIMIT) {
		return {
			queryKey: `orders:browser:status=${statusValue}${dimensionParts}:search=${searchValue}:limit=all`,
			scoped: true,
		};
	}
	const boundedLimit = Math.min(
		Math.max(1, typeof limit === 'number' && Number.isFinite(limit) ? limit : 10),
		ORDER_BROWSE_MAX_LIMIT
	);
	return {
		queryKey: `orders:browser:status=${statusValue}${dimensionParts}:search=${searchValue}:limit=${boundedLimit}`,
		scoped: filtered,
	};
}

/**
 * The products browse-window grammar (ADR 0027 §2), the products mirror of
 * `orderBrowseDescriptor` above. The engine owns the authoritative parser
 * (`parseProductBrowseWindowDescriptor`); this builds the same string, as the orders
 * descriptor already does, rather than widening the engine's two-door surface.
 */
const PRODUCT_BROWSE_WINDOW_STEP = 100;
const PRODUCT_BROWSE_WINDOW_MAX_LIMIT = 1_000;
const PRODUCT_BROWSE_DEFAULT_ORDERBY = 'menu_order';
const PRODUCT_BROWSE_DEFAULT_ORDER = 'asc';
const PRODUCT_STOCK_STATUSES = new Set(['instock', 'outofstock', 'onbackorder']);

/**
 * UI sort field → WC core products `orderby`. Fields NOT in this map (sku, barcode,
 * stock, regular/sale price) have no Woo REST equivalent: those browses fall back to the
 * DEFAULT window rather than pretending a server-sorted slice exists.
 */
const PRODUCT_BROWSE_ORDERBY_BY_SORT_FIELD: Record<string, string> = {
	menu_order: 'menu_order',
	id: 'id',
	name: 'title',
	price: 'price',
	sortable_price: 'price',
	total_sales: 'popularity',
	date_created_gmt: 'date',
	date_modified_gmt: 'modified',
};

export type RequirementSortPart = Record<string, 'asc' | 'desc'>;

function productBrowseWindowDescriptor(
	selector: Record<string, unknown> | undefined,
	limit: number | undefined,
	sort: readonly RequirementSortPart[] | undefined
): { queryKey: string; filtered: boolean; residual: boolean } {
	// The grid extends its limit 10 rows at a time; quantizing to the window step keeps
	// the coverage-lane space small (limit=100, 200, 300 …) instead of one lane per tick.
	const requested =
		typeof limit === 'number' && Number.isFinite(limit) && limit > 0
			? limit
			: PRODUCT_BROWSE_WINDOW_STEP;
	const boundedLimit = Math.min(
		Math.ceil(requested / PRODUCT_BROWSE_WINDOW_STEP) * PRODUCT_BROWSE_WINDOW_STEP,
		PRODUCT_BROWSE_WINDOW_MAX_LIMIT
	);
	const [primary] = sort ?? [];
	const [field, direction] = Object.entries(primary ?? {})[0] ?? [];
	const orderby = field ? PRODUCT_BROWSE_ORDERBY_BY_SORT_FIELD[field] : undefined;
	const order = direction === 'desc' ? 'desc' : 'asc';
	const base = `products:browse-window:limit=${boundedLimit}`;
	const sortPart =
		orderby === undefined ||
		(orderby === PRODUCT_BROWSE_DEFAULT_ORDERBY && order === PRODUCT_BROWSE_DEFAULT_ORDER)
			? ''
			: `:orderby=${orderby}:order=${order}`;
	const { filters, residual } = productBrowseWindowFilters(selector);
	const filterPart = ['category', 'tag', 'brand', 'featured', 'on_sale', 'stock_status']
		.filter((field) => filters[field] !== undefined)
		.map((field) => `:${field}=${filters[field]}`)
		.join('');
	return {
		queryKey: `${base}${sortPart}${filterPart}`,
		filtered: filterPart.length > 0,
		residual,
	};
}

/**
 * Split a products selector into the dimensions the browse-window grammar can carry and
 * whether anything was left over.
 *
 * `residual` is true when some part of the selector could NOT be encoded — an attribute or
 * variation match, a status, a bare uuid, a mixed `$or`. Those predicates keep narrowing
 * locally, which is exactly right for DEMAND (the wire window is a deliberate superset) but
 * makes the coverage lane wider than the selector it would be reported for. Callers that
 * project a total off the lane must consult this rather than restating these rules
 * elsewhere — a rule stated twice is a rule that drifts.
 */
export function productBrowseWindowFilters(selector: Record<string, unknown> | undefined): {
	filters: Record<string, string>;
	residual: boolean;
} {
	const filters: Record<string, string> = {};
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
				const previous = filters[remote]?.split(',').map(Number) ?? [];
				filters[remote] = [...new Set([...previous, ...ids])].sort((a, b) => a - b).join(',');
				consumed.add('$or');
			}
		}
		for (const field of ['featured', 'on_sale'] as const) {
			if (typeof record[field] === 'boolean') {
				filters[field] = record[field] ? '1' : '0';
				consumed.add(field);
			}
		}
		const stock = record.stock_status;
		const stockValue =
			typeof stock === 'string'
				? stock
				: stock !== null && typeof stock === 'object'
					? (stock as Record<string, unknown>).$eq
					: undefined;
		if (PRODUCT_STOCK_STATUSES.has(stockValue as string)) {
			filters.stock_status = stockValue as string;
			consumed.add('stock_status');
		}
		if (Object.keys(record).some((key) => !consumed.has(key))) residual = true;
	}
	return { filters, residual };
}

/**
 * Whether the browse-window coverage lane for this products selector covers EXACTLY the
 * selector — i.e. every predicate reached the wire. The products mirror of
 * `isFullyRepresentedOrderSelector` in `@wcpos/core`, but kept here beside the encoder so
 * the two can never disagree.
 */
export function isFullyRepresentedProductSelector(
	selector: Record<string, unknown> | undefined
): boolean {
	return !productBrowseWindowFilters(selector).residual;
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

/**
 * Build the engine requirements a query implies. Returns `[]` (no remote demand)
 * for the accepted local-residents-only cases.
 */
export function requirementsForQuery(input: RequirementInput): EngineRequirement[] {
	const { collectionName, selector, limit } = input;
	if (!isMappedCollection(collectionName)) {
		return [];
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
	if (rawSearchTerm.trim() && SEARCH_ENGINE_COLLECTIONS.has(engineCollection)) {
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
		return requirements;
	}

	if (engineCollection === 'orders') {
		const { queryKey, scoped } = orderBrowseDescriptor(selector, limit, input.sort);
		const priority = input.priority ?? (scoped ? ORDER_SCOPED_QUERY_PRIORITY : undefined);
		return [
			{
				id: `${input.id}:orders-query`,
				collection: 'orders',
				kind: 'query',
				queryKey,
				...(priority !== undefined ? { priority } : {}),
				...(input.forceRefresh ? { forceRefresh: true } : {}),
			},
		];
	}

	// Products browse → the browse window (ADR 0027 §2, #909). The window
	// carries the grid's own limit and sort, so scrolling past the cold seed fetches the
	// next rows and a sort change re-seeds a SERVER-sorted window instead of locally
	// re-sorting the wrong slice of the catalog. Representable filters travel on the key;
	// every other predicate keeps narrowing the resulting superset locally.
	if (engineCollection === 'products') {
		const descriptor = productBrowseWindowDescriptor(selector, limit, input.sort);
		const priority = input.priority ?? (descriptor.filtered ? 700 : undefined);
		return [
			{
				id: `${input.id}:products-browse-window`,
				collection: 'products',
				kind: 'query',
				queryKey: descriptor.queryKey,
				...(priority !== undefined ? { priority } : {}),
				...(input.forceRefresh ? { forceRefresh: true } : {}),
			},
		];
	}

	// Every other collection: unbounded browse → local residents only (ADR 0027).
	return [];
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

type ActiveBinding = Omit<RequirementInput, 'priority' | 'forceRefresh'>;

const activeBindings = new WeakMap<RxdbSyncEngine, Map<string, ActiveBinding>>();

/** Register only the declarative descriptor needed to reconstruct demand after an engine reset. */
export function registerActiveBinding(engine: RxdbSyncEngine, binding: ActiveBinding): () => void {
	let registry = activeBindings.get(engine);
	if (!registry) {
		registry = new Map();
		activeBindings.set(engine, registry);
	}
	registry.set(binding.id, binding);
	return () => {
		if (registry?.get(binding.id) === binding) registry.delete(binding.id);
	};
}

function requirementsForReset(
	engine: RxdbSyncEngine,
	collectionNames: string[]
): EngineRequirement[] {
	const wanted = new Set(collectionNames);
	const requirements: EngineRequirement[] = [];
	for (const binding of activeBindings.get(engine)?.values() ?? []) {
		if (!wanted.has(binding.collectionName)) continue;
		requirements.push(
			...requirementsForQuery({
				...binding,
				id: `${binding.id}:collection-reset`,
				priority: 1000,
				forceRefresh: true,
			})
		);
	}
	if (wanted.has('taxes')) {
		requirements.push({
			id: 'taxRates:collection-reset',
			collection: 'taxRates',
			kind: 'refresh',
			forceRefresh: true,
			priority: 1000,
		});
	}
	return requirements;
}

/** Capture the active binding descriptors before reset and return their one-shot refill. */
export function prepareCollectionResetRefill(
	engine: RxdbSyncEngine,
	collectionNames: string[]
): () => Promise<void> {
	const requirements = requirementsForReset(engine, collectionNames);
	const engineCollections = new Set<SyncCollectionName>(
		collectionNames
			.filter(isMappedCollection)
			.map((collectionName) => engineCollectionNameFor(collectionName))
	);
	const seedReferences = (['categories', 'brands', 'tags', 'coupons'] as const).some((collection) =>
		engineCollections.has(collection)
	);
	const seedProductBrowse = engineCollections.has('products');
	// Re-arm normal policy: product/variation browse seed and greedy references now;
	// customers resume on demand plus idle trickle from page 1 (not ticked while
	// active), and orders wait for view demand or their periodic window cadence.

	return async () => {
		if (seedReferences) await engine.sync('reference-seed');
		if (seedProductBrowse) await engine.sync('product-browse-window-seed');
		const handles = declareRequirements(engine, requirements);
		await Promise.all(handles.map((handle) => handle.ready.catch(() => undefined)));
		for (const handle of handles) handle.release();
		await engine.sync('scheduler-drain');
	};
}
