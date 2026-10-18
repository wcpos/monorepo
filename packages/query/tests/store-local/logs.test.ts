import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBStatePlugin } from 'rxdb/plugins/state';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { firstValueFrom, of, Subject } from 'rxjs';

import { logsLiteral } from '../../../database/src/collections/schemas/logs';
import * as reads from '../../src/store-local';

addRxPlugin(RxDBMigrationSchemaPlugin);
addRxPlugin(RxDBStatePlugin);
let db: RxDatabase;
beforeEach(async () => {
	db = await createRxDatabase({
		name: `logs${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
		allowSlowCount: true,
	});
	await db.addCollections({ logs: { schema: logsLiteral } });
	await db.logs.bulkInsert([
		{
			logId: 'old',
			timestamp: 100,
			level: 'error',
			category: 'wcpos.sync',
			operationType: 'sync.record',
		},
		{
			logId: 'new',
			timestamp: 300,
			level: 'error',
			category: 'wcpos.payments',
			operationType: 'sync.record',
		},
		{ logId: 'clock', timestamp: 200, level: 'warn', category: 'wcpos.sync.engine' },
		{ logId: 'debug', timestamp: 400, level: 'debug', category: 'wcpos.sync' },
	]);
});
afterEach(async () => {
	await db.remove();
});

it('reads newest errors with the requested limit and resolves the current collection at call time', async () => {
	const storeDB = { collections: { logs: db.logs } };
	expect((await reads.readRecentErrorLogs(storeDB, 1)).map((row) => row.logId)).toEqual(['new']);
	expect((await reads.readRecentErrorLogs(storeDB)).map((row) => row.logId)).toEqual([
		'new',
		'old',
	]);
	storeDB.collections.logs = undefined;
	expect(await reads.readRecentErrorLogs(storeDB)).toEqual([]);
	expect(await reads.readRecentErrorLogs(null)).toEqual([]);
});

it('counts day volume and merges bounded domain outcomes newest first', async () => {
	expect(await firstValueFrom(reads.observeLogVolume(db, 200))).toEqual({
		eventsToday: 2,
		errorsToday: 1,
	});
	expect(
		(
			await firstValueFrom(reads.observeRecordOutcomeRows(db, ['wcpos.sync', 'wcpos.payments'], 1))
		).map((row) => row.logId)
	).toEqual(['new', 'old']);
	expect((await firstValueFrom(reads.observeClockCheckRows(db))).map((row) => row.logId)).toEqual([
		'clock',
	]);
});

it('emits explicit absent values', async () => {
	expect(await firstValueFrom(reads.observeLogVolume(null, 0))).toEqual({
		eventsToday: 0,
		errorsToday: 0,
	});
	expect(await firstValueFrom(reads.observeRecordOutcomeRows(null, ['wcpos.sync'], 5_000))).toEqual(
		[]
	);
	expect(await firstValueFrom(reads.observeClockCheckRows(null))).toEqual([]);
});

it('follows replacements for each live read without resubscribing the caller', () => {
	const reset$ = new Subject<{
		name: string;
		count: () => { $: ReturnType<typeof of<number>> };
		find: () => { $: ReturnType<typeof of<never[]>> };
	}>();
	const storeDB = { collections: {}, reset$ };
	const volume: unknown[] = [],
		outcomes: unknown[] = [],
		clock: unknown[] = [];
	const subscriptions = [
		reads.observeLogVolume(storeDB, 0).subscribe((value) => volume.push(value)),
		reads
			.observeRecordOutcomeRows(storeDB, ['wcpos.sync'], 5_000)
			.subscribe((value) => outcomes.push(value)),
		reads.observeClockCheckRows(storeDB).subscribe((value) => clock.push(value)),
	];
	reset$.next({ name: 'logs', count: () => ({ $: of(2) }), find: () => ({ $: of([]) }) });
	expect(volume).toEqual([
		{ eventsToday: 0, errorsToday: 0 },
		{ eventsToday: 2, errorsToday: 2 },
	]);
	expect(outcomes).toEqual([[], []]);
	expect(clock).toEqual([[], []]);
	subscriptions.forEach((subscription) => subscription.unsubscribe());
});

it('defaults the debug snapshot to the ten newest errors', async () => {
	await db.logs.bulkInsert(
		Array.from({ length: 11 }, (_, index) => ({
			logId: `error-${index}`,
			timestamp: 500 + index,
			level: 'error',
		}))
	);
	expect((await reads.readRecentErrorLogs(db)).map((row) => row.logId)).toEqual([
		'error-10',
		'error-9',
		'error-8',
		'error-7',
		'error-6',
		'error-5',
		'error-4',
		'error-3',
		'error-2',
		'error-1',
	]);
});

it('persists the read watermark and excludes errors at or before it', async () => {
	await reads.markLogsRead(db, 100);
	expect(await firstValueFrom(reads.observeUnreadErrorCount(db))).toBe(1);
	await reads.markLogsRead(db, 300);
	expect(await firstValueFrom(reads.observeUnreadErrorCount(db))).toBe(0);
});
