// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import {
	coverageLaneMigrationStrategies,
	coverageLaneSchema,
	coverageRecordMigrationStrategies,
	coverageRecordSchema,
} from './coverage-schema';
import { RxCoverageRepository } from './persistence';

import type { RangedLaneResumeState } from '../scheduler';

addRxPlugin(RxDBMigrationSchemaPlugin);

const QUERY_KEY = 'orders:browser:status=all:after=1782864000:search=:limit=all';

const cursor = (beforeSeconds: number, excludeWooIds: number[]): RangedLaneResumeState => ({
	beforeSeconds,
	excludeWooIds,
	totalRecords: 30_000,
});

/**
 * The cursor-ancestry guard (#954). The fetcher reads the cursor when a pass starts and writes
 * the advanced one when it ends; the lane can disappear in between — Clear & Sync, a ledger
 * rebuild and coverage compaction all remove lane rows. Advancing anyway would recreate the
 * lane asserting "everything newer than here is covered" while holding only the last pass's
 * ids, over records the wipe had just deleted, and the walk would then complete having never
 * re-fetched them. Co-locating the cursor with `expectedRecordIds` is only load-bearing if the
 * write refuses to resurrect one without the other.
 */
describe('ranged resume cursor ancestry', () => {
	let db: RxDatabase;
	let repository: RxCoverageRepository;

	beforeAll(async () => {
		db = await createRxDatabase({
			name: 'rangedresumeancestry',
			storage: getRxStorageMemory(),
			multiInstance: false,
		});
		await db.addCollections({
			coverageRecords: {
				schema: coverageRecordSchema,
				migrationStrategies: coverageRecordMigrationStrategies,
			},
			coverageLanes: {
				schema: coverageLaneSchema,
				migrationStrategies: coverageLaneMigrationStrategies,
			},
		} as never);
		repository = new RxCoverageRepository(db as never);
	});

	beforeEach(async () => {
		for (const name of ['coverageLanes', 'coverageRecords'] as const) {
			const docs = await db.collections[name].find().exec();
			if (docs.length > 0) await db.collections[name].bulkRemove(docs.map((doc) => doc.primary));
		}
	});

	afterAll(async () => {
		await db.close();
	});

	async function writePass(input: {
		records: string[];
		complete: boolean;
		expected: RangedLaneResumeState | null;
		next: RangedLaneResumeState | null;
		reset: boolean;
		nowMs: number;
	}) {
		await repository.recordCumulativeQueryResult({
			collection: 'orders',
			queryKey: QUERY_KEY,
			records: input.records.map((id) => ({ id })),
			complete: input.complete,
			nowMs: input.nowMs,
			freshForMs: 60_000,
			resetCumulativeExpectedIds: input.reset,
			rangedResume: input.next,
			rangedResumeExpected: input.expected,
		});
	}

	const lane = async () => repository.readLocalLaneCoverage('orders', QUERY_KEY, 0);

	it('advances the cursor when the stored one is still the cursor the pass started from', async () => {
		await writePass({
			records: ['woo-order:3', 'woo-order:2'],
			complete: false,
			expected: null,
			next: cursor(2_000, [2]),
			reset: true,
			nowMs: 1,
		});
		await writePass({
			records: ['woo-order:1'],
			complete: false,
			expected: cursor(2_000, [2]),
			next: cursor(1_000, [1]),
			reset: false,
			nowMs: 2,
		});

		const stored = await lane();
		expect(stored?.rangedResume).toEqual(cursor(1_000, [1]));
		expect(stored?.expectedRecordIds).toEqual(['woo-order:3', 'woo-order:2', 'woo-order:1']);
	});

	// The failure this guard exists for: a reset wipes the lane WHILE a pass is in flight.
	it('refuses to resurrect an advanced cursor over a lane a reset removed mid-pass', async () => {
		await writePass({
			records: ['woo-order:3', 'woo-order:2'],
			complete: false,
			expected: null,
			next: cursor(2_000, [2]),
			reset: true,
			nowMs: 1,
		});
		// Clear & Sync / ledger rebuild: the lane row is bulk-removed.
		await db.collections.coverageLanes.findOne(`orders::${QUERY_KEY}`).remove();

		await writePass({
			records: ['woo-order:1'],
			complete: false,
			expected: cursor(2_000, [2]),
			next: cursor(1_000, [1]),
			reset: false,
			nowMs: 2,
		});

		// No cursor survives, so the next pass restarts from the top of the range instead of
		// resuming over records the wipe deleted.
		const stored = await lane();
		expect(stored?.rangedResume).toBeUndefined();
		expect(stored?.complete).toBe(false);
	});

	// Same wipe, but the in-flight pass happened to reach the end of the range: it must not be
	// allowed to declare the lane complete off its own partial id set.
	it('refuses to complete a lane whose cursor lineage was broken mid-pass', async () => {
		await writePass({
			records: ['woo-order:3', 'woo-order:2'],
			complete: false,
			expected: null,
			next: cursor(2_000, [2]),
			reset: true,
			nowMs: 1,
		});
		await db.collections.coverageLanes.findOne(`orders::${QUERY_KEY}`).remove();

		await writePass({
			records: ['woo-order:1'],
			complete: true,
			expected: cursor(2_000, [2]),
			next: null,
			reset: false,
			nowMs: 2,
		});

		const stored = await lane();
		expect(stored?.complete).toBe(false);
		expect(stored?.rangedResume).toBeUndefined();
	});

	// Another writer moved the cursor on: restart rather than clobber its progress with ours.
	it('refuses to advance when another writer moved the cursor during the pass', async () => {
		await writePass({
			records: ['woo-order:3'],
			complete: false,
			expected: null,
			next: cursor(2_000, [2]),
			reset: true,
			nowMs: 1,
		});
		await writePass({
			records: ['woo-order:2'],
			complete: false,
			expected: cursor(2_000, [2]),
			next: cursor(1_500, [9]),
			reset: false,
			nowMs: 2,
		});

		// A pass that started from the ORIGINAL cursor finishes late.
		await writePass({
			records: ['woo-order:1'],
			complete: false,
			expected: cursor(2_000, [2]),
			next: cursor(1_200, [1]),
			reset: false,
			nowMs: 3,
		});

		expect((await lane())?.rangedResume).toBeUndefined();
	});

	// Per-page publish: creates the lane at the start of a walk so the Reports progress line has
	// something to read during the first pass, and refreshes freshness so an in-flight lane
	// cannot be compacted out from under the walk.
	it('creates and refreshes an in-flight lane without touching its ids or completeness', async () => {
		await repository.publishRangedResume({
			collection: 'orders',
			queryKey: QUERY_KEY,
			resume: { ...cursor(2_000, [2]), downloadedRecords: 100 },
			expected: null,
			nowMs: 1,
			freshForMs: 60_000,
		});

		const created = await lane();
		expect(created).toMatchObject({ complete: false, expectedRecordIds: [] });
		expect(created?.rangedResume).toMatchObject({ downloadedRecords: 100 });

		await repository.publishRangedResume({
			collection: 'orders',
			queryKey: QUERY_KEY,
			resume: { ...cursor(1_500, [5]), downloadedRecords: 200 },
			expected: cursor(2_000, [2]),
			nowMs: 2,
			freshForMs: 60_000,
		});

		expect((await lane())?.rangedResume).toMatchObject({
			beforeSeconds: 1_500,
			downloadedRecords: 200,
		});
	});

	it('does not move an in-flight cursor whose lineage no longer matches', async () => {
		await repository.publishRangedResume({
			collection: 'orders',
			queryKey: QUERY_KEY,
			resume: { ...cursor(2_000, [2]), downloadedRecords: 100 },
			expected: null,
			nowMs: 1,
			freshForMs: 60_000,
		});

		await repository.publishRangedResume({
			collection: 'orders',
			queryKey: QUERY_KEY,
			resume: { ...cursor(1_000, [9]), downloadedRecords: 300 },
			// A cursor this lane never held.
			expected: cursor(1_777, [7]),
			nowMs: 2,
			freshForMs: 60_000,
		});

		expect((await lane())?.rangedResume).toMatchObject({ beforeSeconds: 2_000 });
	});

	// A pass that expected a cursor but finds no lane has lost its lineage: it must not
	// resurrect one, or the walk would resume over records a reset had just deleted.
	it('refuses to recreate a lane a reset removed mid-pass', async () => {
		await repository.publishRangedResume({
			collection: 'orders',
			queryKey: QUERY_KEY,
			resume: { ...cursor(1_500, [5]), downloadedRecords: 200 },
			expected: cursor(2_000, [2]),
			nowMs: 1,
			freshForMs: 60_000,
		});

		expect(await lane()).toBeNull();
	});

	// The greedy custom-pull lane passes no cursor at all; the guard must not touch it.
	it('leaves a non-ranged cumulative write untouched', async () => {
		await repository.recordCumulativeQueryResult({
			collection: 'orders',
			queryKey: 'orders:custom-pull',
			records: [{ id: 'woo-order:1' }],
			complete: true,
			nowMs: 1,
			freshForMs: 60_000,
			resetCumulativeExpectedIds: true,
		});

		const stored = await repository.readLocalLaneCoverage('orders', 'orders:custom-pull', 0);
		expect(stored?.complete).toBe(true);
		expect(stored?.rangedResume).toBeUndefined();
	});
});
