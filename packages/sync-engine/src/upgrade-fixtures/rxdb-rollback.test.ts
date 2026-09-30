// @vitest-environment node
/**
 * Rollback check across two rxdb installs (#2292): each direction writes orders + queue rows
 * (REAL schemas) under one version by one insert-then-patch plan (INSERTED, PATCHES; #2296),
 * reopens, verifies, queries, claims and acks under the other
 * (a child process, `rollback-reader.cjs`), then reopens under the installed one. Developer-run:
 * WCPOS_RXDB_OTHER_INSTALL = another worktree's package.json with a DIFFERENT rxdb installed.
 */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, RXDB_VERSION, type RxStorage } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { getRxStorageSQLite, getSQLiteBasicsNodeNative } from 'rxdb-premium/plugins/storage-sqlite';

import {
	recordMutationQueueMigrationStrategies,
	recordMutationQueueSchema,
} from '@wcpos/sync-core';

import { orderSchema } from '../collections/order-schema';

const require = createRequire(import.meta.url);
const { getRxStorageFilesystemNode } =
	require('rxdb-premium/plugins/storage-filesystem-node') as typeof import('rxdb-premium/plugins/storage-filesystem-node');

addRxPlugin(RxDBMigrationSchemaPlugin);
setPremiumFlag();

type Json = Record<string, unknown>;
type Kind = 'filesystem-node' | 'sqlite';
type Report = { ok: boolean; rxdbVersion: string; rows: Json; problems: string[] };

const OTHER = process.env.WCPOS_RXDB_OTHER_INSTALL;
const REASON =
	"set WCPOS_RXDB_OTHER_INSTALL to another install's package.json to run the rollback check";
const READER = fileURLToPath(new URL('./rollback-reader.cjs', import.meta.url));
const NAME = 'rollback_probe';

const order = (n: number, status: string): Json => ({
	uuid: `o-${n}`,
	remoteId: null,
	remoteKey: '',
	posUserId: '1',
	posStoreId: '7',
	number: '',
	dateCreatedGmt: `2026-09-30T08:00:0${n}`,
	status,
	total: '12.50',
	customerId: 0,
	payload: { status, meta_data: [{ key: '_woocommerce_pos_uuid', value: `o-${n}` }] },
	sync: { revision: '', partial: false, source: 'skeleton' },
	local: { dirty: true, pendingMutationIds: [`m-${n}`] },
});
const queued = (n: number, bookkeeping: Json = {}): Json => ({
	mutationId: `m-${n}`,
	recordId: `o-${n}`,
	collectionName: 'orders',
	operation: 'create',
	origin: 'minted',
	payload: { status: 'completed' },
	baseRevision: null,
	queuedAt: `2026-09-30T08:00:0${n}.000Z`,
	seq: n,
	status: 'pending',
	...bookkeeping,
});
// Queue rows in distinct states: pending; pending after a failed push; claimed.
const BACKOFF = { attempts: 1, nextAttemptAt: '2026-09-30T08:00:30.000Z' };
const LEASE = { status: 'claimed', claimedBy: 'drain-1', claimedUntil: '2026-09-30T08:01:00.000Z' };
const CLAIM = {
	id: 'm-1',
	patch: { status: 'claimed', claimedBy: 'rollback', claimedUntil: '2026-09-30T09:00:00.000Z' },
};
const ACK = 'm-3';
const WRITTEN = {
	orders: [order(1, 'completed'), order(2, 'processing'), order(3, 'completed')],
	recordMutations: [queued(1), queued(2, BACKOFF), queued(3, LEASE)],
};
/** How both directions write WRITTEN: insert without bookkeeping, then patch it in (a changelog). */
const INSERTED = { orders: WRITTEN.orders, recordMutations: [queued(1), queued(2), queued(3)] };
const PATCHES: [string, Json][] = [
	['m-2', BACKOFF],
	['m-3', LEASE],
];
/** After the claim of m-1 and the ack (removal) of m-3. */
const AFTER = {
	orders: WRITTEN.orders,
	recordMutations: [{ ...queued(1), ...CLAIM.patch }, queued(2, BACKOFF)],
};
/** The indexed read both versions run: completed orders by date, on [status, dateCreatedGmt]. */
const QUERY = {
	find: {
		selector: { status: 'completed' },
		sort: [{ dateCreatedGmt: 'asc' as const }],
		index: ['status', 'dateCreatedGmt'],
	},
	uuids: ['o-1', 'o-3'],
};

function storage(kind: Kind, dir: string): RxStorage<unknown, unknown> {
	if (kind === 'filesystem-node') return getRxStorageFilesystemNode({ basePath: dir }) as never;
	const basics = getSQLiteBasicsNodeNative(DatabaseSync);
	const open = basics.open;
	basics.open = async (name: string) => open(join(dir, `${name}.sqlite`));
	return getRxStorageSQLite({ sqliteBasics: basics }) as RxStorage<unknown, unknown>;
}

async function openDatabase(kind: Kind, dir: string) {
	const options = { name: NAME, storage: storage(kind, dir), multiInstance: false };
	const db = await createRxDatabase(options);
	await db.addCollections({
		orders: { schema: orderSchema },
		recordMutations: {
			schema: recordMutationQueueSchema,
			migrationStrategies: recordMutationQueueMigrationStrategies,
		},
	});
	return db;
}
type Db = Awaited<ReturnType<typeof openDatabase>>;

/** Open with the installed rxdb, run `body`, always close (a leak fails the next test: DB8). */
async function withDatabase<T>(kind: Kind, work: string, body: (db: Db) => Promise<T>) {
	const db = await openDatabase(kind, join(work, 'db'));
	try {
		return await body(db);
	} finally {
		await db.close();
	}
}

async function contents(db: Db) {
	const read = async (name: 'orders' | 'recordMutations') =>
		(await db.collections[name].find().exec()).map((doc) => doc.toJSON() as Json);
	return { orders: await read('orders'), recordMutations: await read('recordMutations') };
}

/** Run the reader under the OTHER install; throws with its output on a non-zero exit. */
function runReader(kind: Kind, work: string, mode: 'read' | 'write'): Report {
	const [schemas, expected] = [join(work, 'schemas.json'), join(work, 'expected.json')];
	const queueMigrations = Object.keys(recordMutationQueueMigrationStrategies).map(Number);
	const recordMutations = recordMutationQueueSchema;
	const schemaFile = { databaseName: NAME, orders: orderSchema, recordMutations, queueMigrations };
	writeFileSync(schemas, JSON.stringify(schemaFile));
	const plan = { inserted: INSERTED, patches: PATCHES, claim: CLAIM, ack: ACK, query: QUERY };
	writeFileSync(expected, JSON.stringify({ ...WRITTEN, ...plan }));
	const args = [READER, OTHER!, kind, join(work, 'db'), schemas, expected, mode];
	try {
		const out = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });
		return JSON.parse(out.trim().split('\n').pop()!) as Report;
	} catch (error) {
		const { stdout, stderr } = error as { stdout?: string; stderr?: string };
		throw new Error(`rollback-reader ${mode} failed:\n${stdout ?? ''}${stderr ?? ''}`);
	}
}

const describeRollback = OTHER ? describe : describe.skip;

describeRollback(`rxdb rollback across two installs${OTHER ? '' : ` (${REASON})`}`, () => {
	let work = '';
	beforeEach(() => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-rollback-'));
		mkdirSync(join(work, 'db'));
	});
	afterEach(() => rmSync(work, { recursive: true, force: true }));

	describe.each<Kind>(['filesystem-node', 'sqlite'])('%s', (kind) => {
		describe('installed version writes, other install reopens', () => {
			it('the other install reads, claims and acks; the installed version sees it', async () => {
				const written = await withDatabase(kind, work, async (db) => {
					for (const row of INSERTED.orders) await db.orders.insert(row);
					// Insert then patch: the bookkeeping lands as later writes (a non-empty changelog).
					for (const row of INSERTED.recordMutations) await db.recordMutations.insert(row);
					for (const [id, patch] of PATCHES)
						await (await db.recordMutations.findOne(id).exec())!.patch(patch);
					return contents(db);
				});
				expect(written).toEqual(WRITTEN);

				const report = runReader(kind, work, 'read');
				expect(report).toMatchObject({ ok: true, rows: { orders: 3, recordMutations: 3 } });
				expect(await withDatabase(kind, work, contents)).toEqual(AFTER);
				expect(report.rxdbVersion).not.toBe(RXDB_VERSION);
			}, 60_000);
		});

		describe('other install writes, installed version reopens', () => {
			it('the installed version reads, queries, claims and acks what the other wrote', async () => {
				const report = runReader(kind, work, 'write');
				expect(report).toMatchObject({ ok: true, problems: [] });

				const seen = await withDatabase(kind, work, async (db) => {
					const read = await contents(db);
					const byStatus = (await db.orders.find(QUERY.find).exec()).map((doc) => doc.uuid);
					await (await db.recordMutations.findOne(CLAIM.id).exec())!.patch(CLAIM.patch);
					const acked = await db.recordMutations.bulkRemove([ACK]);
					return { read, byStatus, ackErrors: acked.error };
				});
				expect(seen).toEqual({ read: WRITTEN, byStatus: QUERY.uuids, ackErrors: [] });
				expect(await withDatabase(kind, work, contents)).toEqual(AFTER);
				expect(report.rxdbVersion).not.toBe(RXDB_VERSION);
			}, 60_000);
		});
	});
});
