// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { yieldToEventLoop } from '../event-loop-yield';
import {
	type CoverageLaneDocument,
	coverageLaneSchema,
	type CoverageRecordDocument,
	coverageRecordSchema,
} from './coverage-schema';
import { RxCoverageRepository } from './persistence';

vi.mock('../event-loop-yield', () => ({ yieldToEventLoop: vi.fn().mockResolvedValue(undefined) }));
addRxPlugin(RxDBMigrationSchemaPlugin);

const LIVE = 'products:browse-window:limit=200';
const PRUNED = 'products:browse-window:limit=100';
const NEXT = 'products:browse-window:limit=300';
const TARGETED = 'products:targeted:1';
const PAGE = {
	collection: 'products',
	queryKey: NEXT,
	records: [{ id: '1' }, { id: '2' }, { id: '3' }],
	nowMs: 100,
	freshForMs: 500,
};
const stored = (
	id: string,
	keys: string[],
	freshUntilMs = 600,
	updatedAtMs = 100
): CoverageRecordDocument => ({
	coverageKey: `products::${id}`,
	collectionName: 'products',
	documentId: id,
	coveredQueryKeys: keys,
	freshUntilMs,
	updatedAtMs,
	schemaVersion: 2,
});

describe('coverage record batch writes', () => {
	let db: RxDatabase<{
		coverageRecords: RxCollection<CoverageRecordDocument>;
		coverageLanes: RxCollection<CoverageLaneDocument>;
	}>;
	let repository: RxCoverageRepository;
	let sequence = 0;

	beforeEach(async () => {
		db = await createRxDatabase({
			name: `coveragerecordbatch${sequence++}`,
			storage: wrappedValidateZSchemaStorage({ storage: getRxStorageMemory() }),
			multiInstance: false,
		});
		await db.addCollections({
			coverageRecords: { schema: coverageRecordSchema },
			coverageLanes: { schema: coverageLaneSchema },
		} as never);
		repository = new RxCoverageRepository(db);
		vi.mocked(yieldToEventLoop).mockClear();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await db.close();
	});

	async function seed() {
		await db.coverageLanes.insert({
			laneKey: `products::${LIVE}`,
			collectionName: 'products',
			queryKey: LIVE,
			complete: true,
			expectedRecordIds: ['1', '2'],
			freshUntilMs: 900,
			updatedAtMs: 1,
			schemaVersion: 3,
		});
		await db.coverageRecords.bulkInsert([
			stored('1', [PRUNED, LIVE, TARGETED], 900, 200),
			stored('2', [PRUNED, LIVE], 50, 1),
		]);
	}

	// Skipping the prune must fail the exact-document assertion, not just a call-count check.
	it('merges and prunes a mixed page with one record read and one record write', async () => {
		await seed();
		const reads = vi.spyOn(db.coverageRecords.storageInstance, 'findDocumentsById');
		const writes = vi.spyOn(db.coverageRecords.storageInstance, 'bulkWrite');
		await repository.recordQueryResult({ ...PAGE, complete: true });
		const counts = [reads.mock.calls.length, writes.mock.calls.length];
		const docs = await db.coverageRecords
			.findByIds(['products::1', 'products::2', 'products::3'])
			.exec();
		expect([...docs.values()].map((doc) => doc.toJSON())).toEqual([
			stored('1', [LIVE, TARGETED, NEXT], 900, 200),
			stored('2', [LIVE, NEXT]),
			stored('3', [NEXT]),
		]);
		expect(counts).toEqual([1, 1]);
		expect(writes.mock.calls[0][0]).toHaveLength(3);
		expect(writes.mock.calls[0][1]).toBe('coverage-record-batch');
	});

	it('prunes a repeated new id in a records-only page just as the second serial merge did', async () => {
		const writes = vi.spyOn(db.coverageRecords.storageInstance, 'bulkWrite');
		await repository.recordRecords({ ...PAGE, records: [{ id: '1' }, { id: '1' }] });
		const doc = await db.coverageRecords.findOne('products::1').exec(true);
		expect(doc.toJSON()).toEqual(stored('1', []));
		expect(writes).toHaveBeenCalledTimes(1);
		expect(writes.mock.calls[0][0]).toHaveLength(1);
	});

	// A stale CAS must re-merge the competing writer's keys, including pruning its dead key.
	it('retries only the conflicted record against the competing revision', async () => {
		await seed();
		const competing = await db.coverageRecords.findOne('products::1').exec(true);
		const original = db.coverageRecords.storageInstance.bulkWrite.bind(
			db.coverageRecords.storageInstance
		);
		const writes = vi.spyOn(db.coverageRecords.storageInstance, 'bulkWrite');
		writes.mockImplementationOnce(async (rows, context) => {
			if (context !== 'coverage-record-batch') return original(rows, context);
			await competing.incrementalModify((current) => ({
				...current,
				coveredQueryKeys: [...current.coveredQueryKeys, 'products:concurrent', PRUNED],
			}));
			const result = await original(rows, context);
			expect(result.error.map(({ status, documentId }) => ({ status, documentId }))).toEqual([
				{ status: 409, documentId: 'products::1' },
			]);
			return result;
		});
		const retryReads = vi.spyOn(db.coverageRecords, 'findOne');
		await repository.recordQueryResult({ ...PAGE, complete: true });
		expect(retryReads).toHaveBeenCalledExactlyOnceWith('products::1');
		expect(writes.mock.calls.map(([rows]) => rows.map((row) => row.document.coverageKey))).toEqual([
			['products::1', 'products::2', 'products::3'],
			['products::1'],
			['products::1'],
		]);
		const docs = await db.coverageRecords
			.findByIds(['products::1', 'products::2', 'products::3'])
			.exec();
		expect([...docs.values()].map((doc) => doc.toJSON())).toEqual([
			stored('1', [LIVE, TARGETED, 'products:concurrent', NEXT], 900, 200),
			stored('2', [LIVE, NEXT]),
			stored('3', [NEXT]),
		]);
	});

	it('throws a non-conflict storage error with status and document id before writing lanes', async () => {
		vi.spyOn(db.coverageRecords.storageInstance, 'bulkWrite').mockImplementationOnce(
			async (rows, context) => ({
				error: [
					{
						status: 422,
						isError: true,
						documentId: 'products::1',
						writeRow: rows[0],
						context,
						schema: db.coverageRecords.schema.jsonSchema,
						validationErrors: [{ field: 'coverageKey', message: 'refused' }],
					},
				],
			})
		);
		// assertBulkSuccess carries the status and ids as fields, not message text.
		await expect(repository.recordQueryResult({ ...PAGE, complete: true })).rejects.toMatchObject({
			message: expect.stringMatching(/Coverage record batch write failed .*products::1/),
			status: 422,
			failedIds: ['products::1'],
		});
		expect(await db.coverageLanes.find().exec()).toEqual([]);
	});

	it('reads many ids once, preserving input order, duplicates, and filtering missing ids', async () => {
		await seed();
		const reads = vi.spyOn(db.coverageRecords, 'findByIds');
		await expect(
			repository.readLocalRecordCoverages('products', ['2', 'missing', '1', '2'], 100)
		).resolves.toEqual([
			{ collection: 'products', documentId: '2', fresh: false },
			{ collection: 'products', documentId: '1', fresh: true },
			{ collection: 'products', documentId: '2', fresh: false },
		]);
		expect(reads).toHaveBeenCalledExactlyOnceWith([
			'products::2',
			'products::missing',
			'products::1',
			'products::2',
		]);
	});

	// Compaction removes a record with a tombstone; the next fetch must re-record it. findByIds
	// hides tombstones, so the batch row carries no `previous` and the storage must either accept
	// the write as an insert over a deleted document or 409 into the per-record path — never throw.
	it('re-records an id that compaction removed, and reports how many writes it took', async () => {
		await seed();
		await (await db.coverageRecords.findOne('products::1').exec(true)).remove();
		expect(await db.coverageRecords.findOne('products::1').exec()).toBeNull();
		const writes = vi.spyOn(db.coverageRecords.storageInstance, 'bulkWrite');
		await repository.recordRecords({ ...PAGE, records: [{ id: '1' }] });
		const doc = await db.coverageRecords.findOne('products::1').exec(true);
		expect(doc.toJSON()).toEqual(stored('1', [NEXT]));
		expect(writes.mock.calls.map(([rows, context]) => [context, rows.length])).toEqual([
			['coverage-record-batch', 1],
		]);
	});

	it('yields once after each recordRecords page is written', async () => {
		for (let page = 1; page <= 2; page++) {
			await repository.recordRecords({ ...PAGE, queryKey: TARGETED });
			expect(yieldToEventLoop).toHaveBeenCalledTimes(page);
			expect(await db.coverageRecords.count().exec()).toBe(3);
		}
	});
});
