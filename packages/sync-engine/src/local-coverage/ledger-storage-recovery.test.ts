// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import type { SyncEvent } from '@wcpos/sync-core';

import { engineCollectionCreators } from '../collections/engine-collections';
import { runEngineSchedulerDrain } from '../scheduler/engine-scheduler-drain';
import { posBootstrapTasks, seedPosBootstrapLanes } from '../scheduler/rx-pos-bootstrap-seeder';
import { emptyPersistedSchedulerTaskRunnerResult } from '../scheduler/rx-scheduler-task-runner';
import { RxSchedulerTaskStateRepository } from '../scheduler/rx-scheduler-task-state-repository';
import { createLocalCoverage } from './local-coverage';
import { RxCoverageRepository } from './persistence';
import { isReconciliationRefusalError } from './ledger-storage-recovery';

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
});

const LEDGER_COLLECTIONS = ['coverageRecords', 'coverageLanes', 'schedulerTaskStates'] as const;

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
			})
		).resolves.toBe(true);

		await expect(coverage.readLane('products', window(100))).resolves.toBeNull();
		await expect(coverage.readLane('products', window(200))).resolves.toMatchObject({
			complete: true,
		});
		await expect(coverage.listLanes('orders')).resolves.toHaveLength(1);

		// The rebuild path sees the evicted lane exactly as it sees a never-written one.
		vi.spyOn(RxCoverageRepository.prototype, 'readCoverageDocuments').mockRejectedValueOnce(
			refusalError('overlapping-ranges')
		);
		await expect(coverage.readSnapshot()).resolves.toEqual({ records: [], lanes: [] });
		await expect(coverage.listLanes('products')).resolves.toEqual([]);
		expect(events.filter((event) => event.type === 'coverage.ledger-rebuilt')).toHaveLength(1);
	});
});
