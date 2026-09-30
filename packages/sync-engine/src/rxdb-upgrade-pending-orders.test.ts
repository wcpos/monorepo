// @vitest-environment node
/**
 * Pending orders written by rxdb / rxdb-premium 17.4.0 survive being opened by
 * the running version and are sent exactly once (PR #2253).
 *
 * The fixture under `upgrade-fixtures/rxdb-17.4.0-pending-orders/` was WRITTEN
 * by the real 17.4.0 engine (`upgrade-fixtures/generate-pending-orders.test.ts`,
 * commit in `manifest.writer.sourceCommit`) on both storages: a till that closed
 * with unsent sales, a failed push in backoff, a dead drain's expired claim, an
 * update against a server revision, a held open cart, a dead letter and a
 * parked conflict. Each run opens a fresh COPY, never the committed files.
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { RXDB_VERSION, type RxStorage } from 'rxdb';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { getRxStorageSQLite, getSQLiteBasicsNodeNative } from 'rxdb-premium/plugins/storage-sqlite';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';
import { scopeDatabaseName, type StoreScopeIdentity } from '@wcpos/sync-core';

import { createEngineHarness, type EngineHarness } from './testing';

const require = createRequire(import.meta.url);
const { getRxStorageFilesystemNode } =
	require('rxdb-premium/plugins/storage-filesystem-node') as typeof import('rxdb-premium/plugins/storage-filesystem-node');

setPremiumFlag();

type Json = Record<string, unknown>;
type Manifest = {
	writer: { rxdb: string; rxdbPremium: string; sourceCommit: string };
	identity: StoreScopeIdentity;
	databaseName: string;
	drainAtMs: number;
	orders: { case: string; uuid: string; expected: 'sent' | 'unchanged'; stored: Json }[];
	queue: {
		case: string;
		mutationId: string;
		seq: number;
		status: string;
		entity: string;
		uuid: string;
		outcome: 'send-once' | 'held' | 'not-sent';
		stored: Json;
	}[];
	serverSeed: Record<string, { id: number; revision: string }>;
};

const FIXTURE = fileURLToPath(
	new URL('./upgrade-fixtures/rxdb-17.4.0-pending-orders/', import.meta.url)
);
const manifest = JSON.parse(readFileSync(join(FIXTURE, 'manifest.json'), 'utf8')) as Manifest;
const sendOnce = manifest.queue
	.filter((row) => row.outcome === 'send-once')
	.sort((a, b) => a.seq - b.seq);
const untouchedRows = manifest.queue.filter((row) => row.outcome !== 'send-once');
const sentOrders = manifest.orders.filter((order) => order.expected === 'sent');
const untouchedOrders = manifest.orders.filter((order) => order.expected === 'unchanged');

/** Restores a fresh copy of one storage's fixture under `dir` and returns its storage. */
const STORAGES: [string, (dir: string) => RxStorage<unknown, unknown>][] = [
	[
		'filesystem-node',
		(dir) => {
			const files = JSON.parse(
				readFileSync(join(FIXTURE, 'filesystem-node.json'), 'utf8')
			) as Record<string, string>;
			for (const [path, text] of Object.entries(files)) {
				mkdirSync(dirname(join(dir, path)), { recursive: true });
				writeFileSync(join(dir, path), text);
			}
			return getRxStorageFilesystemNode({ basePath: dir }) as RxStorage<unknown, unknown>;
		},
	],
	[
		'sqlite',
		(dir) => {
			const file = join(dir, 'sqlite.sqlite');
			copyFileSync(join(FIXTURE, 'sqlite.sqlite'), file);
			const basics = getSQLiteBasicsNodeNative(DatabaseSync);
			const open = basics.open;
			basics.open = async (name: string) => {
				if (name !== manifest.databaseName) throw new Error(`unexpected sqlite database ${name}`);
				return open(file);
			};
			return getRxStorageSQLite({ sqliteBasics: basics }) as RxStorage<unknown, unknown>;
		},
	],
];

async function stored(harness: EngineHarness) {
	const all = async (name: string) =>
		new Map(
			(await harness.collection(name).find().exec()).map((doc) => {
				const json = doc.toJSON() as Json;
				return [String(json.uuid ?? json.mutationId), json] as const;
			})
		);
	return { orders: await all('orders'), rows: await all('mutations') };
}

/** The held, rejected and conflicted work — and its orders — exactly as 17.4.0 left it. */
function expectUntouched(state: Awaited<ReturnType<typeof stored>>): void {
	for (const row of untouchedRows)
		expect(state.rows.get(row.mutationId), row.case).toEqual(row.stored);
	for (const order of untouchedOrders)
		expect(state.orders.get(order.uuid), order.case).toEqual(order.stored);
}

/**
 * The ONLY order fields a successful push may change — what the ack writes
 * (`ackBookkeeping.reconcile` and the orders facet's `adoptPayload`, collection-descriptors.ts):
 *  - remoteId / remoteKey: a create ack captures the server id (remoteKey is its lookup spelling);
 *  - sync.revision: re-anchored to the ack's currentRevision (sync.partial / sync.source stay);
 *  - local: the acked mutationId leaves pendingMutationIds, and dirty clears with it;
 *  - payload: the ack document is adopted over the resident's; a key it omits keeps the local value;
 *  - number / dateCreatedGmt / status: promoted columns re-derived from the adopted payload
 *    (`promotedOrderColumns`). These residents hold number/date columns their payload lacks, so
 *    those two re-derive to ''.
 * Everything else (uuid, total, customerId, posUserId, posStoreId, …) must not move.
 */
const ACK_MAY_CHANGE = [
	'remoteId',
	'remoteKey',
	'local',
	'payload',
	'number',
	'dateCreatedGmt',
	'status',
];

function withoutAckFields(order: Json | undefined): Json {
	const rest: Json = { ...order, sync: { ...(order?.sync as Json), revision: undefined } };
	for (const field of ACK_MAY_CHANGE) delete rest[field];
	return rest;
}

type Applied = ReadonlyMap<string, { id: number; revision: string }>;

/** Sent orders compared WHOLE with their 17.4.0 before-state; their queue rows are gone. */
function expectSent(state: Awaited<ReturnType<typeof stored>>, applied: Applied): void {
	expect([...state.rows.keys()].sort()).toEqual(untouchedRows.map((row) => row.mutationId).sort());
	for (const order of sentOrders) {
		const after = state.orders.get(order.uuid);
		expect(withoutAckFields(after), order.case).toEqual(withoutAckFields(order.stored));
		const server = applied.get(order.uuid)!;
		const pushed = sendOnce.find((row) => row.uuid === order.uuid)!.stored.payload as Json;
		const payload: Json = { ...(order.stored.payload as Json), ...pushed, id: server.id };
		expect(after, order.case).toEqual({
			...order.stored,
			remoteId: String(server.id),
			remoteKey: String(server.id),
			sync: { ...(order.stored.sync as Json), revision: server.revision },
			local: { dirty: false, pendingMutationIds: [] },
			payload,
			number: String(payload.number ?? ''),
			dateCreatedGmt: String(payload.date_created_gmt ?? ''),
			status: String(payload.status),
		});
	}
}

let work: string | undefined;
afterEach(() => {
	if (work) rmSync(work, { recursive: true, force: true });
	work = undefined;
});

describe.each(STORAGES)('rxdb %s database written by 17.4.0', (_name, restore) => {
	it('keeps every pending order and sends each sendable mutation exactly once, in seq order', async () => {
		expect(String(RXDB_VERSION)).not.toBe(manifest.writer.rxdb);
		expect(scopeDatabaseName(manifest.identity)).toBe(manifest.databaseName);
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		const open = () =>
			createEngineHarness({
				site: manifest.identity.site,
				identity: manifest.identity,
				storage,
				startAtMs: manifest.drainAtMs,
				fetch: async (url, init) =>
					url.includes('/push/')
						? server.fetch(url, init as never)
						: Response.json({ changes: [], complete: true, documents: [] }),
			});

		let harness = await open();
		try {
			// Before any drain: every order and queue row exactly as 17.4.0 stored it.
			const before = await stored(harness);
			for (const order of manifest.orders)
				expect(before.orders.get(order.uuid), order.case).toEqual(order.stored);
			expect(before.rows.size).toBe(manifest.queue.length);
			for (const row of manifest.queue)
				expect(before.rows.get(row.mutationId), row.case).toEqual(row.stored);

			for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
			expect(await harness.engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: sendOnce.length,
				held: 1,
				failed: 0,
				rejected: 0,
				conflicts: 0,
			});
			const received = sendOnce.map((row) => row.mutationId);
			expect(server.received.map((envelope) => envelope.mutationId)).toEqual(received);
			expect([...server.applied.keys()].sort()).toEqual(
				sentOrders.map((order) => order.uuid).sort()
			);
			const drained = await stored(harness);
			expectSent(drained, server.applied);
			expectUntouched(drained);

			expect(await harness.engine.sync('write-drain')).toMatchObject({ pushed: 0, held: 1 });
			expect(server.received.map((envelope) => envelope.mutationId)).toEqual(received);

			await harness.dispose();
			harness = await open();
			expect(await harness.engine.sync('write-drain')).toMatchObject({ pushed: 0, held: 1 });
			expect(server.received.map((envelope) => envelope.mutationId)).toEqual(received);
			const reopened = await stored(harness);
			expect([...reopened.orders.keys()].sort()).toEqual(
				manifest.orders.map((order) => order.uuid).sort()
			);
			expectSent(reopened, server.applied);
			expectUntouched(reopened);
		} finally {
			await harness.dispose();
		}
	}, 30_000);
});
