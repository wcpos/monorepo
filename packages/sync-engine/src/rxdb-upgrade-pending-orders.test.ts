// @vitest-environment node
/**
 * Pending orders written by rxdb / rxdb-premium 17.4.0 survive being opened by
 * the running version and are sent exactly once (PR #2253) — and they survive
 * a scope GENERATION bump the same way: the fixture is a `pos_v5` database, the
 * till now opens `pos_v6`, and `drainLegacyScopeDatabase` sends the v5 queue
 * through the current write path before it removes `pos_v5`. A drain that
 * fails leaves `pos_v5` in place for a later start; the held open cart is
 * carried into `pos_v6` when the live engine is given.
 *
 * The fixture under `upgrade-fixtures/rxdb-17.4.0-pending-orders/` was WRITTEN
 * by the real 17.4.0 engine (`upgrade-fixtures/generate-pending-orders.test.ts`,
 * commit in `manifest.writer.sourceCommit`) on both storages: a till that closed
 * with unsent sales, a failed push in backoff, a dead drain's expired claim, an
 * update against a server revision, a held open cart, a dead letter and a
 * parked conflict. Each run opens a fresh COPY, never the committed files.
 */
import { DatabaseSync } from 'node:sqlite';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { createRxDatabase, RXDB_VERSION, type RxStorage } from 'rxdb';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { getRxStorageSQLite, getSQLiteBasicsNodeNative } from 'rxdb-premium/plugins/storage-sqlite';

import { createFakeWriteServer, type FakeWriteServer } from '@wcpos/sync-core/testing';
import {
	DRAINABLE_SCOPE_DATABASE_GENERATION,
	SCOPE_DATABASE_GENERATION,
	scopeDatabaseName,
	type StoreScopeIdentity,
} from '@wcpos/sync-core';

import { engineCollectionCreators } from './collections/engine-collections';
import { EngineOrderRepository } from './write-path/engine-order-repository';
import { createEngineHarness, type EngineHarness, memoryEngineStorage, remoteId } from './testing';
import {
	drainLegacyScopeDatabase,
	LEGACY_UNSENDABLE_REPORT_INTERVAL_MS,
	type LegacyScopeDrainPorts,
	type LegacyScopeDrainWriteEvent,
} from './write-path/legacy-scope-drain';

import type { EngineConnectivity } from './create-rxdb-sync-engine';

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
			// The fixture is the legacy database; any other (the current generation's) is a new file.
			basics.open = async (name: string) =>
				open(name === manifest.databaseName ? file : join(dir, `${name}.sqlite`));
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

/** The fixture's un-sendable work, by kind: the held open cart, the dead letter, the parked conflict. */
const UNSENDABLE = { held: 1, deadLetters: 1, conflicts: 1 };

/** The orders the fixture's un-sendable rows belong to: the held cart, the dead letter, the conflict. */
const uuidOf = (key: string) => manifest.orders.find((order) => order.case === key)!.uuid;
const KEPT_ORDERS = ['e', 'f', 'g'].map(uuidOf).sort();

/** A next-day start: past any backoff a refused push scheduled. */
const LATER_START_MS = 24 * 60 * 60_000;

const SITE = {
	syncBaseUrl: `${manifest.identity.site}/wp-json/wcpos/v2`,
	wpJsonRoot: `${manifest.identity.site}/wp-json`,
};

/** The store: pushes go to the fake write server, every pull answers empty. */
function storeFetch(server: FakeWriteServer, push?: () => Response | undefined) {
	return async (url: string, init?: RequestInit): Promise<Response> =>
		url.includes('/push/')
			? (push?.() ?? server.fetch(url, init as never))
			: Response.json({ changes: [], complete: true, documents: [] });
}

/** One app start's drain of the fixture's scope, against `storage`. */
function drainPorts(
	storage: RxStorage<unknown, unknown>,
	fetcher: LegacyScopeDrainPorts['fetcher'],
	options: { atMs?: number; connectivity?: EngineConnectivity } & Pick<
		LegacyScopeDrainPorts,
		'liveEngine' | 'diagnostics' | 'onWriteEvent' | 'databaseFiles'
	> = {}
): LegacyScopeDrainPorts {
	const { atMs, connectivity, ...rest } = options;
	return {
		site: SITE,
		storage,
		fetcher,
		now: () => atMs ?? manifest.drainAtMs,
		connectivity: () => connectivity ?? 'online',
		...rest,
	};
}

/** Opens the LEGACY database itself (the drain's own open path) for inspection. */
function openLegacy(storage: RxStorage<unknown, unknown>, server: FakeWriteServer) {
	return createEngineHarness({
		site: manifest.identity.site,
		identity: manifest.identity,
		storage,
		startAtMs: manifest.drainAtMs,
		fetch: storeFetch(server),
		ports: { scopeDatabaseGeneration: DRAINABLE_SCOPE_DATABASE_GENERATION },
	});
}

function expectAsWritten(state: Awaited<ReturnType<typeof stored>>): void {
	for (const order of manifest.orders)
		expect(state.orders.get(order.uuid), order.case).toEqual(order.stored);
	expect(state.rows.size).toBe(manifest.queue.length);
	for (const row of manifest.queue)
		expect(state.rows.get(row.mutationId), row.case).toEqual(row.stored);
}

describe.each(STORAGES)('rxdb %s database written by 17.4.0', (_name, restore) => {
	it('is the drainable generation: v6 opens a different database, v5 still opens with the schemas it shipped', () => {
		expect(String(RXDB_VERSION)).not.toBe(manifest.writer.rxdb);
		expect(SCOPE_DATABASE_GENERATION).toBe(6);
		expect(scopeDatabaseName(manifest.identity)).not.toBe(manifest.databaseName);
		expect(
			scopeDatabaseName(manifest.identity, { generation: DRAINABLE_SCOPE_DATABASE_GENERATION })
		).toBe(manifest.databaseName);
	});

	it('keeps every pending order and sends each sendable mutation exactly once, in seq order', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		const open = () => openLegacy(storage, server);

		let harness = await open();
		try {
			expect(harness.engine.active()?.database.name).toBe(manifest.databaseName);
			// Before any drain: every order and queue row exactly as 17.4.0 stored it.
			expectAsWritten(await stored(harness));

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

	it('the app at v6 opens pos_v6, drains pos_v5 exactly once, and keeps it while un-sendable work is left', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);

		// The upgraded till: a fresh current-generation database, none of the v5 sales in it.
		const app = await createEngineHarness({
			site: manifest.identity.site,
			identity: manifest.identity,
			storage,
			startAtMs: manifest.drainAtMs,
			fetch: storeFetch(server),
		});
		try {
			expect(app.engine.active()?.database.name).toBe(scopeDatabaseName(manifest.identity));
			expect((await stored(app)).orders.size).toBe(0);

			// The held cart, the dead letter and the parked conflict are unsent work: pos_v5 stays.
			const opened: string[] = [];
			const drain = drainPorts(storage, storeFetch(server), {
				diagnostics: (event) => opened.push(event.type),
			});
			expect(await drainLegacyScopeDatabase(drain, manifest.identity)).toEqual({
				status: 'kept',
				databaseName: manifest.databaseName,
				reason: 'unsent work is left in the queue',
				retryable: false,
				pushed: sendOnce.length,
				carried: 0,
				remaining: UNSENDABLE,
				keptOrderUuids: KEPT_ORDERS,
				reportDue: true,
			});
			expect(opened.length).toBeGreaterThan(0);
			opened.length = 0;
			const received = sendOnce.map((row) => row.mutationId);
			expect(server.received.map((envelope) => envelope.mutationId)).toEqual(received);
			expect([...server.applied.keys()].sort()).toEqual(
				sentOrders.map((order) => order.uuid).sort()
			);

			// The next start sends nothing again and still keeps it — WITHOUT opening an engine
			// (nothing in it is sendable), and the un-sendable work is not re-reported the same day.
			expect(await drainLegacyScopeDatabase(drain, manifest.identity)).toMatchObject({
				status: 'kept',
				retryable: false,
				pushed: 0,
				remaining: UNSENDABLE,
				reportDue: false,
			});
			expect(opened).toEqual([]);
			expect(server.received.map((envelope) => envelope.mutationId)).toEqual(received);
			// A day later it is reported once more.
			const nextDay = drainPorts(storage, storeFetch(server), {
				atMs: manifest.drainAtMs + LEGACY_UNSENDABLE_REPORT_INTERVAL_MS,
			});
			expect(await drainLegacyScopeDatabase(nextDay, manifest.identity)).toMatchObject({
				status: 'kept',
				reportDue: true,
			});
			expect(await drainLegacyScopeDatabase(nextDay, manifest.identity)).toMatchObject({
				status: 'kept',
				reportDue: false,
			});
			expect(app.engine.active()?.database.name).toBe(scopeDatabaseName(manifest.identity));
		} finally {
			await app.dispose();
		}

		const legacy = await openLegacy(storage, server);
		try {
			const kept = await stored(legacy);
			expect([...kept.orders.keys()].sort()).toEqual(
				manifest.orders.map((order) => order.uuid).sort()
			);
			expectSent(kept, server.applied);
			expectUntouched(kept);
		} finally {
			await legacy.dispose();
		}
	}, 30_000);

	it('removes pos_v5 once a drain leaves no unsent work of any kind', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);

		// A till whose only unsent work is sendable: no held cart (row or order), dead letter or conflict.
		const legacy = await openLegacy(storage, server);
		try {
			await legacy.collection('mutations').bulkRemove(untouchedRows.map((row) => row.mutationId));
			await legacy.collection('orders').bulkRemove([uuidOf('e')]);
		} finally {
			await legacy.dispose();
		}

		const drain = drainPorts(storage, storeFetch(server));
		expect(await drainLegacyScopeDatabase(drain, manifest.identity)).toEqual({
			status: 'drained',
			databaseName: manifest.databaseName,
			pushed: sendOnce.length,
			carried: 0,
			// No file access in this harness: the tables are dropped, the file is not deleted.
			fileRemoved: false,
		});
		const received = sendOnce.map((row) => row.mutationId);
		expect(server.received.map((envelope) => envelope.mutationId)).toEqual(received);

		// pos_v5 is gone: the next start finds nothing and sends nothing.
		expect(await drainLegacyScopeDatabase(drain, manifest.identity)).toEqual({
			status: 'absent',
			databaseName: manifest.databaseName,
		});
		expect(server.received.map((envelope) => envelope.mutationId)).toEqual(received);
	}, 30_000);

	it('a drain that fails leaves pos_v5 in place; a later start sends it exactly once', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);

		// Offline: nothing is attempted, nothing is touched.
		const offline = await drainLegacyScopeDatabase(
			drainPorts(storage, storeFetch(server), { connectivity: 'offline' }),
			manifest.identity
		);
		expect(offline).toMatchObject({
			status: 'kept',
			databaseName: manifest.databaseName,
			retryable: true,
		});
		expect(offline.status === 'kept' && offline.reason).toContain('offline');

		// The store refuses the session: a host condition, not a verdict on the sales.
		const refused = await drainLegacyScopeDatabase(
			drainPorts(
				storage,
				storeFetch(server, () => Response.json({ code: 'rest_forbidden' }, { status: 401 }))
			),
			manifest.identity
		);
		expect(refused).toMatchObject({
			status: 'kept',
			databaseName: manifest.databaseName,
			retryable: true,
		});
		expect(server.received).toEqual([]);

		let legacy = await openLegacy(storage, server);
		try {
			const kept = await stored(legacy);
			for (const order of manifest.orders)
				expect(kept.orders.get(order.uuid), order.case).toEqual(order.stored);
			// Every row is still queued; none was dead-lettered by the refusal.
			expect([...kept.rows.keys()].sort()).toEqual(
				manifest.queue.map((row) => row.mutationId).sort()
			);
			for (const row of sendOnce)
				expect(kept.rows.get(row.mutationId)?.status, row.case).not.toBe('rejected');
		} finally {
			await legacy.dispose();
		}

		// A later start, past the refusal's backoff: sent exactly once (the un-sendable rows still keep it).
		const later = drainPorts(storage, storeFetch(server), {
			atMs: manifest.drainAtMs + LATER_START_MS,
		});
		expect(await drainLegacyScopeDatabase(later, manifest.identity)).toMatchObject({
			status: 'kept',
			pushed: sendOnce.length,
			remaining: UNSENDABLE,
		});
		expect(server.received.map((envelope) => envelope.mutationId)).toEqual(
			sendOnce.map((row) => row.mutationId)
		);
		expect(await drainLegacyScopeDatabase(later, manifest.identity)).toMatchObject({
			status: 'kept',
			pushed: 0,
		});
		expect(server.received).toHaveLength(sendOnce.length);
	}, 30_000);
	it('carries the held open cart into pos_v6 through the live write path, and never sends it', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const cart = manifest.orders.find((order) => order.case === 'e')!;
		const heldRow = manifest.queue.find((row) => row.case === 'e')!;

		const app = await createEngineHarness({
			site: manifest.identity.site,
			identity: manifest.identity,
			storage,
			startAtMs: manifest.drainAtMs,
			fetch: storeFetch(server),
		});
		try {
			const drain = drainPorts(storage, storeFetch(server), { liveEngine: app.engine });
			expect(await drainLegacyScopeDatabase(drain, manifest.identity)).toEqual({
				status: 'kept',
				databaseName: manifest.databaseName,
				reason: 'unsent work is left in the queue',
				retryable: false,
				pushed: sendOnce.length,
				carried: 1,
				// The dead letter and the parked conflict stay in v5; the cart moved.
				remaining: { deadLetters: 1, conflicts: 1 },
				keptOrderUuids: ['f', 'g'].map(uuidOf).sort(),
				reportDue: true,
			});
			const live = await stored(app);
			const carried = live.orders.get(cart.uuid)!;
			expect(carried).toMatchObject({
				uuid: cart.uuid,
				status: 'pos-open',
				remoteId: null,
				payload: cart.stored.payload,
			});
			const queued = [...live.rows.values()];
			expect(queued).toHaveLength(1);
			expect(queued[0]).toMatchObject({
				collectionName: 'orders',
				operation: 'create',
				recordId: cart.uuid,
				status: 'pending',
				payload: heldRow.stored.payload,
			});
			expect((carried.local as { pendingMutationIds: string[] }).pendingMutationIds).toEqual([
				queued[0]!.mutationId,
			]);
			// Held in v6 exactly as it was in v5: an open cart is never pushed.
			expect(await app.engine.sync('write-drain')).toMatchObject({ pushed: 0, held: 1 });
			expect(server.received.map((envelope) => envelope.recordId)).not.toContain(cart.uuid);

			// A later start: the cart is not copied twice, and nothing is sent again.
			expect(await drainLegacyScopeDatabase(drain, manifest.identity)).toMatchObject({
				status: 'kept',
				pushed: 0,
				carried: 0,
				remaining: { deadLetters: 1, conflicts: 1 },
			});
			expect((await stored(app)).rows.size).toBe(1);
			expect(server.received).toHaveLength(sendOnce.length);
		} finally {
			await app.dispose();
		}

		const legacy = await openLegacy(storage, server);
		try {
			const kept = await stored(legacy);
			expect(kept.orders.has(cart.uuid)).toBe(false);
			expect(kept.rows.has(heldRow.mutationId)).toBe(false);
		} finally {
			await legacy.dispose();
		}
	}, 30_000);

	it('a push the host blocks still probes and reports every kept order, opening no engine and sending nothing', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		const opened: string[] = [];
		const outcome = await drainLegacyScopeDatabase(
			{
				...drainPorts(storage, storeFetch(server), {
					diagnostics: (event) => opened.push(event.type),
				}),
				pushBlockedReason: 'the store refused the session',
			},
			manifest.identity
		);
		expect(outcome).toMatchObject({
			status: 'kept',
			reason: 'the store refused the session',
			retryable: true,
			pushed: 0,
			remaining: { unsent: sendOnce.length, ...UNSENDABLE },
			keptOrderUuids: manifest.orders.map((order) => order.uuid).sort(),
		});
		expect(opened).toEqual([]);
		expect(server.received).toEqual([]);
	}, 30_000);

	it('a till killed after the cart reached pos_v6 but before it left pos_v5: no second create, and the old copy goes', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const cart = manifest.orders.find((order) => order.case === 'e')!;
		const heldRow = manifest.queue.find((row) => row.case === 'e')!;

		const app = await createEngineHarness({
			site: manifest.identity.site,
			identity: manifest.identity,
			storage,
			startAtMs: manifest.drainAtMs,
			fetch: storeFetch(server),
		});
		try {
			// What the crashed start left: the copy and its queued create in v6, the cart still in v5.
			await app
				.collection('orders')
				.insert({ ...cart.stored, local: { dirty: false, pendingMutationIds: [] } });
			const { mutationId } = await app.engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: cart.uuid,
				payload: heldRow.stored.payload as Json,
			});

			const drain = drainPorts(storage, storeFetch(server), { liveEngine: app.engine });
			expect(await drainLegacyScopeDatabase(drain, manifest.identity)).toMatchObject({
				status: 'kept',
				carried: 1,
				remaining: { deadLetters: 1, conflicts: 1 },
			});
			const live = await stored(app);
			expect([...live.rows.keys()]).toEqual([mutationId]);
			expect(server.received.map((envelope) => envelope.recordId)).not.toContain(cart.uuid);
		} finally {
			await app.dispose();
		}

		const legacy = await openLegacy(storage, server);
		try {
			const kept = await stored(legacy);
			expect(kept.orders.has(cart.uuid)).toBe(false);
			expect(kept.rows.has(heldRow.mutationId)).toBe(false);
		} finally {
			await legacy.dispose();
		}
	}, 30_000);

	it('a live copy left with only an UPDATE queued is not proof of transfer: the create is repaired before v5 lets go', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const cart = manifest.orders.find((order) => order.case === 'e')!;
		const heldRow = manifest.queue.find((row) => row.case === 'e')!;

		const app = await createEngineHarness({
			site: manifest.identity.site,
			identity: manifest.identity,
			storage,
			startAtMs: manifest.drainAtMs,
			fetch: storeFetch(server),
		});
		try {
			// The till stopped after the copy but before its create was enqueued; the cashier then
			// edited the cart, which queued an update and nothing else.
			const edited = { ...(cart.stored.payload as Json), customer_note: 'edited after the copy' };
			const copy = await app
				.collection('orders')
				.insert({ ...cart.stored, local: { dirty: false, pendingMutationIds: [] } });
			await copy.incrementalModify((data: Json) => ({ ...data, payload: edited }));
			await app.engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: cart.uuid,
				payload: { customer_note: 'edited after the copy' },
			});
			expect([...(await stored(app)).rows.values()].map((row) => row.operation)).toEqual([
				'update',
			]);

			const drain = drainPorts(storage, storeFetch(server), { liveEngine: app.engine });
			expect(await drainLegacyScopeDatabase(drain, manifest.identity)).toMatchObject({
				status: 'kept',
				carried: 1,
				remaining: { deadLetters: 1, conflicts: 1 },
			});
			// One row, now the create — carrying both the cart and the later edit.
			const [row] = [...(await stored(app)).rows.values()];
			expect((await stored(app)).rows.size).toBe(1);
			expect(row).toMatchObject({
				operation: 'create',
				recordId: cart.uuid,
				status: 'pending',
				payload: expect.objectContaining({ customer_note: 'edited after the copy' }),
			});

			// The cart is checked out: the push CREATES the order on the store.
			const resident = await app.collection('orders').findOne(cart.uuid).exec();
			await resident!.incrementalModify((data: Json) => ({
				...data,
				status: 'completed',
				payload: { ...(data.payload as Json), status: 'completed' },
			}));
			expect(await app.engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const sent = server.received.filter((envelope) => envelope.recordId === cart.uuid);
			expect(sent.map((envelope) => envelope.operation)).toEqual(['create']);
			expect(server.applied.has(cart.uuid)).toBe(true);
		} finally {
			await app.dispose();
		}

		const legacy = await openLegacy(storage, server);
		try {
			const kept = await stored(legacy);
			expect(kept.orders.has(cart.uuid)).toBe(false);
			expect(kept.rows.has(heldRow.mutationId)).toBe(false);
		} finally {
			await legacy.dispose();
		}
	}, 30_000);

	it('a cart the live engine could not take (it moved to another scope) is kept as retryable, and moves on the next try', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const cart = manifest.orders.find((order) => order.case === 'e')!;

		const app = await createEngineHarness({
			site: manifest.identity.site,
			identity: manifest.identity,
			storage,
			startAtMs: manifest.drainAtMs,
			fetch: storeFetch(server),
		});
		try {
			const elsewhere: LegacyScopeDrainPorts['liveEngine'] = {
				whenActive: async () => ({
					...(await app.engine.whenActive()),
					identity: { ...manifest.identity, storeId: 99 },
				}),
				write: (intent, options) => app.engine.write(intent, options),
			};
			expect(
				await drainLegacyScopeDatabase(
					drainPorts(storage, storeFetch(server), { liveEngine: elsewhere }),
					manifest.identity
				)
			).toMatchObject({
				status: 'kept',
				retryable: true,
				carried: 0,
				reason: expect.stringContaining('the live engine is on another scope'),
				remaining: UNSENDABLE,
			});
			expect((await stored(app)).orders.has(cart.uuid)).toBe(false);

			// Back on the scope: the next attempt carries it.
			expect(
				await drainLegacyScopeDatabase(
					drainPorts(storage, storeFetch(server), { liveEngine: app.engine }),
					manifest.identity
				)
			).toMatchObject({
				status: 'kept',
				retryable: false,
				carried: 1,
				remaining: { deadLetters: 1, conflicts: 1 },
			});
			expect((await stored(app)).orders.has(cart.uuid)).toBe(true);
		} finally {
			await app.dispose();
		}
	}, 30_000);

	it('an orphan skeleton (an open cart whose create was never queued) is carried into v6 with its line before v5 goes', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const cart = manifest.orders.find((order) => order.case === 'e')!;
		const line = { uuid: 'line-1', product_id: 41, quantity: 2, name: 'Coffee' };

		// Only the orphan is left: every queue row gone (acked, or never written), the other orders
		// gone with them; the cart has a line and no queue row.
		const legacy = await openLegacy(storage, server);
		try {
			await legacy.collection('mutations').bulkRemove(manifest.queue.map((row) => row.mutationId));
			await legacy
				.collection('orders')
				.bulkRemove(manifest.orders.filter((o) => o.case !== 'e').map((o) => o.uuid));
			const skeleton = await legacy.collection('orders').findOne(cart.uuid).exec();
			await skeleton!.incrementalModify((data: Json) => ({
				...data,
				payload: { ...(data.payload as Json), line_items: [line] },
				local: { dirty: false, pendingMutationIds: [] },
			}));
		} finally {
			await legacy.dispose();
		}

		const app = await createEngineHarness({
			site: manifest.identity.site,
			identity: manifest.identity,
			storage,
			startAtMs: manifest.drainAtMs,
			fetch: storeFetch(server),
		});
		try {
			// Without a live engine to carry it into, it is kept — never removed with the database.
			expect(
				await drainLegacyScopeDatabase(drainPorts(storage, storeFetch(server)), manifest.identity)
			).toMatchObject({
				status: 'kept',
				remaining: { held: 1 },
				keptOrderUuids: [cart.uuid],
			});
			expect(
				await drainLegacyScopeDatabase(
					drainPorts(storage, storeFetch(server), { liveEngine: app.engine }),
					manifest.identity
				)
			).toMatchObject({ status: 'drained', pushed: 0, carried: 1 });
			const live = await stored(app);
			expect(live.orders.get(cart.uuid)).toMatchObject({
				status: 'pos-open',
				payload: expect.objectContaining({ line_items: [line] }),
			});
			expect([...live.rows.values()]).toEqual([
				expect.objectContaining({
					operation: 'create',
					recordId: cart.uuid,
					payload: expect.objectContaining({ line_items: [line] }),
				}),
			]);
			expect(server.received).toEqual([]);
		} finally {
			await app.dispose();
		}
		expect(
			await drainLegacyScopeDatabase(drainPorts(storage, storeFetch(server)), manifest.identity)
		).toEqual({ status: 'absent', databaseName: manifest.databaseName });
	}, 30_000);

	it('an edit to the carried cart landing between the copy and the create is kept: the create and its ack carry the edited lines', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const cart = manifest.orders.find((order) => order.case === 'e')!;
		const original = [{ product_id: 41, quantity: 1, name: 'Coffee' }];
		const edited = [{ product_id: 41, quantity: 3, name: 'Coffee' }];
		// The v5 cart already has a line: a stale snapshot would carry it back over the edit.
		const legacy = await openLegacy(storage, server);
		try {
			const order = await legacy.collection('orders').findOne(cart.uuid).exec();
			await order!.incrementalModify((data: Json) => ({
				...data,
				payload: { ...(data.payload as Json), line_items: original },
			}));
		} finally {
			await legacy.dispose();
		}

		const app = await createEngineHarness({
			site: manifest.identity.site,
			identity: manifest.identity,
			storage,
			startAtMs: manifest.drainAtMs,
			fetch: storeFetch(server),
		});
		try {
			const editing: LegacyScopeDrainPorts['liveEngine'] = {
				whenActive: () => app.engine.whenActive(),
				write: async (intent, options) => {
					// The cashier adds a line to the now-visible cart just before the carried create
					// is enqueued: the resident changes, then its update is queued (as the app does).
					const resident = await app.collection('orders').findOne(cart.uuid).exec();
					await resident!.incrementalModify((data: Json) => ({
						...data,
						payload: { ...(data.payload as Json), line_items: edited },
					}));
					await app.engine.write({
						collection: 'orders',
						operation: 'update',
						recordId: cart.uuid,
						payload: { line_items: edited },
					});
					return app.engine.write(intent, options);
				},
			};
			expect(
				await drainLegacyScopeDatabase(
					drainPorts(storage, storeFetch(server), { liveEngine: editing }),
					manifest.identity
				)
			).toMatchObject({ status: 'kept', carried: 1 });
			const rows = [...(await stored(app)).rows.values()];
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				operation: 'create',
				payload: expect.objectContaining({ line_items: [expect.objectContaining(edited[0])] }),
			});

			// Checked out and pushed: the store gets the edited lines, and the ack keeps them.
			const resident = await app.collection('orders').findOne(cart.uuid).exec();
			await resident!.incrementalModify((data: Json) => ({
				...data,
				status: 'completed',
				payload: { ...(data.payload as Json), status: 'completed' },
			}));
			expect(await app.engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const [create] = server.received.filter((envelope) => envelope.recordId === cart.uuid);
			expect(create?.operation).toBe('create');
			expect(create?.payload?.line_items).toEqual([expect.objectContaining(edited[0])]);
			const acked = (await app.collection('orders').findOne(cart.uuid).exec())!.toJSON() as Json;
			expect((acked.payload as Json).line_items).toEqual([expect.objectContaining(edited[0])]);
		} finally {
			await app.dispose();
		}
	}, 30_000);

	it('a write that fails after the copy was edited leaves the copy and its edit in v6; the next pass repairs the create and retires v5', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const cart = manifest.orders.find((order) => order.case === 'e')!;
		const heldRow = manifest.queue.find((row) => row.case === 'e')!;
		const edited = [{ product_id: 41, quantity: 3, name: 'Coffee' }];

		const app = await createEngineHarness({
			site: manifest.identity.site,
			identity: manifest.identity,
			storage,
			startAtMs: manifest.drainAtMs,
			fetch: storeFetch(server),
		});
		try {
			const failing: LegacyScopeDrainPorts['liveEngine'] = {
				whenActive: () => app.engine.whenActive(),
				write: async () => {
					// The cashier edits the visible copy, then the carried create fails.
					const resident = await app.collection('orders').findOne(cart.uuid).exec();
					await resident!.incrementalModify((data: Json) => ({
						...data,
						payload: { ...(data.payload as Json), line_items: edited },
					}));
					await app.engine.write({
						collection: 'orders',
						operation: 'update',
						recordId: cart.uuid,
						payload: { line_items: edited },
					});
					throw new Error('write: scope moved during enqueue');
				},
			};
			expect(
				await drainLegacyScopeDatabase(
					drainPorts(storage, storeFetch(server), { liveEngine: failing }),
					manifest.identity
				)
			).toMatchObject({ status: 'kept', retryable: true, carried: 0 });
			// The copy and its edit survive; v5 still has its cart.
			let live = await stored(app);
			expect((live.orders.get(cart.uuid)?.payload as Json).line_items).toEqual(edited);
			expect([...live.rows.values()].map((row) => row.operation)).toEqual(['update']);

			// The next pass: the update is not proof of transfer, so the create is repaired from the
			// live resident (the edited line), and only then does v5 let go.
			expect(
				await drainLegacyScopeDatabase(
					drainPorts(storage, storeFetch(server), { liveEngine: app.engine }),
					manifest.identity
				)
			).toMatchObject({ status: 'kept', retryable: false, carried: 1 });
			live = await stored(app);
			const rows = [...live.rows.values()];
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				operation: 'create',
				payload: expect.objectContaining({ line_items: edited }),
			});
		} finally {
			await app.dispose();
		}

		const legacy = await openLegacy(storage, server);
		try {
			const kept = await stored(legacy);
			expect(kept.orders.has(cart.uuid)).toBe(false);
			expect(kept.rows.has(heldRow.mutationId)).toBe(false);
		} finally {
			await legacy.dispose();
		}
	}, 30_000);

	it('a store switch landing between the scope check and the write refuses the carried create: nothing reaches the new scope', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const cart = manifest.orders.find((order) => order.case === 'e')!;
		const heldRow = manifest.queue.find((row) => row.case === 'e')!;
		const otherStore = { ...manifest.identity, storeId: 99 };

		const app = await createEngineHarness({
			site: manifest.identity.site,
			identity: manifest.identity,
			storage,
			startAtMs: manifest.drainAtMs,
			fetch: storeFetch(server),
		});
		try {
			const switching: LegacyScopeDrainPorts['liveEngine'] = {
				whenActive: () => app.engine.whenActive(),
				write: async (intent, options) => {
					// The cashier's store switch completes just before the enqueue.
					await app.engine.scope.switch(otherStore);
					return app.engine.write(intent, options);
				},
			};
			expect(
				await drainLegacyScopeDatabase(
					drainPorts(storage, storeFetch(server), { liveEngine: switching }),
					manifest.identity
				)
			).toMatchObject({
				status: 'kept',
				retryable: true,
				carried: 0,
				reason: expect.stringContaining('not the one this write is bound to'),
			});
			expect(app.engine.active()?.identity.storeId).toBe(99);
			// The new scope's queue and orders never saw the cart.
			const elsewhere = await stored(app);
			expect(elsewhere.rows.size).toBe(0);
			expect(elsewhere.orders.has(cart.uuid)).toBe(false);
		} finally {
			await app.dispose();
		}

		const legacy = await openLegacy(storage, server);
		try {
			const kept = await stored(legacy);
			expect(kept.orders.has(cart.uuid)).toBe(true);
			expect(kept.rows.has(heldRow.mutationId)).toBe(true);
		} finally {
			await legacy.dispose();
		}
	}, 30_000);

	describe('POS-local state on a synced order', () => {
		/** v5 with nothing unsent: one synced order whose receipt was printed twice. */
		async function printedTwice(storage: RxStorage<unknown, unknown>, server: FakeWriteServer) {
			const order = manifest.orders.find((o) => o.case === 'a')!;
			const legacy = await openLegacy(storage, server);
			try {
				await legacy
					.collection('mutations')
					.bulkRemove(manifest.queue.map((row) => row.mutationId));
				await legacy
					.collection('orders')
					.bulkRemove(manifest.orders.filter((o) => o.case !== 'a').map((o) => o.uuid));
				const doc = await legacy.collection('orders').findOne(order.uuid).exec();
				await doc!.incrementalModify((data: Json) => ({
					...data,
					local: { dirty: false, pendingMutationIds: [], receiptPrintCount: 2 },
				}));
			} finally {
				await legacy.dispose();
			}
			return order;
		}
		const appOn = (storage: RxStorage<unknown, unknown>, server: FakeWriteServer) =>
			createEngineHarness({
				site: manifest.identity.site,
				identity: manifest.identity,
				storage,
				startAtMs: manifest.drainAtMs,
				fetch: storeFetch(server),
			});

		it('an order v6 already holds gets the count onto its resident before v5 goes', async () => {
			work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
			const storage = restore(work);
			const server = createFakeWriteServer();
			const order = await printedTwice(storage, server);
			const app = await appOn(storage, server);
			try {
				await app
					.collection('orders')
					.insert({ ...order.stored, local: { dirty: false, pendingMutationIds: [] } });
				expect(
					await drainLegacyScopeDatabase(
						drainPorts(storage, storeFetch(server), { liveEngine: app.engine }),
						manifest.identity
					)
				).toMatchObject({ status: 'drained', pushed: 0 });
				const resident = (await stored(app)).orders.get(order.uuid)!;
				expect((resident.local as Json).receiptPrintCount).toBe(2);
			} finally {
				await app.dispose();
			}
		}, 30_000);

		it('an order a pull materialises between the residency read and the stash write still gets its count', async () => {
			work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
			const storage = restore(work);
			const server = createFakeWriteServer();
			const order = await printedTwice(storage, server);
			const app = await appOn(storage, server);
			try {
				let pulled = false;
				const racing: LegacyScopeDrainPorts['liveEngine'] = {
					whenActive: async () => {
						const active = await app.engine.whenActive();
						const realOrders = active.database.collections.orders!;
						// The pull lands the order just as the drain reaches the stash (it read the
						// stash, still empty, before the drain's write).
						const orders = new Proxy(realOrders, {
							get(target, property) {
								if (property === 'getLocal') {
									return async (id: string) => {
										if (!pulled) {
											pulled = true;
											await new EngineOrderRepository(
												active.database.collections as never
											).upsertMany([
												{
													...order.stored,
													local: { dirty: false, pendingMutationIds: [] },
												} as never,
											]);
										}
										return target.getLocal(id);
									};
								}
								const value = Reflect.get(target, property, target) as unknown;
								return typeof value === 'function' ? value.bind(target) : value;
							},
						});
						return {
							...active,
							database: {
								...active.database,
								collections: { ...active.database.collections, orders },
							} as never,
						};
					},
					write: (intent, options) => app.engine.write(intent, options),
				};
				expect(
					await drainLegacyScopeDatabase(
						drainPorts(storage, storeFetch(server), { liveEngine: racing }),
						manifest.identity
					)
				).toMatchObject({ status: 'drained' });
				expect(pulled).toBe(true);
				const resident = (await stored(app)).orders.get(order.uuid)!;
				expect((resident.local as Json).receiptPrintCount).toBe(2);
				const stash = await app.collection('orders').getLocal('resync-receipt-print-counts');
				expect((stash?.get('counts') as Json | undefined)?.[order.uuid]).toBeUndefined();
			} finally {
				await app.dispose();
			}
		}, 30_000);

		it('an order v6 does not hold yet is stashed, and the count lands when a pull materialises it', async () => {
			work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
			const storage = restore(work);
			const server = createFakeWriteServer();
			const order = await printedTwice(storage, server);
			const app = await appOn(storage, server);
			try {
				expect(
					await drainLegacyScopeDatabase(
						drainPorts(storage, storeFetch(server), { liveEngine: app.engine }),
						manifest.identity
					)
				).toMatchObject({ status: 'drained', pushed: 0 });
				const orders = app.collection('orders');
				expect((await orders.getLocal('resync-receipt-print-counts'))?.get('counts')).toEqual({
					[order.uuid]: 2,
				});

				// The pull materialises the order: the count is applied once, and the stash entry goes.
				const { database } = await app.engine.whenActive();
				await new EngineOrderRepository(database.collections as never).upsertMany([
					{ ...order.stored, local: { dirty: false, pendingMutationIds: [] } } as never,
				]);
				const resident = (await stored(app)).orders.get(order.uuid)!;
				expect((resident.local as Json).receiptPrintCount).toBe(2);
				expect(await orders.getLocal('resync-receipt-print-counts')).toBeNull();
			} finally {
				await app.dispose();
			}
		}, 30_000);
	});

	it('a push the store applied but whose answer was lost is re-sent under the same mutationId, never applied twice', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const first = sendOnce[0]!;

		let lost = false;
		const losesFirstAnswer = async (url: string, init?: RequestInit): Promise<Response> => {
			const response = await storeFetch(server)(url, init);
			if (!lost && url.includes('/push/')) {
				lost = true;
				throw new TypeError('Network request failed');
			}
			return response;
		};
		const kept = await drainLegacyScopeDatabase(
			drainPorts(storage, losesFirstAnswer),
			manifest.identity
		);
		expect(kept).toMatchObject({ status: 'kept', retryable: true });
		expect([...server.applied.keys()]).toContain(first.uuid);
		const appliedFirst = server.applied.get(first.uuid);

		// A later start, past the failed push's backoff: the same mutationId again, deduped.
		const later = drainPorts(storage, storeFetch(server), {
			atMs: manifest.drainAtMs + LATER_START_MS,
		});
		expect(await drainLegacyScopeDatabase(later, manifest.identity)).toMatchObject({
			status: 'kept',
			retryable: false,
			remaining: UNSENDABLE,
		});
		const sentFirst = server.received.filter(
			(envelope) => envelope.mutationId === first.mutationId
		);
		expect(sentFirst).toHaveLength(2);
		expect(server.applied.get(first.uuid)).toEqual(appliedFirst);
		expect([...server.applied.keys()].sort()).toEqual(sentOrders.map((order) => order.uuid).sort());
	}, 30_000);

	it('a till killed between disposing the drain and removing pos_v5 finds an empty queue: drained, nothing pushed', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		// Every row acked (gone) before the kill; the sent orders and the database itself remain.
		// (No open cart: one left with no queue row is an orphan skeleton, carried, not dropped.)
		const legacy = await openLegacy(storage, server);
		try {
			await legacy.collection('mutations').bulkRemove(manifest.queue.map((row) => row.mutationId));
			await legacy.collection('orders').bulkRemove([uuidOf('e')]);
		} finally {
			await legacy.dispose();
		}
		expect(
			await drainLegacyScopeDatabase(drainPorts(storage, storeFetch(server)), manifest.identity)
		).toEqual({
			status: 'drained',
			databaseName: manifest.databaseName,
			pushed: 0,
			carried: 0,
			fileRemoved: false,
		});
		expect(server.received).toEqual([]);
		expect(
			await drainLegacyScopeDatabase(drainPorts(storage, storeFetch(server)), manifest.identity)
		).toEqual({ status: 'absent', databaseName: manifest.databaseName });
	}, 30_000);

	it('counts rows queued behind a parked conflict as conflicts, and never sends them', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		const conflicted = manifest.queue.find((row) => row.case === 'g')!;
		const behind = {
			...conflicted.stored,
			mutationId: '17400000-0000-4000-8000-000000000199',
			seq: manifest.queue.length + 1,
			status: 'pending',
		} as Json;
		delete behind.claimedBy;
		delete behind.claimedUntil;
		delete behind.conflictDocument;
		delete behind.conflictRevision;
		const legacy = await openLegacy(storage, server);
		try {
			await legacy.collection('mutations').insert(behind);
		} finally {
			await legacy.dispose();
		}
		expect(
			await drainLegacyScopeDatabase(drainPorts(storage, storeFetch(server)), manifest.identity)
		).toMatchObject({
			status: 'kept',
			retryable: false,
			remaining: { held: 1, deadLetters: 1, conflicts: 2 },
		});
		expect(server.received.map((envelope) => envelope.mutationId)).not.toContain(behind.mutationId);
	}, 30_000);

	it('reports each push the store rejects, with its reason and message', async () => {
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-pending-orders-'));
		const storage = restore(work);
		const server = createFakeWriteServer();
		for (const [uuid, seed] of Object.entries(manifest.serverSeed)) server.seed(uuid, seed);
		let refusedOne = false;
		const refusesFirst = () => {
			if (refusedOne) return undefined;
			refusedOne = true;
			return Response.json(
				{
					code: 'rest_invalid_param',
					message: 'Invalid parameter(s): line_items',
					data: { status: 400 },
				},
				{ status: 400 }
			);
		};
		const events: LegacyScopeDrainWriteEvent[] = [];
		const outcome = await drainLegacyScopeDatabase(
			drainPorts(storage, storeFetch(server, refusesFirst), {
				onWriteEvent: (event) => events.push(event),
			}),
			manifest.identity
		);
		expect(outcome).toMatchObject({
			status: 'kept',
			retryable: false,
			remaining: { ...UNSENDABLE, deadLetters: 2 },
		});
		expect(events).toEqual([
			expect.objectContaining({
				type: 'write-rejected',
				recordId: sendOnce[0]!.uuid,
				status: 400,
				reason: 'rest_invalid_param',
				serverMessage: 'Invalid parameter(s): line_items',
			}),
		]);
	}, 30_000);
});

describe('drainLegacyScopeDatabase — failures and file access', () => {
	const identity: StoreScopeIdentity = {
		site: 'https://drain-failures.example.test',
		storeId: 3,
		cashierId: 9,
	};
	const legacyName = scopeDatabaseName(identity, {
		generation: DRAINABLE_SCOPE_DATABASE_GENERATION,
	});
	const noFetch = async (): Promise<Response> => {
		throw new Error('no request expected');
	};

	function sqliteIn(dir: string): RxStorage<unknown, unknown> {
		const basics = getSQLiteBasicsNodeNative(DatabaseSync);
		const open = basics.open;
		basics.open = async (name: string) => open(join(dir, `${name}.sqlite`));
		return getRxStorageSQLite({ sqliteBasics: basics }) as RxStorage<unknown, unknown>;
	}

	/** File access the way native has it: a listing, and a delete of the file and its sidecars. */
	function filesIn(dir: string): NonNullable<LegacyScopeDrainPorts['databaseFiles']> {
		return {
			exists: async (name) => existsSync(join(dir, `${name}.sqlite`)),
			remove: async (name) => {
				for (const suffix of ['', '-wal', '-shm'])
					rmSync(join(dir, `${name}.sqlite${suffix}`), { force: true });
			},
		};
	}

	const ports = (
		storage: RxStorage<unknown, unknown>,
		extra: Partial<LegacyScopeDrainPorts> = {}
	): LegacyScopeDrainPorts => ({
		site: {
			syncBaseUrl: `${identity.site}/wp-json/wcpos/v2`,
			wpJsonRoot: `${identity.site}/wp-json`,
		},
		storage,
		fetcher: noFetch,
		connectivity: () => 'online',
		...extra,
	});

	it('with a file listing, a missing database is never opened (no file is created)', async () => {
		work = mkdtempSync(join(tmpdir(), 'legacy-drain-'));
		const outcome = await drainLegacyScopeDatabase(
			ports(sqliteIn(work), { databaseFiles: filesIn(work) }),
			identity
		);
		expect(outcome).toEqual({ status: 'absent', databaseName: legacyName });
		expect(existsSync(join(work, `${legacyName}.sqlite`))).toBe(false);
	});

	it('with file access, a drained database is deleted, not only emptied', async () => {
		work = mkdtempSync(join(tmpdir(), 'legacy-drain-'));
		const storage = sqliteIn(work);
		const db = await createRxDatabase({ name: legacyName, storage, multiInstance: false });
		await db.addCollections({
			recordMutations: engineCollectionCreators().recordMutations as never,
		});
		await db.close();
		expect(existsSync(join(work, `${legacyName}.sqlite`))).toBe(true);

		expect(
			await drainLegacyScopeDatabase(ports(storage, { databaseFiles: filesIn(work) }), identity)
		).toEqual({
			status: 'drained',
			databaseName: legacyName,
			pushed: 0,
			carried: 0,
			fileRemoved: true,
		});
		expect(existsSync(join(work, `${legacyName}.sqlite`))).toBe(false);
	});

	it('reports un-sendable work once a day even when the database holds no orders collection', async () => {
		work = mkdtempSync(join(tmpdir(), 'legacy-drain-'));
		const storage = sqliteIn(work);
		const db = await createRxDatabase({ name: legacyName, storage, multiInstance: false });
		await db.addCollections({
			recordMutations: engineCollectionCreators().recordMutations as never,
		});
		await db.collections.recordMutations!.insert({
			mutationId: 'dead-letter-1',
			collectionName: 'customers',
			operation: 'create',
			recordId: 'customer-1',
			origin: 'existing',
			payload: { email: 'not-an-email' },
			baseRevision: null,
			queuedAt: '2026-09-30T08:00:00.000Z',
			seq: 1,
			status: 'rejected',
		});
		await db.close();

		const at = (nowMs: number) => ports(storage, { now: () => nowMs });
		const t0 = Date.parse('2026-10-01T08:00:00.000Z');
		expect(await drainLegacyScopeDatabase(at(t0), identity)).toMatchObject({
			status: 'kept',
			retryable: false,
			remaining: { deadLetters: 1 },
			reportDue: true,
		});
		expect(await drainLegacyScopeDatabase(at(t0 + 60_000), identity)).toMatchObject({
			reportDue: false,
		});
		expect(
			await drainLegacyScopeDatabase(at(t0 + LEGACY_UNSENDABLE_REPORT_INTERVAL_MS), identity)
		).toMatchObject({ reportDue: true });
	});

	it('a database the drainable schemas cannot open is failed, not kept', async () => {
		work = mkdtempSync(join(tmpdir(), 'legacy-drain-'));
		const storage = sqliteIn(work);
		// Written with TODAY's schemas under the drainable name: products differ, so opening it as
		// the drainable generation throws DB6.
		const db = await createRxDatabase({ name: legacyName, storage, multiInstance: false });
		await db.addCollections(engineCollectionCreators() as never);
		await db.collections.recordMutations!.insert({
			mutationId: 'drain-failure-1',
			collectionName: 'orders',
			operation: 'create',
			recordId: 'drain-failure-order',
			origin: 'existing',
			payload: { status: 'completed' },
			baseRevision: null,
			queuedAt: '2026-09-30T08:00:00.000Z',
			seq: 1,
			status: 'pending',
		});
		await db.close();

		const outcome = await drainLegacyScopeDatabase(ports(storage), identity);
		expect(outcome).toMatchObject({ status: 'failed', databaseName: legacyName });
		expect(outcome.status === 'failed' && outcome.error).toMatch(/DB6/);
	});

	it('a storage that cannot open is failed, not kept', async () => {
		const broken = {
			name: 'broken',
			rxdbVersion: RXDB_VERSION,
			createStorageInstance: () => Promise.reject(new Error('disk unavailable')),
		} as unknown as RxStorage<unknown, unknown>;
		expect(await drainLegacyScopeDatabase(ports(broken), identity)).toEqual({
			status: 'failed',
			databaseName: legacyName,
			error: 'disk unavailable',
		});
	});
});

describe('a drainable-generation product acknowledgment', () => {
	it('is written in the shape the v5 schema allows (no tagIds), with schema validation on', async () => {
		const server = createFakeWriteServer({ firstId: 601 });
		const recordId = '17400000-0000-4000-8000-0000000006aa';
		const payload = {
			name: 'Legacy product',
			type: 'simple',
			price: '12.50',
			stock_status: 'instock',
			stock_quantity: null,
			meta_data: [{ key: '_woocommerce_pos_uuid', value: recordId }],
		};
		const legacy = await createEngineHarness({
			storage: memoryEngineStorage(),
			mode: 'manual',
			fetch: async (url: string, init?: RequestInit) =>
				url.includes('/push/') ? server.fetch(url, init as never) : Response.json([]),
			ports: { scopeDatabaseGeneration: DRAINABLE_SCOPE_DATABASE_GENERATION },
		});
		try {
			// A born-local v5 product: the v5 columns, and no tagIds (v6 promoted it).
			await legacy.collection('products').insert({
				uuid: recordId,
				remoteId: null,
				remoteKey: '',
				payload,
				sync: { revision: '', partial: false, source: 'local' },
				local: { dirty: false, pendingMutationIds: [] },
				price: 12.5,
				sortName: '',
				stockStatus: 'instock',
				type: 'simple',
				categoryIds: [],
				brandIds: [],
				onSale: false,
				featured: false,
				stockQuantity: null,
			});
			await legacy.engine.write({ collection: 'products', operation: 'create', recordId, payload });

			expect(await legacy.engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				failed: 0,
				rejected: 0,
			});
			const acked = (await legacy
				.collection('products')
				.findOne(recordId)
				.exec())!.toJSON() as Json;
			expect(acked.remoteId).not.toBeNull();
			expect(acked).not.toHaveProperty('tagIds');
			expect(acked.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
			expect((await legacy.collection('mutations').find().exec()).length).toBe(0);
		} finally {
			await legacy.dispose();
		}
	}, 30_000);

	it('a discarded v5 product dead letter restores the server document in the v5 shape (no tagIds)', async () => {
		const recordId = '17400000-0000-4000-8000-0000000006cc';
		const meta = [{ key: '_woocommerce_pos_uuid', value: recordId }];
		const server = {
			id: 602,
			name: 'Server truth',
			type: 'simple',
			price: '9.00',
			stock_status: 'instock',
			stock_quantity: null,
			tags: [{ id: 4 }],
			meta_data: meta,
		};
		const legacy = await createEngineHarness({
			storage: memoryEngineStorage(),
			mode: 'manual',
			fetch: async (url: string) =>
				new URL(url).pathname.endsWith('/products') ? Response.json([server]) : Response.json([]),
			ports: { scopeDatabaseGeneration: DRAINABLE_SCOPE_DATABASE_GENERATION },
		});
		try {
			await legacy.collection('products').insert({
				uuid: recordId,
				remoteId: remoteId(602),
				remoteKey: String(remoteId(602)),
				payload: { ...server, name: 'Local edit', tags: [] },
				sync: { revision: 'sha256:r1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
				price: 9,
				sortName: '',
				stockStatus: 'instock',
				type: 'simple',
				categoryIds: [],
				brandIds: [],
				onSale: false,
				featured: false,
				stockQuantity: null,
			});
			await legacy.collection('mutations').insert({
				mutationId: '17400000-0000-4000-8000-0000000006cd',
				collectionName: 'products',
				operation: 'update',
				recordId,
				origin: 'existing',
				payload: { name: 'Local edit' },
				baseRevision: 'sha256:r1',
				queuedAt: '2026-09-30T08:00:00.000Z',
				seq: 1,
				status: 'rejected',
				rejectedStatus: 400,
				rejectedReason: 'rest_invalid_param',
			});

			await legacy.engine.resolveConflict('17400000-0000-4000-8000-0000000006cd', 'discard');
			const restored = (await legacy
				.collection('products')
				.findOne(recordId)
				.exec())!.toJSON() as Json;
			expect(restored).not.toHaveProperty('tagIds');
			expect((restored.payload as Json).name).toBe('Server truth');
			expect((await legacy.collection('mutations').find().exec()).length).toBe(0);
		} finally {
			await legacy.dispose();
		}
	}, 30_000);
});
