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
 *  - **the products browse window** (UNFILTERED products browse — ADR 0027 §2, #909) →
 *    `engine.require({collection: 'products', kind: 'query', queryKey})` with the
 *    `products:browse-window:limit=…[:orderby=…:order=…]` descriptor. It carries the
 *    grid's own limit and sort, so infinite scroll fetches the next window and a sort
 *    change re-seeds a server-sorted one.
 *
 * FILTERED browse over products, and unbounded browse over every other collection,
 * creates NO remote demand (local residents only) — that is the accepted ADR 0027
 * design, not a gap. The
 * `greedy`/`endpoint` keys no longer create remote work; they are accepted and
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

function orderBrowseDescriptor(
	selector: Record<string, unknown> | undefined,
	limit: number | undefined,
	sort: readonly RequirementSortPart[] | undefined
): string {
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
	const metaValue = (key: '_pos_user' | '_pos_store'): string | undefined => {
		const conditions = [selector, ...(Array.isArray(selector?.$and) ? selector.$and : [])];
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
	const createdViaValue = selector?.created_via;
	const createdVia =
		typeof createdViaValue === 'string'
			? createdViaValue
			: createdViaValue !== null && typeof createdViaValue === 'object'
				? (createdViaValue as Record<string, unknown>).$eq
				: undefined;
	const store =
		typeof metaStore === 'string' && /^\d+$/.test(metaStore)
			? metaStore
			: typeof createdVia === 'string' && /^[a-z0-9_-]+$/.test(createdVia)
				? createdVia
				: undefined;
	const storePart = store === undefined ? '' : `:store=${store}`;
	const range = selector?.date_created_gmt as Record<string, unknown> | null | undefined;
	const epochSeconds = (value: unknown): number | undefined => {
		if (typeof value !== 'string') return undefined;
		// `YYYY-MM-DD` is already UTC-anchored by the Date Time String Format; `YYYY-MM-DDZ`
		// is NOT a production of that format, so appending `Z` would drop it into each
		// engine's implementation-defined fallback (this app runs on Hermes and JSC as well
		// as V8). Only a time-of-day with no offset needs the explicit UTC designator — the
		// shape `convertLocalDateToUTCString` emits (`yyyy-MM-dd'T'HH:mm:ss`).
		const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
		const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
		const normalized = dateOnly || hasTimezone ? value : `${value}Z`;
		const milliseconds = Date.parse(normalized);
		if (!Number.isFinite(milliseconds) || milliseconds < 0) return undefined;
		return Math.floor(milliseconds / 1_000);
	};
	const afterSeconds = range && typeof range === 'object' ? epochSeconds(range.$gte) : undefined;
	const beforeSeconds = range && typeof range === 'object' ? epochSeconds(range.$lte) : undefined;
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
	if (rangePart && typeof limit === 'number' && limit >= ORDER_COMPLETE_REQUEST_LIMIT) {
		return `orders:browser:status=${statusValue}${dimensionParts}:search=${searchValue}:limit=all`;
	}
	const boundedLimit = Math.min(
		Math.max(1, typeof limit === 'number' && Number.isFinite(limit) ? limit : 10),
		ORDER_BROWSE_MAX_LIMIT
	);
	return `orders:browser:status=${statusValue}${dimensionParts}:search=${searchValue}:limit=${boundedLimit}`;
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
	limit: number | undefined,
	sort: readonly RequirementSortPart[] | undefined
): string {
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
	if (
		orderby === undefined ||
		(orderby === PRODUCT_BROWSE_DEFAULT_ORDERBY && order === PRODUCT_BROWSE_DEFAULT_ORDER)
	) {
		return base;
	}
	return `${base}:orderby=${orderby}:order=${order}`;
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
		const queryKey = orderBrowseDescriptor(selector, limit, input.sort);
		const priority =
			input.priority ??
			(queryKey.includes(':customer=') ||
			queryKey.includes(':cashier=') ||
			queryKey.includes(':store=') ||
			queryKey.includes(':after=') ||
			queryKey.includes(':before=') ||
			queryKey.endsWith(':limit=all')
				? 700
				: undefined);
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

	// UNFILTERED products browse → the browse window (ADR 0027 §2, #909). The window
	// carries the grid's own limit and sort, so scrolling past the cold seed fetches the
	// next rows and a sort change re-seeds a SERVER-sorted window instead of locally
	// re-sorting the wrong slice of the catalog. Filtered browses are untouched: they
	// still ride local residents only.
	if (engineCollection === 'products' && Object.keys(selector ?? {}).length === 0) {
		return [
			{
				id: `${input.id}:products-browse-window`,
				collection: 'products',
				kind: 'query',
				queryKey: productBrowseWindowDescriptor(limit, input.sort),
				...(input.priority !== undefined ? { priority: input.priority } : {}),
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
