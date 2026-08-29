import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { Subject } from 'rxjs';

import {
	customerBrowseWindowQueryKeyFromDimensions,
	engineSyncCollectionCreators,
	memoryEngineStorage,
	orderBrowserQueryKey,
	productBrowseWindowQueryKeyFromDimensions,
} from '@wcpos/sync-engine/testing';
import type {
	CensusTotals,
	CoverageTarget,
	CoverageVerdict,
	EngineRequirement,
	EngineStatus,
	RequirementHandle,
	RxdbSyncEngine,
	SyncCollectionName,
} from '@wcpos/sync-engine';
import { GUEST_CUSTOMER_ID, remoteIdOrNull } from '@wcpos/sync-core';

import { searchPlugin } from './search';

import type { RxDatabase } from 'rxdb';

addRxPlugin(RxDBMigrationSchemaPlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(searchPlugin);

let sequence = 0;

/**
 * The engine data collections a fluent query reads through the adapter.
 * `orders`/`taxRates`/etc. are added on demand by the callers that need them.
 */
type DataCollection =
	| 'products'
	| 'variations'
	| 'orders'
	| 'customers'
	| 'taxRates'
	| 'categories'
	| 'tags'
	| 'brands'
	| 'coupons';

/**
 * A standalone RxDB database carrying the ENGINE schemas — the same recipe the
 * engine opens (via `engineSyncCollectionCreators`), validation off for raw test
 * speed. This is what `executeAdapterQuery` reads (`collection.database`).
 */
/** Re-exported so lane-identity tests can assert on the canonical key the engine builds. */
export { orderBrowserQueryKey };

export async function createEngineDatabase(
	collections: readonly DataCollection[] = ['products', 'variations', 'orders']
): Promise<RxDatabase> {
	const database = await createRxDatabase({
		name: `query-engine-${(sequence += 1)}`,
		storage: memoryEngineStorage({ validate: false }),
		multiInstance: false,
		allowSlowCount: true,
	});
	const creators = engineSyncCollectionCreators();
	const wanted = Object.fromEntries(
		collections
			.filter((name) => creators[name as keyof typeof creators])
			.map((name) => [name, creators[name as keyof typeof creators]])
	);
	await database.addCollections(wanted as never);
	(database as any).reset$ = new Subject();
	return database;
}

/**
 * A minimal fake of the engine's PUBLIC handle — only the verbs the query
 * Manager uses (`active`, `require`, `scope.resetCollection`, `sync`). Backed by
 * a real engine-schema database so the adapter reads land on real documents.
 * `require` calls are recorded for assertions.
 */
export interface FakeEngine extends RxdbSyncEngine {
	database: RxDatabase;
	requireCalls: EngineRequirement[];
	searchRequireCalls: RecordedSearchRequirement[];
	/** Ordered `require:<kind>` / `release:<kind>` log — for sequence assertions. */
	demandEvents: string[];
	searchFailure?: Error;
	/** Rejects kind:'refresh' handles while set — drives the demand retry path. */
	refreshFailure?: Error;
	/**
	 * Resolves kind:'refresh' handles with `action: 'released'` while set — models ANOTHER
	 * engine instance (another tab) owning the scheduler row, whose pull this tab's activity
	 * counters cannot see.
	 */
	refreshReleased?: boolean;
	resetCalls: string[];
	syncCalls: (string | undefined)[];
	/**
	 * Every target `coverageChanges` has been subscribed for. A binding that must NOT read
	 * coverage — an unrepresented selector, a search — is proved by this staying empty, which
	 * is stronger than watching for a `'coverage'` value that could simply be late.
	 */
	coverageSubscribeCalls: CoverageTarget[];
	/**
	 * Seed the engine's verdict for one target. Fields left out keep their unknown default, so
	 * a fixture states only what its scenario is about. Live subscribers are notified
	 * synchronously — the mid-flight "a lane just landed" flip.
	 */
	setCoverageVerdict(target: CoverageTarget, verdict: Partial<CoverageVerdict>): void;
	setCollectionStatus(
		collection: SyncCollectionName,
		state: Partial<EngineStatus['collections'][SyncCollectionName]>
	): void;
	/**
	 * How many times `censusChanges` has been subscribed. A binding that must NOT read the
	 * whole-collection census — anything filtered, searched or targeted — is proved by this
	 * staying 0, the same never-asked discipline `coverageSubscribeCalls` pins for coverage.
	 */
	censusSubscribeCount: number;
	/**
	 * Seed the engine's census total for one collection (null clears it). Live subscribers are
	 * notified synchronously.
	 */
	setCensusTotal(collection: SyncCollectionName, total: number | null): void;
}

export interface RecordedSearchRequirement {
	requirement: EngineRequirement;
	released: boolean;
}

const requirementQueryKey = (requirement: EngineRequirement): string | null => {
	if (requirement.kind === 'orders-browse') return orderBrowserQueryKey(requirement);
	if (requirement.kind === 'product-browse') {
		return productBrowseWindowQueryKeyFromDimensions(requirement);
	}
	if (requirement.kind === 'customer-browse') {
		return customerBrowseWindowQueryKeyFromDimensions(requirement);
	}
	if (requirement.kind === 'refresh') {
		const refreshLaneKeys: Partial<Record<SyncCollectionName, string>> = {
			taxRates: 'taxRates:all',
			categories: 'categories:all',
			brands: 'brands:all',
			tags: 'tags:all',
			coupons: 'coupons:all',
		};
		return refreshLaneKeys[requirement.collection] ?? null;
	}
	return null;
};

/**
 * The engine keys a verdict by (collection, queryKey) — or by (collection, reference lane) when
 * it resolves the key itself. The fake keys its seeded verdicts the same way, so a fixture that
 * seeds `{lane:'reference'}` proves the binding took the reference arm rather than spelling out
 * a lane key of its own.
 */
const coverageTargetKey = (target: CoverageTarget): string =>
	'queryKey' in target
		? `${target.collection}::${target.queryKey}`
		: `${target.collection}::@reference`;

const UNKNOWN_COVERAGE_VERDICT: CoverageVerdict = {
	total: null,
	source: 'unknown',
	complete: false,
	fresh: false,
	progress: null,
};

const num = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/**
 * Build an ENGINE-shaped product document (id=uuid primary, woo id + promoted
 * columns, raw Woo body under `payload`) from legacy-ish fields. Everything a
 * fluent query might select/sort on has a promoted column or a payload path per
 * the engine-adapter collection map.
 */
export function engineProduct(input: {
	uuid: string;
	id?: number;
	name?: string;
	price?: string;
	stock_status?: string;
	type?: string;
	categories?: { id: number; name?: string }[];
	brands?: { id: number; name?: string }[];
	tags?: { id: number; name?: string }[];
	sku?: string;
	barcode?: string;
	on_sale?: boolean;
	featured?: boolean;
	stock_quantity?: number | null;
	attributes?: unknown[];
	meta_data?: unknown[];
	[key: string]: unknown;
}): Record<string, unknown> {
	const { uuid, id, name, price, stock_status, type, categories, brands, tags, ...rest } = input;
	const wooId = id ?? 0;
	return {
		uuid,
		remoteId: remoteIdOrNull(wooId),
		price: num(price),
		stockStatus: stock_status ?? 'instock',
		type: type ?? 'simple',
		categoryIds: (categories ?? []).map((c) => c.id),
		brandIds: (brands ?? []).map((b) => b.id),
		onSale: input.on_sale ?? false,
		featured: input.featured ?? false,
		stockQuantity: input.stock_quantity ?? null,
		payload: {
			id: wooId,
			name: name ?? '',
			price: price ?? '',
			stock_status: stock_status ?? 'instock',
			type: type ?? 'simple',
			categories: categories ?? [],
			brands: brands ?? [],
			tags: tags ?? [],
			...rest,
		},
		sync: { revision: '1', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

/** Build an ENGINE-shaped order document. */
export function engineOrder(input: {
	uuid: string;
	id?: number;
	number?: string;
	status?: string;
	date_created_gmt?: string;
	total?: string;
	customer_id?: number;
	[key: string]: unknown;
}): Record<string, unknown> {
	const { uuid, id, number, status, date_created_gmt, total, customer_id, ...rest } = input;
	const wooId = id ?? 0;
	return {
		uuid,
		remoteId: remoteIdOrNull(wooId),
		number: number ?? String(wooId),
		dateCreatedGmt: date_created_gmt ?? '2026-01-01T00:00:00',
		status: status ?? 'processing',
		total: total ?? '0',
		customerId: customer_id ?? GUEST_CUSTOMER_ID,
		payload: {
			id: wooId,
			number: number ?? String(wooId),
			status: status ?? 'processing',
			date_created_gmt: date_created_gmt ?? '2026-01-01T00:00:00',
			total: total ?? '0',
			customer_id: customer_id ?? GUEST_CUSTOMER_ID,
			...rest,
		},
		sync: { revision: '1', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

/** Build an ENGINE-shaped variation document. */
export function engineVariation(input: {
	uuid: string;
	id?: number;
	parent_id?: number;
	name?: string;
	sku?: string;
	price?: string;
	stock_status?: string;
	stock_quantity?: number | null;
	attributes?: { id?: number; name: string; option: string }[];
	[key: string]: unknown;
}): Record<string, unknown> {
	const { uuid, id, parent_id, name, sku, price, stock_status, attributes, ...rest } = input;
	return {
		uuid,
		remoteId: remoteIdOrNull(id),
		parentRemoteId: remoteIdOrNull(parent_id),
		price: num(price),
		stockStatus: stock_status ?? 'instock',
		stockQuantity: input.stock_quantity ?? null,
		attributes: attributes ?? [],
		payload: {
			id: id ?? 0,
			parent_id: parent_id ?? 0,
			name: name ?? '',
			sku: sku ?? '',
			price: price ?? '',
			stock_status: stock_status ?? 'instock',
			attributes: attributes ?? [],
			...rest,
		},
		sync: { revision: '1', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

export function createFakeEngine(database: RxDatabase): FakeEngine {
	const requireCalls: EngineRequirement[] = [];
	/**
	 * Ordered require/release log. Some invariants are about SEQUENCE, not
	 * state: "the predecessor is not released until the successor is declared"
	 * cannot be expressed with a released flag, because the predecessor is
	 * released either way — the question is when (monorepo#1614).
	 */
	const demandEvents: string[] = [];
	const searchRequireCalls: RecordedSearchRequirement[] = [];
	const resetCalls: string[] = [];
	const syncCalls: (string | undefined)[] = [];
	const coverageSubscribeCalls: CoverageTarget[] = [];
	const coverageVerdicts = new Map<string, CoverageVerdict>();
	const coverageListeners = new Map<string, Set<(verdict: CoverageVerdict) => void>>();
	const setCoverageVerdict = (target: CoverageTarget, verdict: Partial<CoverageVerdict>) => {
		const key = coverageTargetKey(target);
		const next = { ...UNKNOWN_COVERAGE_VERDICT, ...verdict };
		coverageVerdicts.set(key, next);
		for (const listener of [...(coverageListeners.get(key) ?? [])]) listener(next);
	};
	let censusSubscribeCount = 0;
	let censusTotals = {} as CensusTotals;
	const censusListeners = new Set<(totals: CensusTotals) => void>();
	const setCensusTotal = (collection: SyncCollectionName, total: number | null) => {
		censusTotals = {
			...censusTotals,
			[collection]:
				total === null
					? null
					: { total, updatedAtMs: 0, freshUntilMs: Number.MAX_SAFE_INTEGER, fresh: true },
		};
		for (const listener of [...censusListeners]) listener(censusTotals);
	};
	const collectionNames: SyncCollectionName[] = [
		'orders',
		'products',
		'variations',
		'customers',
		'taxRates',
		'categories',
		'brands',
		'tags',
		'coupons',
	];
	const activityCounts = new Map<SyncCollectionName, number>();
	let collections = Object.fromEntries(
		collectionNames.map((collection) => [collection, { active: false, coverageGeneration: 0 }])
	) as EngineStatus['collections'];
	const statusListeners = new Set<(status: EngineStatus) => void>();
	const status = (): EngineStatus => ({ collections }) as EngineStatus;
	const setCollectionStatus = (
		collection: SyncCollectionName,
		state: Partial<EngineStatus['collections'][SyncCollectionName]>
	) => {
		collections = {
			...collections,
			[collection]: { ...collections[collection], ...state },
		};
		for (const listener of statusListeners) listener(status());
	};
	const changeActivity = (collection: SyncCollectionName, delta: 1 | -1) => {
		const count = Math.max(0, (activityCounts.get(collection) ?? 0) + delta);
		activityCounts.set(collection, count);
		setCollectionStatus(collection, { active: count > 0 });
	};
	const activeScope = {
		identity: { site: 'https://test', storeId: '1', cashierId: '1' },
		scopeId: 'test-scope',
		database,
	};

	const engine = {
		database,
		requireCalls,
		searchRequireCalls,
		demandEvents,
		resetCalls,
		syncCalls,
		coverageSubscribeCalls,
		setCoverageVerdict,
		ready: Promise.resolve(),
		active: () => activeScope,
		whenActive: async () => activeScope,
		db$: () => () => undefined,
		scope: {
			switch: async () => activeScope,
			resetCollection: async (name: string) => {
				resetCalls.push(name);
				const collection = (database as any).collections[name];
				if (collection) {
					const docs = await collection.find().exec();
					await collection.bulkRemove(docs.map((doc: any) => doc.primary));
				}
				if (collectionNames.includes(name as SyncCollectionName)) {
					const engineName = name as SyncCollectionName;
					setCollectionStatus(engineName, {
						coverageGeneration: collections[engineName].coverageGeneration + 1,
					});
				}
				return 'reset' as const;
			},
		},
		require: (requirement: EngineRequirement): RequirementHandle => {
			requireCalls.push(requirement);
			demandEvents.push(`require:${requirement.kind}`);
			changeActivity(requirement.collection, 1);
			const recordedSearch =
				requirement.kind === 'search' ? { requirement, released: false } : undefined;
			if (recordedSearch) {
				searchRequireCalls.push(recordedSearch);
			}
			const ready =
				requirement.kind === 'search' && engine.searchFailure
					? Promise.reject(engine.searchFailure)
					: requirement.kind === 'refresh' && engine.refreshFailure
						? Promise.reject(engine.refreshFailure)
						: requirement.kind === 'refresh' && engine.refreshReleased
							? Promise.resolve({
									action: 'released' as const,
									missingRecordIds: [],
									reason: 'fake: another owner holds the scheduler row',
								})
							: Promise.resolve({
									action: 'serve-local' as const,
									missingRecordIds: [],
									reason: 'fake',
								});
			void ready.then(
				() => changeActivity(requirement.collection, -1),
				() => changeActivity(requirement.collection, -1)
			);
			return {
				ready,
				release: () => {
					demandEvents.push(`release:${requirement.kind}`);
					if (recordedSearch) {
						recordedSearch.released = true;
					}
				},
				queryKey: requirementQueryKey(requirement),
			};
		},
		sync: async (lane?: string) => {
			syncCalls.push(lane);
			return { lane: (lane ?? 'all') as never, status: 'ran' as const };
		},
		events: () => () => undefined,
		get censusSubscribeCount() {
			return censusSubscribeCount;
		},
		setCensusTotal,
		censusChanges: (cb: (totals: CensusTotals) => void) => {
			censusSubscribeCount += 1;
			censusListeners.add(cb);
			cb(censusTotals);
			return () => {
				censusListeners.delete(cb);
			};
		},
		coverageChanges: (target: CoverageTarget, cb: (verdict: CoverageVerdict) => void) => {
			const key = coverageTargetKey(target);
			coverageSubscribeCalls.push(target);
			const listeners = coverageListeners.get(key) ?? new Set<(verdict: CoverageVerdict) => void>();
			coverageListeners.set(key, listeners);
			listeners.add(cb);
			// The real door publishes synchronously on subscribe.
			cb(coverageVerdicts.get(key) ?? UNKNOWN_COVERAGE_VERDICT);
			return () => {
				listeners.delete(cb);
			};
		},
		setCollectionStatus,
		onScopeEvent: () => () => undefined,
		status,
		statusChanges: (listener: (next: EngineStatus) => void) => {
			statusListeners.add(listener);
			listener(status());
			return () => {
				statusListeners.delete(listener);
			};
		},
		stats: () => ({}) as never,
		write: async () => ({ mutationId: 'm', recordId: 'r' }),
		conflicts: async () => [],
		resolveConflict: async () => undefined,
		dispose: async () => undefined,
	} as unknown as FakeEngine;

	return engine;
}

export interface PendingFakeEngine {
	engine: FakeEngine;
	/**
	 * Resolve the engine's initial open: `active()` starts returning the scope and
	 * `ready` resolves — the production transition after `switchScope` settles.
	 */
	open(): void;
}

/**
 * A fake engine that models the REAL app's cold start: the RxDB database opens
 * asynchronously, so `active()` returns `null` and `ready` is pending until the
 * initial scope switch settles. Bootstrap/lane fetches (the E2E versioned sync
 * 404s) are async and non-fatal — modelled here by a `require()` handle that
 * rejects. The query surface must DEGRADE (constructible queries, empty results)
 * across this window, then go live once `open()` is called.
 */
export function createPendingFakeEngine(database: RxDatabase): PendingFakeEngine {
	const requireCalls: EngineRequirement[] = [];
	const resetCalls: string[] = [];
	const syncCalls: (string | undefined)[] = [];
	const collections = Object.fromEntries(
		(
			[
				'orders',
				'products',
				'variations',
				'customers',
				'taxRates',
				'categories',
				'brands',
				'tags',
				'coupons',
			] as SyncCollectionName[]
		).map((collection) => [collection, { active: false, coverageGeneration: 0 }])
	) as EngineStatus['collections'];
	const status = (): EngineStatus => ({ collections }) as EngineStatus;
	const activeScope = {
		identity: { site: 'https://test', storeId: '1', cashierId: '1' },
		scopeId: 'test-scope',
		database,
	};

	let opened = false;
	let resolveReady!: () => void;
	const ready = new Promise<void>((resolve) => {
		resolveReady = resolve;
	});

	const engine = {
		database,
		requireCalls,
		resetCalls,
		syncCalls,
		ready,
		active: () => (opened ? activeScope : null),
		// Mirrors the real engine: wait out the boot barrier, then re-read —
		// never resolve with a scope carried by `ready`.
		whenActive: async () => {
			await ready;
			if (!opened) throw new Error('No active store scope');
			return activeScope;
		},
		db$: () => () => undefined,
		scope: {
			switch: async () => activeScope,
			resetCollection: async (name: string) => {
				resetCalls.push(name);
				return 'reset' as const;
			},
		},
		require: (requirement: EngineRequirement): RequirementHandle => {
			requireCalls.push(requirement);
			// A bootstrap/lane fetch that 404s (server surface absent) — rejected,
			// never fatal.
			return {
				ready: Promise.reject(new Error('404: sync endpoint not found')),
				release: () => undefined,
				queryKey: requirementQueryKey(requirement),
			};
		},
		sync: async (lane?: string) => {
			syncCalls.push(lane);
			return { lane: (lane ?? 'all') as never, status: 'ran' as const };
		},
		events: () => () => undefined,
		// A cold engine vouches for nothing — the degraded window this fake exists to model.
		coverageChanges: (_target: CoverageTarget, cb: (verdict: CoverageVerdict) => void) => {
			cb(UNKNOWN_COVERAGE_VERDICT);
			return () => undefined;
		},
		censusChanges: (cb: (totals: CensusTotals) => void) => {
			cb({} as CensusTotals);
			return () => undefined;
		},
		setCensusTotal: () => undefined,
		censusSubscribeCount: 0,
		setCollectionStatus: () => undefined,
		onScopeEvent: () => () => undefined,
		status,
		statusChanges: (listener: (next: EngineStatus) => void) => {
			listener(status());
			return () => undefined;
		},
		stats: () => ({}) as never,
		write: async () => ({ mutationId: 'm', recordId: 'r' }),
		conflicts: async () => [],
		resolveConflict: async () => undefined,
		dispose: async () => undefined,
	} as unknown as FakeEngine;

	return {
		engine,
		open: () => {
			opened = true;
			resolveReady();
		},
	};
}
