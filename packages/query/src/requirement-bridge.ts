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
 *    `orders:browser:status=…:search=…:limit=…` descriptor the engine parses.
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
	limit: number | undefined
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
	const range = selector?.date_created_gmt as Record<string, unknown> | null | undefined;
	const epochSeconds = (value: unknown): number | undefined => {
		if (typeof value !== 'string') return undefined;
		const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
		const milliseconds = Date.parse(normalized);
		if (!Number.isFinite(milliseconds) || milliseconds < 0) return undefined;
		return Math.floor(milliseconds / 1_000);
	};
	const afterSeconds = range && typeof range === 'object' ? epochSeconds(range.$gte) : undefined;
	const beforeSeconds = range && typeof range === 'object' ? epochSeconds(range.$lte) : undefined;
	const rangePart = `${afterSeconds === undefined ? '' : `:after=${afterSeconds}`}${
		beforeSeconds === undefined ? '' : `:before=${beforeSeconds}`
	}`;
	// Range dimensions precede `:search=` so arbitrary search text can never be read back
	// as a date bound — see the grammar note in order-browser-scheduler-descriptor.ts.
	if (rangePart && typeof limit === 'number' && limit > ORDER_BROWSE_MAX_LIMIT) {
		return `orders:browser:status=${statusValue}${rangePart}:search=${searchValue}:limit=all`;
	}
	const boundedLimit = Math.min(
		Math.max(1, typeof limit === 'number' && Number.isFinite(limit) ? limit : 10),
		ORDER_BROWSE_MAX_LIMIT
	);
	return `orders:browser:status=${statusValue}${rangePart}:search=${searchValue}:limit=${boundedLimit}`;
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
	/** The query's sort, primary part first. Only the products browse window reads it. */
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
		const queryKey = orderBrowseDescriptor(selector, limit);
		const priority = input.priority ?? (queryKey.endsWith(':limit=all') ? 700 : undefined);
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
