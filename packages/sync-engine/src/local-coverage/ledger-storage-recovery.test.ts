// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, newRxError, overwritable, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import type { SyncEvent } from '@wcpos/sync-core';

import * as engineCollections from '../collections/engine-collections';
import { engineCollectionCreators } from '../collections/engine-collections';
import { RxQueryTotalCacheRepository } from '../collections/rx-query-total-cache-repository';
import { runEngineSchedulerDrain } from '../scheduler/engine-scheduler-drain';
import {
	PRODUCT_BROWSE_WINDOW_GRAMMAR,
	PRODUCT_BROWSE_WINDOW_LIMIT,
	PRODUCT_BROWSE_WINDOW_ORDER,
	PRODUCT_BROWSE_WINDOW_ORDERBY,
	type ProductBrowseWindowDescriptor,
} from '../scheduler/product-browse-window-descriptor';
import { schedulerTaskStateKey } from '../scheduler/scheduler-task-state-schema';
import { createLocalCoverage } from './local-coverage';
import {
	classifyLedgerRecoveryError,
	registerLedgerRecovery,
	withLedgerRecovery,
	withSchedulerDrainLedgerRecovery,
	withSchedulerSeedLedgerRecovery,
} from './ledger-storage-recovery';

import type { FetchTask } from '../scheduler/replication-policy';

// The full engine recipe is past the open-core collection cap; the drain tick test
// opens all of it (ADR 0018 — premium stays host-side, and this harness is the host).
setPremiumFlag();
addRxPlugin(RxDBMigrationSchemaPlugin);

describe('classifyLedgerRecoveryError', () => {
	it('routes closed collections to re-attach', () => {
		expect(
			classifyLedgerRecoveryError(newRxError('COL21', { collection: 'coverageRecords' }))
		).toEqual({ kind: 'reattach', reason: 'COL21' });
		expect(classifyLedgerRecoveryError(new Error('unrelated'))).toBeUndefined();
	});
});

const LEDGER_COLLECTIONS = [
	'coverageRecords',
	'coverageLanes',
	'schedulerTaskStates',
	'queryTotalRequestStates',
	'queryTotalCacheEntries',
] as const;

let databaseSequence = 0;
let openDatabase: RxDatabase | undefined;
let peerDatabase: RxDatabase | undefined;

afterEach(async () => {
	vi.restoreAllMocks();
	await peerDatabase?.close();
	peerDatabase = undefined;
	await openDatabase?.close();
	openDatabase = undefined;
});

async function openLedgerDatabase(peerOf?: RxDatabase, multiInstance = false): Promise<RxDatabase> {
	// RxDB permits duplicate names in one JS realm only in test/dev mode.
	const devMode = peerOf ? vi.spyOn(overwritable, 'isDevMode').mockReturnValue(true) : undefined;
	const db = await createRxDatabase({
		name: peerOf?.name ?? `ledgerrecovery${(databaseSequence += 1)}`,
		storage: peerOf?.storage ?? getRxStorageMemory(),
		multiInstance,
		ignoreDuplicate: !!peerOf,
	});
	devMode?.mockRestore();
	if (peerOf) peerDatabase = db;
	else openDatabase = db;
	const creators = engineCollectionCreators();
	await db.addCollections(
		Object.fromEntries(LEDGER_COLLECTIONS.map((name) => [name, creators[name]])) as never
	);
	return db;
}

function productBrowseWindowTask(): FetchTask {
	const descriptor: ProductBrowseWindowDescriptor = {
		limit: PRODUCT_BROWSE_WINDOW_LIMIT,
		orderby: PRODUCT_BROWSE_WINDOW_ORDERBY,
		order: PRODUCT_BROWSE_WINDOW_ORDER,
	};
	const queryKey = PRODUCT_BROWSE_WINDOW_GRAMMAR.encode(descriptor);
	return {
		id: `${queryKey}:windowed`,
		requirementId: PRODUCT_BROWSE_WINDOW_GRAMMAR.requirementId(descriptor),
		collection: 'products',
		queryKey,
		limit: descriptor.limit,
		priority: 500,
		mode: 'windowed',
	};
}

function queuedSchedulerTaskDocument(task: FetchTask): Record<string, unknown> {
	return {
		stateKey: schedulerTaskStateKey(task.id),
		taskId: task.id,
		requirementId: task.requirementId,
		collectionName: task.collection,
		queryKey: task.queryKey,
		limit: task.limit,
		priority: task.priority,
		mode: task.mode,
		status: 'queued',
		ownerId: null,
		claimedUntilMs: null,
		attempt: 0,
		retryAfterMs: null,
		updatedAtMs: 1,
		schemaVersion: 4,
	};
}

const emptyProductResponse = () =>
	Promise.resolve(
		new Response('[]', {
			headers: { 'X-WP-Total': '321', 'Content-Type': 'application/json' },
		})
	);

/** The FULL engine scope recipe — what a drain tick reads through. */
async function openEngineDatabase(): Promise<RxDatabase> {
	const db = await createRxDatabase({
		name: `ledgerrecoveryengine${(databaseSequence += 1)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	openDatabase = db;
	await db.addCollections(engineCollectionCreators() as never);
	return db;
}

describe('coverage ledger recovery', () => {
	it.each(['repository', 'seed'] as const)('bounds permanent COL21 in %s', async (mode) => {
		const database = {};
		const rebuild = vi.fn(async () => {});
		registerLedgerRecovery({ database, rebuild });
		const error = newRxError('COL21', { collection: 'coverageRecords' });
		const run = vi.fn(async () => {
			throw error;
		});
		const result =
			mode === 'repository'
				? withLedgerRecovery({ database, trigger: 'coverage', create: () => ({ run }) }).run()
				: withSchedulerSeedLedgerRecovery({ database, run });
		await expect(result).rejects.toBe(error);
		expect(rebuild).toHaveBeenCalledTimes(LEDGER_COLLECTIONS.length + 1);
		expect(run).toHaveBeenCalledTimes(LEDGER_COLLECTIONS.length + 2);
	});

	// A drain tick holds claims a peer's rebuild dropped, exactly as a local rebuild
	// would: it re-attaches once so the collections are usable again, then aborts
	// cleanly and lets the next cadence re-claim. It never retries the tick.
	it('re-attaches once and aborts a drain tick on COL21', async () => {
		const database = {};
		const rebuild = vi.fn(async () => {});
		registerLedgerRecovery({ database, rebuild });
		const run = vi.fn(async () => {
			throw newRxError('COL21', { collection: 'coverageRecords' });
		});
		const aborted = vi.fn(() => 'aborted' as const);
		await expect(withSchedulerDrainLedgerRecovery({ database, run, aborted })).resolves.toBe(
			'aborted'
		);
		expect(rebuild).toHaveBeenCalledTimes(1);
		expect(rebuild).toHaveBeenCalledWith('COL21', 'scheduler', 'reattach');
		expect(run).toHaveBeenCalledTimes(1);
		expect(aborted).toHaveBeenCalledTimes(1);
	});

	it('re-attaches a peer without dropping storage', async () => {
		const a = await openLedgerDatabase(undefined, true);
		const b = await openLedgerDatabase(a, true);
		const eventsA: SyncEvent[] = [];
		const eventsB: SyncEvent[] = [];
		const coverageA = createLocalCoverage({
			database: a as never,
			freshForMs: 500,
			diagnostics: (event) => eventsA.push(event),
		});
		const coverageB = createLocalCoverage({
			database: b as never,
			freshForMs: 500,
			diagnostics: (event) => eventsB.push(event),
		});
		const oldB = LEDGER_COLLECTIONS.map((name) => b.collections[name]);
		const removedB = Promise.all(
			oldB.map(
				(collection) =>
					new Promise<void>((resolve) => {
						collection.onRemove.push(resolve);
					})
			)
		);
		for (const name of LEDGER_COLLECTIONS) {
			await engineCollections.resetDerivableMetadataCollection(a, name);
		}
		await removedB;
		for (const collection of oldB) {
			expect(collection.closed).toBe(true);
			expect(b.collections[collection.name]).toBeUndefined();
		}
		expect(() => oldB[0].find()).toThrow(expect.objectContaining({ code: 'COL21' }));
		await coverageA.recordQueryResult({
			collection: 'orders',
			queryKey: 'orders:open',
			records: [{ id: 'woo-order:1' }],
			complete: true,
		});
		const snapshot = await coverageA.readSnapshot();
		const add = vi.spyOn(b, 'addCollections');
		const remove = oldB.map((collection) => vi.spyOn(collection, 'remove'));
		await expect(
			Promise.all([coverageB.readSnapshot(), coverageB.readSnapshot()])
		).resolves.toEqual([snapshot, snapshot]);
		expect(add).toHaveBeenCalledTimes(1);
		for (const spy of remove) expect(spy).not.toHaveBeenCalled();
		for (const name of LEDGER_COLLECTIONS) {
			expect(b.collections[name].closed).toBe(false);
			expect(a.collections[name].closed).toBe(false);
		}
		expect(eventsA).toEqual([
			{
				type: 'coverage.ledger-reattached',
				level: 'info',
				fields: { reason: 'COL21', trigger: 'coverage' },
			},
		]);
		expect(eventsB).toEqual([
			{
				type: 'coverage.ledger-reattached',
				level: 'info',
				fields: { reason: 'COL21', trigger: 'coverage' },
			},
		]);
		await expect(coverageA.readSnapshot()).resolves.toEqual(snapshot);
	});

	it('reaches the query-total cache from an unfiltered publish product drain', async () => {
		const db = await openEngineDatabase();
		const coverage = createLocalCoverage({
			database: db as never,
			now: () => 1_000,
			freshForMs: 500,
		});
		const task = productBrowseWindowTask();
		await db.collections.schedulerTaskStates.insert(queuedSchedulerTaskDocument(task));
		const upsert = vi.spyOn(RxQueryTotalCacheRepository.prototype, 'upsert');

		await runEngineSchedulerDrain({
			db: db as never,
			coverage,
			baseUrl: 'https://ledger.example.test',
			ownerId: 'tab-1',
			fetcher: emptyProductResponse,
			nowMs: 1_000,
		});

		expect(upsert).toHaveBeenCalled();
	});

	/**
	 * BROWSE-WINDOW LANE EVICTION AGAINST REAL RxDB (#948/#957 follow-up).
	 *
	 * The two new repository members run real queries — `listCoverageLanesForCollection`
	 * selects on `collectionName` and sorts on the declared `['collectionName','queryKey']`
	 * index, and `removeCoverageLaneIfContained` deletes through `incrementalModify`. The
	 * fakes elsewhere cannot catch a selector or sort RxDB's dev-mode refuses to serve, so
	 * this exercises both against the storage the app actually uses.
	 */
	it('evicts and revives a superseded lane through real storage', async () => {
		const db = await openLedgerDatabase();
		const events: SyncEvent[] = [];
		const coverage = createLocalCoverage({
			database: db as never,
			diagnostics: (event) => events.push(event),
			now: () => 1_000,
			freshForMs: 500,
		});
		const window = (limit: number) => `products:browse-window:limit=${limit}`;
		for (const limit of [100, 200]) {
			await coverage.recordQueryResult({
				collection: 'products',
				queryKey: window(limit),
				records: Array.from({ length: limit }, (_, index) => ({
					id: `woo-product:${index + 1}`,
				})),
				complete: true,
			});
		}
		// A lane of a DIFFERENT collection must never appear in the sweep's candidate set.
		await coverage.recordQueryResult({
			collection: 'orders',
			queryKey: 'orders:browser:status=all:search=:limit=100',
			records: [{ id: 'woo-order:1' }],
			complete: true,
		});

		await expect(coverage.listLanes('products')).resolves.toEqual([
			expect.objectContaining({ queryKey: window(100) }),
			expect.objectContaining({ queryKey: window(200) }),
		]);

		const survivorIds = (await coverage.readLane('products', window(200)))!.expectedRecordIds;
		await expect(
			coverage.removeLaneIfContained({
				collection: 'products',
				queryKey: window(100),
				containedIn: survivorIds,
				supersededAtMs: 1_000,
			})
		).resolves.toBe(true);

		await expect(coverage.readLane('products', window(100))).resolves.toBeNull();
		await expect(coverage.readLane('products', window(200))).resolves.toMatchObject({
			complete: true,
		});
		await expect(coverage.listLanes('orders')).resolves.toHaveLength(1);

		// AN EVICTED LANE CAN BE WRITTEN AGAIN (review finding, 2026-08-06, P1 — refuted).
		//
		// The concern was that `_deleted: true` leaves a TOMBSTONE: `insertOrMergeLane`'s
		// `findOne().exec()` would miss it, the `insert()` would conflict, and the fallback
		// `mergeExistingLane` never restores `_deleted: false` — so a shallow grid asking for
		// the window again would re-fetch forever without regaining usable coverage.
		//
		// It does not happen: RxDB's `insert()` REVIVES a tombstoned primary key rather than
		// conflicting, so the conflict branch is never entered (measured: one insert call, no
		// throw) and the lane reads back with its full contents. Pinned here because the whole
		// claim turns on real storage semantics that an in-memory fake cannot reproduce.
		await coverage.recordQueryResult({
			collection: 'products',
			queryKey: window(100),
			records: [{ id: 'woo-product:1' }, { id: 'woo-product:2' }],
			complete: true,
		});
		await expect(coverage.readLane('products', window(100))).resolves.toMatchObject({
			complete: true,
			expectedRecordIds: ['woo-product:1', 'woo-product:2'],
		});
		// …and it is a first-class lane again: listable, and evictable a second time.
		await expect(coverage.listLanes('products')).resolves.toHaveLength(2);

		// WAS the known limitation of #1032; CLOSED by #1034. This block used to assert that
		// an evicted window's key outlived its lane on the record forever.
		//
		// A record keeps every key whose lane is LIVE — both windows still cover it here, and
		// the limit=100 lane was revived by the write above.
		const readKeys = async () =>
			(await coverage.readSnapshot()).records.find((entry) => entry.documentId === 'woo-product:1')
				?.coveredQueryKeys;
		expect(await readKeys()).toEqual([window(100), window(200)]);

		// Evict the deeper lane, then write the record again: the prune runs at write time,
		// so the membership follows the lane out.
		await coverage.removeLaneIfContained({
			collection: 'products',
			queryKey: window(200),
			containedIn: Array.from({ length: 200 }, (_, index) => `woo-product:${index + 1}`),
			supersededAtMs: 1_000,
		});
		await coverage.recordQueryResult({
			collection: 'products',
			queryKey: window(100),
			records: [{ id: 'woo-product:1' }],
			complete: true,
		});
		expect(await readKeys()).toEqual([window(100)]);
	});

	/**
	 * THE BOUND, MEASURED END TO END (#1034).
	 *
	 * A scroll replayed through the real repository, with #1032's eviction applied at each
	 * tick exactly as the fetchers apply it. Every tick re-stamps EVERY record in the window
	 * (`recordCoverage` passes the whole window, not the delta), which is precisely why the
	 * membership count used to be quadratic — and why a write-time prune is free.
	 *
	 * 500 rows in 100-row steps: memberships would be Σ(1..5)×100 = 1,500 without the prune.
	 * They land at 900, and the shape of that number is the point — it is 2 per record, not
	 * 1, and CONSTANT rather than growing with depth.
	 *
	 * Why 2 and not 1: #1032 evicts a superseded lane AFTER the write that filled the deeper
	 * window (it has to — the ancestry guard re-reads the lane the walk resumed from). So at
	 * the moment a tick stamps its records, the PREDECESSOR window's lane is still live and
	 * legitimately retained; it is evicted a moment later, and the next tick that touches
	 * those records drops it. A record therefore rests holding the current window and the one
	 * before it.
	 *
	 * That is the real bound: O(1) per record instead of O(depth/step). Scaled to the
	 * 10,000-row scroll, 505,000 memberships → 20,000, i.e. 17.34 MB → 0.71 MB of key
	 * strings, a 96% reduction. Asserting 500 here would be asserting a number this design
	 * does not produce.
	 */
	it('bounds record memberships to the live lanes across a full scroll', async () => {
		const db = await openLedgerDatabase();
		const coverage = createLocalCoverage({
			database: db as never,
			now: () => 1_000,
			freshForMs: 60_000,
		});
		const window = (limit: number) => `products:browse-window:limit=${limit}`;
		const ids = (limit: number) =>
			Array.from({ length: limit }, (_, index) => ({ id: `woo-product:${index + 1}` }));

		for (const limit of [100, 200, 300, 400, 500]) {
			await coverage.recordQueryResult({
				collection: 'products',
				queryKey: window(limit),
				records: ids(limit),
				complete: true,
			});
			// #1032's sweep: the settled window evicts the smaller ones it contains.
			for (const superseded of [100, 200, 300, 400].filter((value) => value < limit)) {
				await coverage.removeLaneIfContained({
					collection: 'products',
					queryKey: window(superseded),
					containedIn: ids(limit).map((record) => record.id),
					supersededAtMs: 1_000,
				});
			}
		}

		const snapshot = await coverage.readSnapshot();
		expect(snapshot.lanes).toHaveLength(1);
		expect(snapshot.records).toHaveLength(500);
		const memberships = snapshot.records.reduce(
			(total, record) => total + record.coveredQueryKeys.length,
			0
		);
		// Two live lanes per record for the 400 the deepest tick re-stamped, one for the tail
		// it added — NOT the 1,500 the unpruned union would have accumulated.
		expect(memberships).toBe(900);
		// Every retained key is a window that was live when its record was last written; the
		// long tail of superseded windows is gone.
		expect(new Set(snapshot.records.flatMap((record) => record.coveredQueryKeys))).toEqual(
			new Set([window(400), window(500)])
		);
		// The invariant that actually matters: bounded per record, not growing with depth.
		expect(Math.max(...snapshot.records.map((record) => record.coveredQueryKeys.length))).toBe(2);
	});

	/**
	 * THE SAFETY NET, stated honestly (#1034).
	 *
	 * The prune is lazy: it runs when a record is written. A record nothing covers any more is
	 * never written, so it KEEPS its stale keys — and deliberately gets no sweep, because
	 * record retention already deletes the whole document once `freshUntilMs` passes
	 * (`planPersistedCoverageRetention` treats records exactly like lanes). Expiry collects
	 * the document rather than tidying it, which is strictly cheaper.
	 *
	 * This pins BOTH halves so neither is mistaken for the other: stale-until-expiry, then
	 * gone entirely.
	 */
	it('leaves an untouched record stale until retention removes the whole document', async () => {
		const db = await openLedgerDatabase();
		let now = 1_000;
		const coverage = createLocalCoverage({
			database: db as never,
			now: () => now,
			freshForMs: 500,
			retainStaleForMs: 0,
		});
		const window = (limit: number) => `products:browse-window:limit=${limit}`;
		await coverage.recordQueryResult({
			collection: 'products',
			queryKey: window(100),
			records: [{ id: 'woo-product:1' }],
			complete: true,
		});
		await coverage.removeLaneIfContained({
			collection: 'products',
			queryKey: window(100),
			containedIn: ['woo-product:1'],
			supersededAtMs: 1_000,
		});

		// Nothing has written the record since its lane went away, so the key is still there.
		// This is the accepted cost of a write-time prune, not an oversight.
		const staleKeys = (await coverage.readSnapshot()).records[0]?.coveredQueryKeys;
		expect(staleKeys).toEqual([window(100)]);

		// Retention is the net: once the record expires, the document goes and takes every
		// key with it. No sweep, no per-key bookkeeping.
		now = 10_000;
		await expect(coverage.compact()).resolves.toBeGreaterThan(0);
		await expect(coverage.readSnapshot()).resolves.toMatchObject({ records: [] });
	});
});
