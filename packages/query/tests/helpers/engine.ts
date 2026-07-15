import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { Subject } from 'rxjs';

import { engineSyncCollectionCreators, memoryEngineStorage } from '@wcpos/sync-engine/testing';
import type {
	EngineEvent,
	EngineRequirement,
	RequirementHandle,
	RxdbSyncEngine,
} from '@wcpos/sync-engine';

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
	searchFailure?: Error;
	resetCalls: string[];
	syncCalls: (string | undefined)[];
	emit(event: EngineEvent): void;
	eventListenerCount(): number;
}

export interface RecordedSearchRequirement {
	requirement: EngineRequirement;
	released: boolean;
}

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
		id: uuid,
		wooProductId: wooId,
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
		id: uuid,
		wooId: id ?? 0,
		parentId: parent_id ?? 0,
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
	const searchRequireCalls: RecordedSearchRequirement[] = [];
	const resetCalls: string[] = [];
	const syncCalls: (string | undefined)[] = [];
	const eventListeners = new Set<(event: EngineEvent) => void>();
	const activeScope = {
		identity: { site: 'https://test', storeId: '1', cashierId: '1' },
		scopeId: 'test-scope',
		database,
	};

	const engine = {
		database,
		requireCalls,
		searchRequireCalls,
		resetCalls,
		syncCalls,
		ready: Promise.resolve(activeScope),
		active: () => activeScope,
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
				return 'reset' as const;
			},
		},
		require: (requirement: EngineRequirement): RequirementHandle => {
			requireCalls.push(requirement);
			const recordedSearch =
				requirement.kind === 'search' ? { requirement, released: false } : undefined;
			if (recordedSearch) {
				searchRequireCalls.push(recordedSearch);
			}
			return {
				ready:
					requirement.kind === 'search' && engine.searchFailure
						? Promise.reject(engine.searchFailure)
						: Promise.resolve({
								action: 'serve-local' as const,
								missingRecordIds: [],
								reason: 'fake',
							}),
				release: () => {
					if (recordedSearch) {
						recordedSearch.released = true;
					}
				},
			};
		},
		sync: async (lane?: string) => {
			syncCalls.push(lane);
			return { lane: (lane ?? 'all') as never, status: 'ran' as const };
		},
		events: (listener: (event: EngineEvent) => void) => {
			eventListeners.add(listener);
			return () => eventListeners.delete(listener);
		},
		emit: (event: EngineEvent) => {
			for (const listener of eventListeners) listener(event);
		},
		eventListenerCount: () => eventListeners.size,
		onScopeEvent: () => () => undefined,
		status: () => ({}) as never,
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
	const activeScope = {
		identity: { site: 'https://test', storeId: '1', cashierId: '1' },
		scopeId: 'test-scope',
		database,
	};

	let opened = false;
	let resolveReady!: (scope: typeof activeScope) => void;
	const ready = new Promise<typeof activeScope>((resolve) => {
		resolveReady = resolve;
	});

	const engine = {
		database,
		requireCalls,
		resetCalls,
		syncCalls,
		ready,
		active: () => (opened ? activeScope : null),
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
			};
		},
		sync: async (lane?: string) => {
			syncCalls.push(lane);
			return { lane: (lane ?? 'all') as never, status: 'ran' as const };
		},
		events: () => () => undefined,
		onScopeEvent: () => () => undefined,
		status: () => ({}) as never,
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
			resolveReady(activeScope);
		},
	};
}
