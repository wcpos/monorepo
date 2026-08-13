// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import type { SyncEvent } from '@wcpos/sync-core';

import { engineCollectionCreators } from '../collections/engine-collections';
import { RxQueryTotalRequestStateRepository } from '../rx-query-total-request-state-repository';
import { runEngineSchedulerDrain } from '../scheduler/engine-scheduler-drain';
import { posBootstrapTasks, seedPosBootstrapLanes } from '../scheduler/rx-pos-bootstrap-seeder';
import { emptyPersistedSchedulerTaskRunnerResult } from '../scheduler/rx-scheduler-task-runner';
import { RxSchedulerTaskStateRepository } from '../scheduler/rx-scheduler-task-state-repository';
import { createLocalCoverage } from './local-coverage';
import { RxCoverageRepository } from './persistence';
import { isReconciliationRefusalError, withLedgerRecovery } from './ledger-storage-recovery';

// The full engine recipe is past the open-core collection cap; the drain tick test
// opens all of it (ADR 0018 — premium stays host-side, and this harness is the host).
setPremiumFlag();
addRxPlugin(RxDBMigrationSchemaPlugin);

const CORRUPTION_REFUSALS = [
	'unsorted-primary',
	'duplicate-primary-id:categories::woo-category:16',
	'id-set-mismatch:orders::woo-order:42',
	'no-healthy-secondary',
	'primary-row-mismatch:products::woo-product:7',
	'duplicate-primary-range:customers::woo-customer:9',
	'uncorroborated-primary-range:tags::woo-tag:3',
	'overlapping-ranges',
] as const;

const refusalError = (reason: string) =>
	new SyntaxError(
		`SyntaxError: Unexpected token 'r', "records" is not valid JSON; index reconciliation refused: ${reason}`
	);

/**
 * The same refusal after crossing the storage worker boundary: rx-storage-remote
 * rethrows worker errors as `could not requestRemote: ` + a JSON blob whose
 * `error.message` carries the refusal, immediately followed by `","stack":...`.
 * Live shape from dev-next 2026-08-12 (the every-open ledger wipe): the reason
 * extracted from this form must classify identically to the bare form.
 */
const workerWrappedRefusalError = (reason: string) =>
	new Error(
		'could not requestRemote: ' +
			JSON.stringify(
				{
					methodName: 'query',
					params: [{ query: { selector: {}, skip: 0 } }],
					error: {
						name: 'SyntaxError',
						message: `Expected ',' or ']' after array element in JSON at position 20 (line 1 column 21); index reconciliation refused: ${reason}`,
						rxdb: true,
						stack:
							"SyntaxError: Expected ',' or ']' after array element in JSON at position 20 \n at JSON.parse (<anonymous>) \n at Ye (https://dev-next.wcpos.com/wp-content/opfs.worker.js:1:2345)",
					},
				},
				null,
				4
			)
	);

describe('isReconciliationRefusalError', () => {
	it.each(CORRUPTION_REFUSALS)('classifies the corruption refusal %s', (reason) => {
		expect(isReconciliationRefusalError(refusalError(reason))).toBe(true);
	});

	it.each(['no-divergence', 'multi-instance'])(
		'does not classify the non-corruption refusal %s',
		(reason) => {
			expect(isReconciliationRefusalError(refusalError(reason))).toBe(false);
		}
	);

	it.each([
		new SyntaxError('Unexpected token \'r\', "records" is not valid JSON'),
		new Error('Network request failed'),
	])('does not classify unrelated errors', (error) => {
		expect(isReconciliationRefusalError(error)).toBe(false);
	});

	it.each(CORRUPTION_REFUSALS)('classifies the worker-wrapped corruption refusal %s', (reason) => {
		expect(isReconciliationRefusalError(workerWrappedRefusalError(reason))).toBe(true);
	});

	it.each(['no-divergence', 'multi-instance'])(
		'does not classify the worker-wrapped non-corruption refusal %s',
		(reason) => {
			expect(isReconciliationRefusalError(workerWrappedRefusalError(reason))).toBe(false);
		}
	);
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

afterEach(async () => {
	vi.restoreAllMocks();
	await openDatabase?.close();
	openDatabase = undefined;
});

async function openLedgerDatabase(): Promise<RxDatabase> {
	const db = await createRxDatabase({
		name: `ledgerrecovery${(databaseSequence += 1)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	openDatabase = db;
	const creators = engineCollectionCreators();
	await db.addCollections(
		Object.fromEntries(LEDGER_COLLECTIONS.map((name) => [name, creators[name]])) as never
	);
	return db;
}

function schedulerTaskStateDocument(status: 'queued' | 'completed'): Record<string, unknown> {
	return {
		stateKey: 'task-orders',
		taskId: 'task-orders',
		requirementId: 'requirement-orders',
		collectionName: 'orders',
		queryKey: 'orders:open',
		limit: 100,
		priority: 500,
		mode: 'windowed',
		status,
		ownerId: null,
		claimedUntilMs: null,
		attempt: 1,
		retryAfterMs: null,
		updatedAtMs: 1,
		schemaVersion: 4,
	};
}

async function seedQueryTotalStores(db: RxDatabase): Promise<void> {
	await db.collections.queryTotalRequestStates.insert({
		queryKey: 'orders:total:test',
		status: 'failed',
		ownerId: null,
		claimedUntilMs: null,
		attempt: 0,
		retryAfterMs: 0,
		updatedAtMs: 1,
		request: null,
		schemaVersion: 2,
	});
	await db.collections.queryTotalCacheEntries.insert({
		queryKey: 'orders:total:test',
		totalMatchingRecords: 42,
		freshUntilMs: 2_000,
		updatedAtMs: 1,
		schemaVersion: 1,
	});
}

function queryTotalStateRepository(db: RxDatabase): RxQueryTotalRequestStateRepository {
	return withLedgerRecovery({
		database: db,
		trigger: 'query-total',
		create: () => new RxQueryTotalRequestStateRepository(db as never),
	});
}

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
	it('rebuilds the whole ledger once, refreshes the repository, observes it, and retries once', async () => {
		const db = await openLedgerDatabase();
		const events: SyncEvent[] = [];
		const coverage = createLocalCoverage({
			database: db as never,
			diagnostics: (event) => events.push(event),
			now: () => 1_000,
			freshForMs: 500,
		});

		await coverage.recordQueryResult({
			collection: 'orders',
			queryKey: 'orders:open',
			records: [{ id: 'woo-order:1' }],
			complete: true,
		});
		await db.collections.schedulerTaskStates.insert({
			stateKey: 'task-orders',
			taskId: 'task-orders',
			requirementId: 'requirement-orders',
			collectionName: 'orders',
			queryKey: 'orders:open',
			limit: 100,
			priority: 500,
			mode: 'windowed',
			status: 'completed',
			ownerId: null,
			claimedUntilMs: null,
			attempt: 1,
			retryAfterMs: null,
			updatedAtMs: 1,
			schemaVersion: 4,
		});
		await seedQueryTotalStores(db);
		for (const name of LEDGER_COLLECTIONS) {
			await expect(db.collections[name].count().exec()).resolves.toBe(1);
		}
		const originalCollections = new Map(
			LEDGER_COLLECTIONS.map((name) => [name, db.collections[name]])
		);

		const firstError = refusalError('duplicate-primary-id:categories::woo-category:16');
		const read = vi
			.spyOn(RxCoverageRepository.prototype, 'readCoverageDocuments')
			.mockRejectedValueOnce(firstError);

		await expect(coverage.readSnapshot()).resolves.toEqual({
			records: [],
			lanes: [],
		});
		expect(read).toHaveBeenCalledTimes(2);
		expect(read.mock.contexts[1]).not.toBe(read.mock.contexts[0]);
		for (const name of LEDGER_COLLECTIONS) {
			expect(db.collections[name]).not.toBe(originalCollections.get(name));
			await expect(db.collections[name].count().exec()).resolves.toBe(0);
		}
		expect(events).toContainEqual({
			type: 'coverage.ledger-rebuilt',
			level: 'warn',
			fields: { reason: 'duplicate-primary-id:categories::woo-category:16', trigger: 'coverage' },
		});

		const rebuiltCollections = new Map(
			LEDGER_COLLECTIONS.map((name) => [name, db.collections[name]])
		);
		const secondError = refusalError('unsorted-primary');
		read.mockRejectedValueOnce(secondError);
		await expect(coverage.readSnapshot()).rejects.toBe(secondError);
		expect(read).toHaveBeenCalledTimes(3);
		expect(read.mock.contexts[2]).toBe(read.mock.contexts[1]);
		for (const name of LEDGER_COLLECTIONS) {
			expect(db.collections[name]).toBe(rebuiltCollections.get(name));
		}
		expect(events.filter((event) => event.type === 'coverage.ledger-rebuilt')).toHaveLength(1);
	});

	it('rebuilds all five stores from a query-total refusal, retries once, and surfaces a second refusal', async () => {
		const db = await openLedgerDatabase();
		const events: SyncEvent[] = [];
		const coverage = createLocalCoverage({
			database: db as never,
			diagnostics: (event) => events.push(event),
			now: () => 1_000,
			freshForMs: 500,
		});
		await coverage.recordQueryResult({
			collection: 'orders',
			queryKey: 'orders:open',
			records: [{ id: 'woo-order:1' }],
			complete: true,
		});
		await db.collections.schedulerTaskStates.insert(schedulerTaskStateDocument('completed'));
		await seedQueryTotalStores(db);
		const originalCollections = new Map(
			LEDGER_COLLECTIONS.map((name) => [name, db.collections[name]])
		);
		const repository = queryTotalStateRepository(db);
		const firstError = refusalError(
			'duplicate-primary-id:queryTotalRequestStates::orders:total:test'
		);
		const readRunnable = vi
			.spyOn(RxQueryTotalRequestStateRepository.prototype, 'readRunnable')
			.mockRejectedValueOnce(firstError);

		await expect(repository.readRunnable(1_000)).resolves.toEqual([]);
		expect(readRunnable).toHaveBeenCalledTimes(2);
		expect(readRunnable.mock.contexts[1]).not.toBe(readRunnable.mock.contexts[0]);
		for (const name of LEDGER_COLLECTIONS) {
			expect(db.collections[name]).not.toBe(originalCollections.get(name));
			await expect(db.collections[name].count().exec()).resolves.toBe(0);
		}
		expect(events).toContainEqual({
			type: 'coverage.ledger-rebuilt',
			level: 'warn',
			fields: {
				reason: 'duplicate-primary-id:queryTotalRequestStates::orders:total:test',
				trigger: 'query-total',
			},
		});

		const rebuiltCollections = new Map(
			LEDGER_COLLECTIONS.map((name) => [name, db.collections[name]])
		);
		const secondError = refusalError('unsorted-primary');
		readRunnable.mockRejectedValueOnce(secondError);
		await expect(repository.readRunnable(1_000)).rejects.toBe(secondError);
		expect(readRunnable).toHaveBeenCalledTimes(3);
		for (const name of LEDGER_COLLECTIONS) {
			expect(db.collections[name]).toBe(rebuiltCollections.get(name));
		}
		expect(events.filter((event) => event.type === 'coverage.ledger-rebuilt')).toHaveLength(1);
	});

	it.each([
		['no-divergence', refusalError('no-divergence')],
		['multi-instance', refusalError('multi-instance')],
		['worker-wrapped no-divergence', workerWrappedRefusalError('no-divergence')],
		['worker-wrapped multi-instance', workerWrappedRefusalError('multi-instance')],
	])('does not spend query-total recovery on %s', async (_label, nonCorruptionError) => {
		const db = await openLedgerDatabase();
		const events: SyncEvent[] = [];
		createLocalCoverage({
			database: db as never,
			diagnostics: (event) => events.push(event),
			now: () => 1_000,
			freshForMs: 500,
		});
		const repository = queryTotalStateRepository(db);
		const readRunnable = vi
			.spyOn(RxQueryTotalRequestStateRepository.prototype, 'readRunnable')
			.mockRejectedValueOnce(nonCorruptionError)
			.mockRejectedValueOnce(refusalError('unsorted-primary'));

		await expect(repository.readRunnable(1_000)).rejects.toBe(nonCorruptionError);
		expect(events).toEqual([]);
		await expect(repository.readRunnable(1_000)).resolves.toEqual([]);
		expect(readRunnable).toHaveBeenCalledTimes(3);
		expect(events).toContainEqual({
			type: 'coverage.ledger-rebuilt',
			level: 'warn',
			fields: { reason: 'unsorted-primary', trigger: 'query-total' },
		});
	});

	it('shares one rebuild between concurrent callers instead of leaking the refusal', async () => {
		const db = await openLedgerDatabase();
		const events: SyncEvent[] = [];
		const coverage = createLocalCoverage({
			database: db as never,
			diagnostics: (event) => events.push(event),
			now: () => 1_000,
			freshForMs: 500,
		});

		// Both callers catch the same refusal before either rebuild finishes: the
		// second must await the in-flight rebuild and retry, not rethrow.
		const read = vi
			.spyOn(RxCoverageRepository.prototype, 'readCoverageDocuments')
			.mockRejectedValueOnce(refusalError('duplicate-primary-id:categories::woo-category:16'))
			.mockRejectedValueOnce(refusalError('duplicate-primary-id:categories::woo-category:16'));

		await expect(Promise.all([coverage.readSnapshot(), coverage.readSnapshot()])).resolves.toEqual([
			{ records: [], lanes: [] },
			{ records: [], lanes: [] },
		]);

		// Two failures + two retries, and only one ledger rebuild between them.
		expect(read).toHaveBeenCalledTimes(4);
		expect(events.filter((event) => event.type === 'coverage.ledger-rebuilt')).toHaveLength(1);
		// Both retries ran against the rebuilt repository, not the stale one.
		expect(read.mock.contexts[2]).not.toBe(read.mock.contexts[0]);
		expect(read.mock.contexts[3]).toBe(read.mock.contexts[2]);
	});
	it('rebuilds the ledger from a schedulerTaskStates refusal raised during a seed', async () => {
		const db = await openLedgerDatabase();
		const events: SyncEvent[] = [];
		// Coverage owns the rebuild recipe; registering it is what gives the scheduler
		// repositories a rebuild to trigger (#956).
		createLocalCoverage({
			database: db as never,
			diagnostics: (event) => events.push(event),
			now: () => 1_000,
			freshForMs: 500,
		});
		await db.collections.schedulerTaskStates.insert(schedulerTaskStateDocument('completed'));
		const originalCollections = new Map(
			LEDGER_COLLECTIONS.map((name) => [name, db.collections[name]])
		);

		const readForTaskIds = vi
			.spyOn(RxSchedulerTaskStateRepository.prototype, 'readForTaskIds')
			.mockRejectedValueOnce(refusalError('duplicate-primary-id:schedulerTaskStates::task-orders'));

		const seeded = await seedPosBootstrapLanes({
			database: db,
			nowMs: 1_000,
		});

		// A seed holds no claims, so it takes the coverage contract: rebuild once, then
		// run again. It must NOT resolve empty — callers treat a resolved seed as a
		// durable enqueue.
		expect(readForTaskIds).toHaveBeenCalledTimes(2);
		expect(seeded.inserted).toBe(posBootstrapTasks().length);
		for (const name of LEDGER_COLLECTIONS) {
			expect(db.collections[name]).not.toBe(originalCollections.get(name));
		}
		// The rebuild dropped the pre-existing rows; only the re-run seed's tasks remain.
		await expect(db.collections.coverageRecords.count().exec()).resolves.toBe(0);
		await expect(db.collections.schedulerTaskStates.count().exec()).resolves.toBe(
			posBootstrapTasks().length
		);
		expect(events).toContainEqual({
			type: 'coverage.ledger-rebuilt',
			level: 'warn',
			fields: {
				reason: 'duplicate-primary-id:schedulerTaskStates::task-orders',
				trigger: 'scheduler',
			},
		});
	});

	it('aborts a drain tick cleanly when the ledger is rebuilt mid-tick', async () => {
		const db = await openEngineDatabase();
		const events: SyncEvent[] = [];
		const coverage = createLocalCoverage({
			database: db as never,
			diagnostics: (event) => events.push(event),
			now: () => 1_000,
			freshForMs: 500,
		});
		await db.collections.schedulerTaskStates.insert(schedulerTaskStateDocument('queued'));

		const readRunnable = vi
			.spyOn(RxSchedulerTaskStateRepository.prototype, 'readRunnable')
			.mockRejectedValueOnce(refusalError('unsorted-primary'));
		const claim = vi.spyOn(RxSchedulerTaskStateRepository.prototype, 'claim');
		const fetcher = vi.fn();

		// The ruling: no error reaches the drain's caller — the tick ends as an empty drain.
		await expect(
			runEngineSchedulerDrain({
				db: db as never,
				coverage,
				baseUrl: 'https://ledger.example.test',
				ownerId: 'tab-1',
				fetcher: fetcher as never,
				nowMs: 1_000,
			})
		).resolves.toEqual({ ...emptyPersistedSchedulerTaskRunnerResult(), ledgerRebuilt: true });

		// No claim resurrection: the claims lived in the store the rebuild dropped, and
		// the tick does not re-read or re-claim them.
		expect(readRunnable).toHaveBeenCalledTimes(1);
		expect(claim).not.toHaveBeenCalled();
		expect(fetcher).not.toHaveBeenCalled();
		await expect(db.collections.schedulerTaskStates.count().exec()).resolves.toBe(0);
		expect(events).toContainEqual({
			type: 'coverage.ledger-rebuilt',
			level: 'warn',
			fields: { reason: 'unsorted-primary', trigger: 'scheduler' },
		});
	});

	it('shares ONE rebuild between a racing coverage caller and a scheduler caller', async () => {
		const db = await openLedgerDatabase();
		const events: SyncEvent[] = [];
		const coverage = createLocalCoverage({
			database: db as never,
			diagnostics: (event) => events.push(event),
			now: () => 1_000,
			freshForMs: 500,
		});

		const reason = 'duplicate-primary-id:categories::woo-category:16';
		vi.spyOn(RxCoverageRepository.prototype, 'readCoverageDocuments').mockRejectedValueOnce(
			refusalError(reason)
		);
		vi.spyOn(RxSchedulerTaskStateRepository.prototype, 'readForTaskIds').mockRejectedValueOnce(
			refusalError(reason)
		);

		const [snapshot, seeded] = await Promise.all([
			coverage.readSnapshot(),
			seedPosBootstrapLanes({
				database: db,
				nowMs: 1_000,
			}),
		]);

		// Both callers retry against the rebuilt ledger, riding ONE rebuild — one guard,
		// one emission.
		expect(snapshot).toEqual({ records: [], lanes: [] });
		expect(seeded.inserted).toBe(posBootstrapTasks().length);
		expect(events.filter((event) => event.type === 'coverage.ledger-rebuilt')).toHaveLength(1);
	});

	/**
	 * BROWSE-WINDOW LANE EVICTION AGAINST REAL RxDB (#948/#957 follow-up).
	 *
	 * The two new repository members run real queries — `listCoverageLanesForCollection`
	 * selects on `collectionName` and sorts on the declared `['collectionName','queryKey']`
	 * index, and `removeCoverageLaneIfContained` deletes through `incrementalModify`. The
	 * fakes elsewhere cannot catch a selector or sort RxDB's dev-mode refuses to serve, so
	 * this exercises both against the storage the app actually uses.
	 *
	 * It also pins the derivable-coverage contract: after a rebuild drops `coverageLanes`,
	 * an evicted lane is indistinguishable from any other absent one — eviction introduces
	 * no state the recovery path has to know about.
	 */
	it('evicts a superseded lane through real storage, and a rebuild treats it as ordinary absence', async () => {
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
			(await coverage.readSnapshot()).records.find((entry) => entry.id === 'woo-product:1')
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

		// The rebuild path sees the evicted lane exactly as it sees a never-written one.
		vi.spyOn(RxCoverageRepository.prototype, 'readCoverageDocuments').mockRejectedValueOnce(
			refusalError('overlapping-ranges')
		);
		await expect(coverage.readSnapshot()).resolves.toEqual({ records: [], lanes: [] });
		await expect(coverage.listLanes('products')).resolves.toEqual([]);
		expect(events.filter((event) => event.type === 'coverage.ledger-rebuilt')).toHaveLength(1);
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
