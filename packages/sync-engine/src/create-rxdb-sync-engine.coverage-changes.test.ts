/**
 * `engine.coverageChanges` through the PUBLIC handle, against real (memory) storage.
 *
 * The verdict's rules are pinned without storage in local-coverage/coverage-verdicts.test.ts.
 * What this file pins is everything that only shows up once the rows are real: which key a
 * target resolves to, that the two tables are watched live, that a verdict is republished at
 * its own freshness deadline, and that a scope switch, a reset or a dispose can never leave a
 * subscriber holding a claim the engine no longer stands behind.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import {
	createRxdbSyncEngine,
	type RxdbSyncEngine,
	type RxdbSyncEnginePorts,
	type StoreScopeIdentity,
} from './create-rxdb-sync-engine';
import { queryKeyBelongsToCollection } from './local-coverage/coverage-verdicts';
import { coverageLaneKey } from './local-coverage/local-coverage';
import {
	customerBrowseWindowQueryKeyFromDimensions,
	laneKeyFor,
	orderBrowserQueryKey,
	productBrowseWindowQueryKeyFromDimensions,
} from './scheduler';
import { memoryEngineStorage } from './testing';

import type { CoverageTarget, CoverageVerdict } from './local-coverage/coverage-verdicts';

setPremiumFlag();

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

const SITE = 'https://lab.example.test';
let uniqueStore = 0;

function freshIdentity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 5, cashierId: `coverage-${uniqueStore}` };
}

function engineWith(
	overrides?: Partial<RxdbSyncEnginePorts>,
	identity = freshIdentity()
): RxdbSyncEngine {
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: `${SITE}/wp-json/wcpos/v2`, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			mode: 'manual',
			...overrides,
		},
		identity
	);
}

type LaneInput = {
	collection: string;
	queryKey: string;
	complete?: boolean;
	expectedRecordIds?: string[];
	freshUntilMs: number;
	rangedResume?: {
		beforeSeconds: number;
		excludeWooIds: number[];
		totalRecords: number | null;
		downloadedRecords?: number;
	};
};

type WritableCollection = {
	upsert(document: Record<string, unknown>): Promise<unknown>;
	findOne(id: string): { exec(): Promise<{ remove(): Promise<unknown> } | null> };
};

function collectionOf(engine: RxdbSyncEngine, name: string): WritableCollection {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	return scope.database.collections[name] as unknown as WritableCollection;
}

async function writeLane(engine: RxdbSyncEngine, input: LaneInput): Promise<void> {
	await collectionOf(engine, 'coverageLanes').upsert({
		laneKey: coverageLaneKey(input.collection, input.queryKey),
		collectionName: input.collection,
		queryKey: input.queryKey,
		complete: input.complete ?? true,
		expectedRecordIds: input.expectedRecordIds ?? ['a', 'b'],
		freshUntilMs: input.freshUntilMs,
		updatedAtMs: 1,
		...(input.rangedResume ? { rangedResume: input.rangedResume } : {}),
		schemaVersion: 3,
	});
}

async function writeQueryTotal(
	engine: RxdbSyncEngine,
	queryKey: string,
	totalMatchingRecords: number,
	freshUntilMs: number
): Promise<void> {
	await collectionOf(engine, 'queryTotalCacheEntries').upsert({
		queryKey,
		totalMatchingRecords,
		freshUntilMs,
		updatedAtMs: 1,
		schemaVersion: 1,
	});
}

function record(
	engine: RxdbSyncEngine,
	target: CoverageTarget
): { verdicts: CoverageVerdict[]; latest(): CoverageVerdict | undefined; stop(): void } {
	const verdicts: CoverageVerdict[] = [];
	const unsubscribe = engine.coverageChanges(target, (verdict) => verdicts.push(verdict));
	return { verdicts, latest: () => verdicts.at(-1), stop: unsubscribe };
}

const ORDERS_KEY = 'orders:browser:status=processing:orderby=date:order=desc:search=:limit=25';

describe('coverageChanges through the public handle', () => {
	it('publishes the unknown verdict synchronously while no scope is open yet', async () => {
		const engine = engineWith();
		// Before `ready`: the database is still opening, so there is nothing to vouch with.
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });

		expect(orders.verdicts).toHaveLength(1);
		expect(orders.verdicts[0]).toEqual({
			total: null,
			source: 'unknown',
			complete: false,
			fresh: false,
			progress: null,
		});

		orders.stop();
		await engine.ready;
		await engine.dispose();
	});

	it('follows the lane and query-total rows behind one key, in precedence order', async () => {
		const engine = engineWith({ now: () => 1_000_000 });
		await engine.ready;
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });

		await writeLane(engine, {
			collection: 'orders',
			queryKey: ORDERS_KEY,
			expectedRecordIds: ['o1', 'o2', 'o3'],
			freshUntilMs: 1_060_000,
		});
		await vi.waitFor(() => expect(orders.latest()?.source).toBe('lane'));
		expect(orders.latest()).toMatchObject({ total: 3, complete: true, fresh: true });

		// A fresh cached total outranks the lane: it is the SERVER's answer for the same key.
		await writeQueryTotal(engine, ORDERS_KEY, 4_200, 1_060_000);
		await vi.waitFor(() => expect(orders.latest()?.source).toBe('query-total'));
		expect(orders.latest()).toMatchObject({ total: 4_200, complete: true });

		orders.stop();
		await engine.dispose();
	});

	it('never lets an incomplete lane stand in for a total', async () => {
		const engine = engineWith({ now: () => 1_000_000 });
		await engine.ready;
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });

		await writeLane(engine, {
			collection: 'orders',
			queryKey: ORDERS_KEY,
			complete: false,
			expectedRecordIds: ['o1', 'o2'],
			freshUntilMs: 1_060_000,
			rangedResume: { beforeSeconds: 1_783_000_000, excludeWooIds: [7], totalRecords: 30_000 },
		});

		await vi.waitFor(() => expect(orders.latest()?.progress).not.toBeNull());
		// Progress without a total: the window is deliberately partial, and the id count is the
		// fallback the pre-per-page-publish lanes leave behind (#954).
		expect(orders.latest()).toMatchObject({
			total: null,
			source: 'unknown',
			complete: false,
			fresh: true,
			progress: { downloaded: 2, total: 30_000 },
		});

		await writeLane(engine, {
			collection: 'orders',
			queryKey: ORDERS_KEY,
			complete: false,
			expectedRecordIds: ['o1', 'o2'],
			freshUntilMs: 1_060_000,
			rangedResume: {
				beforeSeconds: 1_782_000_000,
				excludeWooIds: [],
				totalRecords: 30_000,
				downloadedRecords: 900,
			},
		});
		await vi.waitFor(() =>
			expect(orders.latest()?.progress).toEqual({ downloaded: 900, total: 30_000 })
		);

		orders.stop();
		await engine.dispose();
	});

	// Nothing writes a row at freshUntilMs, so without a timer a subscriber would keep a
	// `fresh: true` verdict for ever. Expiry demotes the lane to the stale tier — the count
	// survives as the last known answer, but `fresh` must flip at the deadline it reported.
	it('republishes at the freshness deadline it just reported', async () => {
		let now = 1_000_000;
		const engine = engineWith({ now: () => now });
		await engine.ready;
		await writeLane(engine, {
			collection: 'orders',
			queryKey: ORDERS_KEY,
			expectedRecordIds: ['o1', 'o2'],
			freshUntilMs: 1_000_500,
		});
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });
		await vi.waitFor(() => expect(orders.latest()?.fresh).toBe(true));

		now = 1_000_501;
		await vi.waitFor(() => expect(orders.latest()?.fresh).toBe(false), { timeout: 2_000 });
		expect(orders.latest()).toMatchObject({ total: 2, source: 'lane', fresh: false });

		orders.stop();
		await engine.dispose();
	});

	// The caller has no handle to carry a boot lane's key and must not invent one — the engine
	// resolves its own (rx-pos-bootstrap-seeder's laneKeyFor).
	it('resolves the reference arm to the collection own lane key', async () => {
		const engine = engineWith({ now: () => 1_000_000 });
		await engine.ready;
		for (const collection of ['taxRates', 'coupons'] as const) {
			const queryKey = laneKeyFor(collection);
			if (queryKey === null) throw new Error(`no reference lane for ${collection}`);
			await writeLane(engine, {
				collection,
				queryKey,
				expectedRecordIds: ['r1', 'r2', 'r3'],
				freshUntilMs: 1_060_000,
			});
			const reference = record(engine, { collection, lane: 'reference' });
			await vi.waitFor(() => expect(reference.latest()?.source).toBe('lane'));
			expect(reference.latest()?.total).toBe(3);
			reference.stop();
		}
		await engine.dispose();
	});

	// The lane primary key is `${collection}::${queryKey}`, so a same-named key in another
	// collection is a different lane — the target's collection is a guard, not decoration.
	it('does not read another collection lane that shares the query key', async () => {
		const engine = engineWith({ now: () => 1_000_000 });
		await engine.ready;
		await writeLane(engine, {
			collection: 'products',
			queryKey: ORDERS_KEY,
			expectedRecordIds: ['p1', 'p2'],
			freshUntilMs: 1_060_000,
		});
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(orders.latest()?.source).toBe('unknown');

		orders.stop();
		await engine.dispose();
	});

	// The query-total table has NO collection column — it is keyed by queryKey alone — so a
	// target of another collection reading it by key would adopt a server count for a query it
	// is not showing. The key's namespace is the guard.
	it('does not adopt a query-total cached under another collection key namespace', async () => {
		const engine = engineWith({ now: () => 1_000_000 });
		await engine.ready;
		await writeQueryTotal(engine, ORDERS_KEY, 4_200, 1_060_000);
		const products = record(engine, { collection: 'products', queryKey: ORDERS_KEY });
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });

		// Same row, same key, two collections: only the one that owns the namespace may read it.
		await vi.waitFor(() => expect(orders.latest()?.source).toBe('query-total'));
		expect(orders.latest()?.total).toBe(4_200);
		expect(products.latest()).toMatchObject({ total: null, source: 'unknown' });

		products.stop();
		orders.stop();
		await engine.dispose();
	});

	/**
	 * The tripwire under that guard. `queryKeyBelongsToCollection` is a prefix test, and it is
	 * only sound while every key the engine mints is `${collection}:…`. A future key that breaks
	 * the convention would otherwise silently drop a footer back to its resident count, so the
	 * REAL builders are asserted here rather than the convention being left as a comment.
	 */
	it('mints every query key inside its own collection namespace', () => {
		const keys: [string, string][] = [
			['orders', orderBrowserQueryKey({ status: 'processing', limit: 25 })],
			['products', productBrowseWindowQueryKeyFromDimensions({ limit: 100 })],
			['customers', customerBrowseWindowQueryKeyFromDimensions({ limit: 100 })],
		];
		for (const collection of ['taxRates', 'categories', 'brands', 'tags', 'coupons'] as const) {
			const queryKey = laneKeyFor(collection);
			if (queryKey === null) throw new Error(`no reference lane for ${collection}`);
			keys.push([collection, queryKey]);
		}
		for (const [collection, queryKey] of keys) {
			expect(queryKeyBelongsToCollection(collection, queryKey)).toBe(true);
			// And nothing else claims it.
			expect(queryKeyBelongsToCollection('orders', 'products:browse-window:limit=100')).toBe(false);
		}
	});

	// A reset bulk-removes the collection's lanes and re-emits the SAME database object with
	// its collections replaced — captured references go stale, so the verdict must be
	// re-resolved rather than left reporting rows that no longer exist.
	it('drops back to unknown when a reset removes the lane', async () => {
		const engine = engineWith({ now: () => 1_000_000 });
		await engine.ready;
		await writeLane(engine, {
			collection: 'orders',
			queryKey: ORDERS_KEY,
			expectedRecordIds: ['o1', 'o2'],
			freshUntilMs: 1_060_000,
		});
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });
		await vi.waitFor(() => expect(orders.latest()?.source).toBe('lane'));

		await engine.scope.resetCollection('orders');

		await vi.waitFor(() => expect(orders.latest()?.source).toBe('unknown'));
		expect(orders.latest()?.total).toBeNull();

		orders.stop();
		await engine.dispose();
	});

	it('re-resolves against the database of the scope it switched to', async () => {
		const first = freshIdentity();
		const engine = engineWith({ now: () => 1_000_000 }, first);
		await engine.ready;
		await writeLane(engine, {
			collection: 'orders',
			queryKey: ORDERS_KEY,
			expectedRecordIds: ['o1', 'o2', 'o3', 'o4'],
			freshUntilMs: 1_060_000,
		});
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });
		await vi.waitFor(() => expect(orders.latest()?.total).toBe(4));

		// Another store's coverage is not this store's coverage.
		await engine.scope.switch(freshIdentity());
		await vi.waitFor(() => expect(orders.latest()?.source).toBe('unknown'));

		await engine.scope.switch(first);
		await vi.waitFor(() => expect(orders.latest()?.total).toBe(4));

		orders.stop();
		await engine.dispose();
	});

	it('stops publishing to a subscriber that unsubscribed', async () => {
		const engine = engineWith({ now: () => 1_000_000 });
		await engine.ready;
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });
		orders.stop();
		const seen = orders.verdicts.length;

		await writeLane(engine, {
			collection: 'orders',
			queryKey: ORDERS_KEY,
			freshUntilMs: 1_060_000,
		});
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(orders.verdicts).toHaveLength(seen);
		await engine.dispose();
	});

	it('is inert after dispose, and refuses new subscriptions', async () => {
		const engine = engineWith({ now: () => 1_000_000 });
		await engine.ready;
		await writeLane(engine, {
			collection: 'orders',
			queryKey: ORDERS_KEY,
			// Short enough that an un-cleared expiry timer would fire during this test.
			freshUntilMs: 1_000_050,
		});
		const orders = record(engine, { collection: 'orders', queryKey: ORDERS_KEY });
		await vi.waitFor(() => expect(orders.latest()?.source).toBe('lane'));

		await engine.dispose();
		const seen = orders.verdicts.length;
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(orders.verdicts).toHaveLength(seen);
		expect(() =>
			engine.coverageChanges({ collection: 'orders', queryKey: ORDERS_KEY }, () => undefined)
		).toThrow();
	});

	it('reports a throwing listener as a listener error rather than breaking the engine', async () => {
		const diagnostics = vi.fn();
		const engine = engineWith({ diagnostics, now: () => 1_000_000 });
		await engine.ready;

		const unsubscribe = engine.coverageChanges(
			{ collection: 'orders', queryKey: ORDERS_KEY },
			() => {
				throw new Error('listener blew up');
			}
		);

		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'engine.listener-error', level: 'error' })
		);
		unsubscribe();
		await engine.dispose();
	});
});
