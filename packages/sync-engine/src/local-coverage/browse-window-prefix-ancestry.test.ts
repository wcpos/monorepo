// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { coverageLaneSchema, coverageRecordSchema } from './coverage-schema';
import { RxCoverageRepository } from './persistence';

addRxPlugin(RxDBMigrationSchemaPlugin);

const SOURCE_KEY = 'products:browse:window:limit=10';
const GROWN_KEY = 'products:browse:window:limit=20';
const PREFIX = ['woo-product:1', 'woo-product:2', 'woo-product:3'];
const DELTA = ['woo-product:4', 'woo-product:5'];

/**
 * The residual #1030 named and left open: `browseWindowPrefixSurvived` reads the source lane
 * BEFORE the write, and `withLedgerRecovery` re-invokes the write with the SAME arguments
 * after a corruption refusal drops `coverageLanes` — replaying a prefix the pre-read had
 * already approved, onto a store that no longer holds it. Re-evaluating the ancestry INSIDE
 * `recordQueryResult` is what closes it: the replay re-runs the read too.
 */
describe('browse-window prefix ancestry', () => {
	let db: RxDatabase;
	let repository: RxCoverageRepository;

	beforeAll(async () => {
		db = await createRxDatabase({
			name: 'browsewindowprefixancestry',
			storage: getRxStorageMemory(),
			multiInstance: false,
		});
		await db.addCollections({
			coverageRecords: { schema: coverageRecordSchema },
			coverageLanes: { schema: coverageLaneSchema },
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

	async function seedSourceLane(recordIds: string[]) {
		await repository.recordQueryResult({
			collection: 'products',
			queryKey: SOURCE_KEY,
			records: recordIds.map((id) => ({ id })),
			complete: true,
			nowMs: 1,
			freshForMs: 60_000,
		});
	}

	/** The grown window's write, exactly as a fetcher issues it after carrying a prefix. */
	async function writeGrownWindow() {
		await repository.recordQueryResult({
			collection: 'products',
			queryKey: GROWN_KEY,
			records: [...PREFIX, ...DELTA].map((id) => ({ id })),
			complete: true,
			nowMs: 2,
			freshForMs: 60_000,
			prefixAncestry: {
				sourceQueryKey: SOURCE_KEY,
				recordIds: PREFIX,
				fallbackRecordIds: DELTA,
			},
		});
	}

	const grown = async () => repository.readLocalLaneCoverage('products', GROWN_KEY, 0);

	it('asserts the whole window when the source lane still holds the prefix', async () => {
		await seedSourceLane(PREFIX);
		await writeGrownWindow();

		expect(await grown()).toMatchObject({
			complete: true,
			expectedRecordIds: [...PREFIX, ...DELTA],
		});
	});

	// The replay: identical arguments, but the rebuild dropped the lanes in between.
	// The demoted lane must claim NOTHING, not the delta. This pass's rows are a TAIL of the
	// listing (it resumed at an offset), and `readBrowseWindowContinuation` reads a
	// page-aligned incomplete lane as the listing's LEADING prefix — so storing the tail
	// would have the next pass offset past rows nobody ever fetched and splice the window.
	// An empty lane is what actually forces the restart the demotion is for.
	it('claims nothing when the source lane vanished before the write', async () => {
		await seedSourceLane(PREFIX);
		await db.collections.coverageLanes.findOne(`products::${SOURCE_KEY}`).remove();

		await writeGrownWindow();

		expect(await grown()).toMatchObject({ complete: false, expectedRecordIds: [] });
	});

	// The rows themselves are real and already upserted, so their RECORD coverage survives —
	// only the lane's claim about what window they form is dropped.
	it('keeps record-level coverage for the delta it demoted', async () => {
		await seedSourceLane(PREFIX);
		await db.collections.coverageLanes.findOne(`products::${SOURCE_KEY}`).remove();

		await writeGrownWindow();

		await expect(
			repository.readLocalRecordCoverage('products', DELTA[0], 0)
		).resolves.toMatchObject({ documentId: DELTA[0] });
	});

	it('claims nothing when another writer moved the source lane on', async () => {
		await seedSourceLane(['woo-product:9', ...PREFIX]);

		await writeGrownWindow();

		expect(await grown()).toMatchObject({ complete: false, expectedRecordIds: [] });
	});

	// A prefix is a PREFIX: the source lane growing past it is fine, reordering it is not.
	it('accepts a source lane that has grown beyond the carried prefix', async () => {
		await seedSourceLane([...PREFIX, 'woo-product:99']);

		await writeGrownWindow();

		expect(await grown()).toMatchObject({ complete: true });
	});

	it('leaves a write that carried no prefix untouched', async () => {
		await repository.recordQueryResult({
			collection: 'products',
			queryKey: GROWN_KEY,
			records: DELTA.map((id) => ({ id })),
			complete: true,
			nowMs: 2,
			freshForMs: 60_000,
		});

		expect(await grown()).toMatchObject({ complete: true, expectedRecordIds: DELTA });
	});
});
