/**
 * Logs-volume bench: the Store health → Logs screen under an overnight
 * escalation storm (46k rows in one day on a merchant store, 2026-09-15, where
 * the tab went "Page Unresponsive" and then "Aw, Snap").
 *
 * Seeds a real in-memory RxDB `logs` collection built from the REAL store
 * collection creator, then times every path the Logs screen runs. The user
 * path (search = bounded substring scan) must stay under BUDGET_MS. The
 * FlexSearch build that used to run instead is measured only on request
 * (`LOGS_VOLUME_BENCH_INDEX=1`) so the comparison stays reproducible without
 * costing CI twenty seconds and a gigabyte.
 *
 * Measured 2026-09-15 (Apple Silicon, memory storage, in-process):
 *   stuck$ find 258 ms · derive 54 ms · retention scan 9 ms
 *   $regex scan find 40 ms · count 37 ms
 *   FlexSearch index build 21.5 s, heap +340 MB (forward 19.4 s, strict 18.8 s,
 *   message-only 19.6 s — the pipeline's per-row cost, not the tokenizer)
 *
 * Opt in with LOGS_VOLUME_BENCH=1; PROBE_IDS / PROBE_SWEEPS shrink the seed;
 * PROBE_PROGRESS=<file> streams progress (jest buffers console output).
 */
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBFlexSearchPlugin } from 'rxdb-premium/plugins/flexsearch';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { filter, firstValueFrom } from 'rxjs';

import { buildScanSearchSelector, foldSearchText } from '@wcpos/sync-core';

import { storeCollections } from './collections';
import { searchPlugin } from './plugins/search';

import type { RxCollection, RxDocument } from 'rxdb';

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

const describeBench = process.env.LOGS_VOLUME_BENCH ? describe : describe.skip;

const STUCK_IDS = Number(process.env.PROBE_IDS ?? 1652);
const SWEEPS = Number(process.env.PROBE_SWEEPS ?? 28);
const BUDGET_MS = 1000;
const SEARCH_TERM = 'pull escalation';

type LogRow = Record<string, any>;
type SearchIndex = {
	pipeline: { awaitIdle(): Promise<void> };
	find(query: string): Promise<RxDocument[]>;
};

// Faithful copy of packages/core/src/screens/main/logs/logs-logic.ts deriveStuckRecords
// (the bench lives in the database package, which cannot import core).
function deriveStuckRecords(rows: LogRow[]) {
	const decided = new Map<string, unknown>();
	for (const row of rows) {
		if (row.operationType !== 'sync.record') continue;
		const context = row.context ?? {};
		const recordId = context.recordId;
		if (recordId === undefined || recordId === null) continue;
		const collection = typeof context.collection === 'string' ? context.collection : '';
		const key = `${collection}:${String(recordId)}`;
		if (decided.has(key)) continue;
		if (row.outcome === 'failed' || row.outcome === 'rejected') {
			decided.set(key, { key, recordId: String(recordId) });
		} else if (row.outcome === 'ok' || row.outcome === 'recovered') {
			decided.set(key, null);
		}
	}
	return [...decided.values()].filter((entry) => entry !== null);
}

function sizeOf(row: LogRow): number {
	return new TextEncoder().encode(JSON.stringify(row)).byteLength;
}

/** The storm shape: every stuck id re-escalated on every 5-minute sweep. */
function stormRows(): LogRow[] {
	const rows: LogRow[] = [];
	const base = Date.now() - SWEEPS * 5 * 60_000;
	let seq = 0;
	for (let s = 0; s < SWEEPS; s += 1) {
		for (let i = 0; i < STUCK_IDS; i += 1) {
			const id = 990_000 + i;
			const ts = base + s * 5 * 60_000 + i;
			seq += 1;
			const row: LogRow = {
				logId: `${String(s).padStart(3, '0')}-${String(i).padStart(5, '0')}`,
				timestamp: ts,
				level: 'warn',
				message: `"products/${id}" can't download from your store — products ${id} — pull escalation`,
				category: 'wcpos.sync.engine',
				operationType: 'sync.record',
				outcome: 'failed',
				code: 'SYNC331',
				seq,
				count: 1,
				firstSeen: ts,
				lastSeen: ts,
				context: {
					category: 'wcpos.sync.engine',
					id,
					recordId: id,
					collection: 'products',
					type: 'apply.escalation',
					direction: 'pull',
					status: 'missing_stored',
					detector: 'hash-checksum',
					errorCode: 'SYNC331',
					search: `wcpos.sync.engine missing_stored hash-checksum apply.escalation products pull ${id} SYNC331`,
				},
			};
			// What the logger writes: the fold of message + code + searchable context.
			row.context.fold = foldSearchText(
				`${row.message} ${row.code} ${row.context.search as string}`
			);
			row.sizeBytes = sizeOf(row);
			rows.push(row);
		}
	}
	return rows;
}

const PROGRESS_FILE = process.env.PROBE_PROGRESS ?? '';
function progress(line: string): void {
	console.log(`[bench] ${line}`);
	if (PROGRESS_FILE) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		require('fs').appendFileSync(PROGRESS_FILE, `${new Date().toISOString()} ${line}\n`);
	}
}

function heapMb(): number {
	return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}

async function timed<T>(label: string, fn: () => Promise<T> | T): Promise<[number, T]> {
	progress(`start ${label} (heap ${heapMb()} MB)`);
	const start = performance.now();
	const value = await fn();
	const ms = Math.round(performance.now() - start);
	progress(`${label}: ${ms} ms (heap ${heapMb()} MB)`);
	return [ms, value];
}

describeBench('logs volume bench', () => {
	jest.setTimeout(900_000);

	beforeAll(() => {
		setPremiumFlag();
		addRxPlugin(RxDBFlexSearchPlugin);
		addRxPlugin(RxDBMigrationSchemaPlugin);
		addRxPlugin(searchPlugin);
	});

	it('keeps every Logs-screen path under budget on a 46k-row day', async () => {
		const db = await createRxDatabase({
			name: `bench_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			allowSlowCount: true,
			multiInstance: false,
		});
		const { logs } = await db.addCollections({ logs: storeCollections.logs });
		const collection = logs as unknown as RxCollection;
		const rows = stormRows();
		progress(`rows=${rows.length} ids=${STUCK_IDS} sweeps=${SWEEPS}`);
		await timed('seed bulkInsert', () => collection.bulkInsert(rows));

		const results: Record<string, number> = {};

		// (1) header stuck$ — unbounded find + toJSON + deriveStuckRecords
		const stuckQuery = collection.find({
			selector: {
				category: { $gte: 'wcpos.sync', $lt: 'wcpos.sync/' },
				operationType: { $eq: 'sync.record' },
			},
			sort: [{ timestamp: 'desc' }],
		});
		[results.stuckExec] = await timed('stuck$ find().exec()', () => stuckQuery.exec());
		const docs = await stuckQuery.exec();
		[results.stuckDerive] = await timed('stuck$ toJSON+derive', () =>
			deriveStuckRecords(docs.map((doc) => doc.toJSON()))
		);

		// (2) reactivity: one insert → next stuck$ emission
		const before = (await firstValueFrom(stuckQuery.$)).length;
		const next = firstValueFrom(stuckQuery.$.pipe(filter((emitted) => emitted.length > before)));
		const start = performance.now();
		await collection.insert({ ...rows[0], logId: 'extra-1', timestamp: Date.now(), seq: 999_999 });
		await next;
		results.stuckReemit = Math.round(performance.now() - start);
		progress(`stuck$ re-emission after one insert: ${results.stuckReemit} ms`);

		// (3) retention sweep — loads every row to sum bytes
		[results.retention] = await timed('retention full scan', () =>
			collection.find({ sort: [{ timestamp: 'asc' }] }).exec()
		);

		// (4) the user path: the collection refuses an index, the screen scans —
		//     the production selector, so a slower builder shows up here.
		await expect((collection as any).initSearch('en')).resolves.toBeNull();
		const logsOptions = storeCollections.logs.options as {
			searchFields: string[];
			searchFoldedField: string;
		};
		const fields = logsOptions.searchFields;
		const selector = buildScanSearchSelector({
			foldedField: logsOptions.searchFoldedField,
			rawFields: fields,
			search: SEARCH_TERM,
		}) as Record<string, unknown>;
		[results.scanFind] = await timed(`$regex scan find limit 20 ("${SEARCH_TERM}")`, () =>
			collection.find({ selector, sort: [{ timestamp: 'desc' }], limit: 20 }).exec()
		);
		[results.scanCount] = await timed('$regex scan count', () =>
			collection.count({ selector }).exec()
		);

		// (5) what the screen used to do: build the FlexSearch index (opt-in)
		if (process.env.LOGS_VOLUME_BENCH_INDEX) {
			const { indexed } = await db.addCollections({
				indexed: {
					...storeCollections.logs,
					options: { searchFields: fields },
				},
			});
			await (indexed as unknown as RxCollection).bulkInsert(rows);
			const [ms] = await timed('FlexSearch index build (the old path)', async () => {
				const instance = (await (indexed as any).initSearch('en')) as SearchIndex;
				await instance.pipeline.awaitIdle();
			});
			progress(`index build: ${ms} ms — reported, not budgeted`);
		}

		await db.close();

		const over = Object.entries(results).filter(([, ms]) => ms > BUDGET_MS);
		progress(`summary ${JSON.stringify(results)}`);
		expect(over).toEqual([]);
	});
});
