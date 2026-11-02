// @vitest-environment node
/**
 * ADR 0040 PR A (Paul's ruling): a queue written by a protocol-2 till is PARKED in its own
 * generation (6), never sent and never carried over; only its receipt print counts move, so an
 * order already printed on this till still prints as a COPY after the re-sync. A failed carry is
 * retried, and only the carry. An empty queue removes generation 6 once its counts are carried.
 *
 * Every case runs on the real generation constants, with generation 6 written through the
 * schemas it shipped (`drainableGenerationCollectionCreators`); the rxdb 17.4.0 fixture under
 * `upgrade-fixtures/rxdb-17.4.0-pending-orders/` pins that the probe still opens a database an
 * older rxdb wrote.
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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase, RXDB_VERSION, type RxStorage } from 'rxdb';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { getRxStorageSQLite, getSQLiteBasicsNodeNative } from 'rxdb-premium/plugins/storage-sqlite';

import {
	DRAINABLE_SCOPE_DATABASE_GENERATION,
	SCOPE_DATABASE_GENERATION,
	scopeDatabaseName,
	type StoreScopeIdentity,
} from '@wcpos/sync-core';

import { drainableGenerationCollectionCreators } from './collections/drainable-generation';
import { createEngineHarness, type EngineHarness, memoryEngineStorage, remoteId } from './testing';
import { queueFor } from './write-path/write-intents';
import {
	drainLegacyScopeDatabase,
	type LegacyScopeDrainPorts,
} from './write-path/legacy-scope-drain';
import {
	EngineOrderRepository,
	RESYNC_RECEIPT_PRINT_COUNTS_ID,
} from './write-path/engine-order-repository';

const require = createRequire(import.meta.url);
const { getRxStorageFilesystemNode } =
	require('rxdb-premium/plugins/storage-filesystem-node') as typeof import('rxdb-premium/plugins/storage-filesystem-node');

setPremiumFlag();
afterEach(createEngineHarness.disposeTrackedEngines);

type Json = Record<string, unknown>;

// One scope per test: the memory storage outlives a test.
let identity: StoreScopeIdentity;
let scopes = 0;
let work: string | undefined;
beforeEach(() => {
	scopes += 1;
	identity = { ...baseIdentity, site: `https://parked-${scopes}.example.test` };
});
afterEach(() => {
	if (work) rmSync(work, { recursive: true, force: true });
	work = undefined;
});
const baseIdentity: StoreScopeIdentity = {
	site: 'https://parked.example.test',
	storeId: 1,
	cashierId: 7,
};
const legacyName = () =>
	scopeDatabaseName(identity, { generation: DRAINABLE_SCOPE_DATABASE_GENERATION });
const PRINTED = '00000000-0000-4000-8000-0000000000a1';
const CART = '00000000-0000-4000-8000-0000000000a2';
const order = (uuid: string, id: number, status: string, local: Json) => ({
	uuid,
	remoteId: id ? remoteId(id) : null,
	remoteKey: id ? String(remoteId(id)) : '',
	posUserId: '7',
	posStoreId: '1',
	number: String(id),
	dateCreatedGmt: '2026-10-19T10:00:00',
	status,
	total: '10.00',
	customerId: 0,
	payload: {
		id,
		status,
		total: '10.00',
		meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }],
	},
	sync: { revision: 'sha256:r1', partial: false, source: 'woo-rest' },
	local: { dirty: false, pendingMutationIds: [], ...local },
});
/** The printed order as a pull lands it in generation 7: no print count of its own. */
const synced = () => order(PRINTED, 41, 'completed', {});
const deadLetter = {
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
};

/** Writes the generation-6 database through the schemas generation 6 shipped. */
async function writeGeneration6(
	storage: RxStorage<unknown, unknown>,
	write: (db: RxDatabase) => Promise<unknown>,
	collections: string[] = ['recordMutations', 'orders']
): Promise<void> {
	const creators = drainableGenerationCollectionCreators();
	const db = await createRxDatabase({ name: legacyName(), storage, multiInstance: false });
	try {
		await db.addCollections(
			Object.fromEntries(collections.map((name) => [name, creators[name]])) as never
		);
		await write(db);
	} finally {
		await db.close();
	}
}

/** A protocol-2 till's generation-6 database: a printed synced order, an offline cash update, a held cart. */
function protocol2Database(storage: RxStorage<unknown, unknown>) {
	return writeGeneration6(storage, async (db) => {
		await db.collections.orders!.bulkInsert([
			order(PRINTED, 41, 'pending', {
				receiptPrintCount: 2,
				dirty: true,
				pendingMutationIds: ['m1'],
			}),
			order(CART, 0, 'pos-open', { dirty: true, pendingMutationIds: ['m2'] }),
		]);
		const queue = queueFor(db);
		await queue.enqueue({
			mutationId: 'm1',
			collectionName: 'orders',
			operation: 'update',
			recordId: PRINTED,
			origin: 'existing',
			// A protocol-2 offline tender: a ledger row and a copied status protocol 3 would replay.
			payload: {
				id: 41,
				status: 'completed',
				meta_data: [{ key: '_wcpos_payments', value: 'offline' }],
			},
			baseRevision: 'sha256:r1',
			queuedAt: '2026-10-19T10:00:00.000Z',
		});
		await queue.enqueue({
			mutationId: 'm2',
			collectionName: 'orders',
			operation: 'create',
			recordId: CART,
			origin: 'minted',
			payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: CART }] },
			baseRevision: null,
			queuedAt: '2026-10-19T10:01:00.000Z',
		});
	});
}

/** Generation 6 with nothing unsent: one synced order whose receipt was printed twice. */
const printedTwice = (storage: RxStorage<unknown, unknown>) =>
	writeGeneration6(storage, (db) =>
		db.collections.orders!.insert(order(PRINTED, 41, 'completed', { receiptPrintCount: 2 }))
	);

const appOn = (storage: RxStorage<unknown, unknown>) =>
	createEngineHarness({ identity, storage, mode: 'manual' });

async function residentLocal(app: EngineHarness): Promise<Json> {
	const resident = await app.collection('orders').findOne(PRINTED).exec();
	return (resident!.toJSON() as { local: Json }).local;
}

async function stashedCounts(app: EngineHarness): Promise<Json | undefined> {
	const stash = await app.collection('orders').getLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID);
	return stash?.get('counts') as Json | undefined;
}

it('generation 7 is the first protocol-3 generation, so the drainable one (6) is protocol 2', () => {
	expect(
		SCOPE_DATABASE_GENERATION,
		'a bump past 7 leaves a protocol-3 queue behind: rebuild the drain the legacy-scope-drain.ts header names'
	).toBe(7);
	expect(DRAINABLE_SCOPE_DATABASE_GENERATION).toBe(6);
});

it('the protocol-2 queue stays parked while an already-printed synchronized order keeps its COPY count after the re-sync', async () => {
	const storage = memoryEngineStorage();
	await protocol2Database(storage);
	const app = await appOn(storage);
	// The re-sync already brought the synced order back into generation 7.
	await app.seed('orders', [synced()]);
	const drain: LegacyScopeDrainPorts = { storage, liveEngine: app.engine };

	const outcome = await drainLegacyScopeDatabase(drain, identity);

	expect(outcome).toMatchObject({
		status: 'kept',
		carryError: null,
		remaining: 2,
		keptOrderUuids: [PRINTED, CART].sort(),
	});
	// No cart was carried into generation 7, and the printed order keeps its count there.
	expect(await app.collection('orders').findOne(CART).exec()).toBeNull();
	expect((await residentLocal(app)).receiptPrintCount).toBe(2);
	const printed = (await app.collection('orders').findOne(PRINTED).exec())!.toJSON() as Json;
	expect(printed.status).toBe('completed');
	// A later start parks it again: never a push, never a cart.
	expect(await drainLegacyScopeDatabase(drain, identity)).toMatchObject({
		status: 'kept',
		remaining: 2,
	});
	expect(await app.collection('orders').findOne(CART).exec()).toBeNull();
});

it('a failed print-count carry still parks the protocol-2 queue, and the next start carries the counts without sending or carrying any order work', async () => {
	const storage = memoryEngineStorage();
	await protocol2Database(storage);

	// No live engine to carry into (a scope switch mid-carry): the park and the carry failure are
	// two facts, each reported on its own.
	expect(await drainLegacyScopeDatabase({ storage }, identity)).toMatchObject({
		status: 'kept',
		carryError: 'no live engine to carry them into',
		remaining: 2,
	});

	const app = await appOn(storage);
	expect(
		await drainLegacyScopeDatabase({ storage, liveEngine: app.engine }, identity)
	).toMatchObject({ status: 'kept', carryError: null, remaining: 2 });
	expect(await app.collection('orders').findOne(CART).exec()).toBeNull();
	// The order is not resident yet: its count waits in the stash for the pull that lands it.
	expect(await stashedCounts(app)).toEqual({ [PRINTED]: 2 });
});

it('a local-only open cart with no queue row (an orphan skeleton) parks generation 6 too', async () => {
	const storage = memoryEngineStorage();
	await writeGeneration6(storage, (db) =>
		db.collections.orders!.insert(order(CART, 0, 'pos-open', {}))
	);
	expect(await drainLegacyScopeDatabase({ storage }, identity)).toMatchObject({
		status: 'kept',
		remaining: 1,
		keptOrderUuids: [CART],
	});
});

it('an empty queue (every row acknowledged before the bump) removes generation 6, and the next start finds it absent', async () => {
	const storage = memoryEngineStorage();
	await writeGeneration6(storage, (db) => db.collections.orders!.insert(synced()));
	expect(await drainLegacyScopeDatabase({ storage }, identity)).toEqual({
		status: 'drained',
		databaseName: legacyName(),
		fileRemoved: false,
	});
	expect(await drainLegacyScopeDatabase({ storage }, identity)).toEqual({
		status: 'absent',
		databaseName: legacyName(),
	});
});

describe('POS-local state on a synced order', () => {
	it('an order generation 7 already holds gets the count onto its resident before generation 6 goes', async () => {
		const storage = memoryEngineStorage();
		await printedTwice(storage);
		const app = await appOn(storage);
		await app.seed('orders', [synced()]);
		expect(
			await drainLegacyScopeDatabase({ storage, liveEngine: app.engine }, identity)
		).toMatchObject({ status: 'drained' });
		expect((await residentLocal(app)).receiptPrintCount).toBe(2);
	});

	it('an order a pull materialises between the residency read and the stash write still gets its count', async () => {
		const storage = memoryEngineStorage();
		await printedTwice(storage);
		const app = await appOn(storage);
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
									await new EngineOrderRepository(active.database.collections as never).upsertMany([
										synced() as never,
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
		};
		expect(await drainLegacyScopeDatabase({ storage, liveEngine: racing }, identity)).toMatchObject(
			{ status: 'drained' }
		);
		expect(pulled).toBe(true);
		expect((await residentLocal(app)).receiptPrintCount).toBe(2);
		expect((await stashedCounts(app))?.[PRINTED]).toBeUndefined();
	});

	it('is carried on a pass that keeps generation 6 (a dead letter stays): the stash holds the count', async () => {
		const storage = memoryEngineStorage();
		await writeGeneration6(storage, async (db) => {
			await db.collections.orders!.insert(
				order(PRINTED, 41, 'completed', { receiptPrintCount: 2 })
			);
			await db.collections.recordMutations!.insert(deadLetter);
		});
		const app = await appOn(storage);
		expect(
			await drainLegacyScopeDatabase({ storage, liveEngine: app.engine }, identity)
		).toMatchObject({ status: 'kept', remaining: 1 });
		expect((await stashedCounts(app))?.[PRINTED]).toBe(2);
	});

	it('a pull that snapshotted the resident before the drain carried its count does not lower it', async () => {
		const storage = memoryEngineStorage();
		await printedTwice(storage);
		const app = await appOn(storage);
		await app.seed('orders', [synced()]);
		const { database } = await app.engine.whenActive();
		const realOrders = database.collections.orders!;
		// The pull reads the resident (no count), then the drain carries count 2, then the pull
		// commits its snapshot-based document.
		let drained: Promise<unknown> | null = null;
		const pullOrders = new Proxy(realOrders, {
			get(target, property) {
				if (property === 'findByIds') {
					return (ids: string[]) => ({
						exec: async () => {
							const snapshot = await target.findByIds(ids).exec();
							drained ??= drainLegacyScopeDatabase({ storage, liveEngine: app.engine }, identity);
							await drained;
							return snapshot;
						},
					});
				}
				const value = Reflect.get(target, property, target) as unknown;
				return typeof value === 'function' ? value.bind(target) : value;
			},
		});
		const changed = synced();
		await new EngineOrderRepository({
			...database.collections,
			orders: pullOrders,
		} as never).upsertMany([
			{
				...changed,
				payload: { ...changed.payload, customer_note: 'changed on the store' },
			} as never,
		]);
		await expect(drained).resolves.toMatchObject({ status: 'drained' });
		const resident = (await app.collection('orders').findOne(PRINTED).exec())!.toJSON() as {
			payload: Json;
			local: Json;
		};
		expect(resident.payload.customer_note).toBe('changed on the store');
		expect(resident.local.receiptPrintCount).toBe(2);
	});

	it("generation 6's own stash (a resync interrupted before its repull) is carried before generation 6 goes", async () => {
		const storage = memoryEngineStorage();
		// Empty queue, no resident: the count lives only in generation 6's stash.
		await writeGeneration6(storage, (db) =>
			db.collections.orders!.upsertLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID, {
				counts: { [PRINTED]: 3 },
			})
		);
		const app = await appOn(storage);
		// Without a live engine it is kept: the count is not dropped with the database. Nothing is
		// parked: the carry is the only reason.
		expect(await drainLegacyScopeDatabase({ storage }, identity)).toMatchObject({
			status: 'kept',
			carryError: 'no live engine to carry them into',
			remaining: 0,
		});
		expect(
			await drainLegacyScopeDatabase({ storage, liveEngine: app.engine }, identity)
		).toMatchObject({ status: 'drained' });
		expect((await stashedCounts(app))?.[PRINTED]).toBe(3);

		const { database } = await app.engine.whenActive();
		await new EngineOrderRepository(database.collections as never).upsertMany([synced() as never]);
		expect((await residentLocal(app)).receiptPrintCount).toBe(3);
	});

	it('an order generation 7 does not hold yet is stashed, and the count lands when a pull materialises it', async () => {
		const storage = memoryEngineStorage();
		await printedTwice(storage);
		const app = await appOn(storage);
		expect(
			await drainLegacyScopeDatabase({ storage, liveEngine: app.engine }, identity)
		).toMatchObject({ status: 'drained' });
		expect(await stashedCounts(app)).toEqual({ [PRINTED]: 2 });

		// The pull materialises the order: the count is applied once, and the stash entry goes.
		const { database } = await app.engine.whenActive();
		await new EngineOrderRepository(database.collections as never).upsertMany([synced() as never]);
		expect((await residentLocal(app)).receiptPrintCount).toBe(2);
		expect((await stashedCounts(app))?.[PRINTED]).toBeUndefined();
	});
});

describe('failures and file access', () => {
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

	it('with a file listing, a missing database is never opened (no file is created)', async () => {
		work = mkdtempSync(join(tmpdir(), 'legacy-drain-'));
		const outcome = await drainLegacyScopeDatabase(
			{ storage: sqliteIn(work), databaseFiles: filesIn(work) },
			identity
		);
		expect(outcome).toEqual({ status: 'absent', databaseName: legacyName() });
		expect(existsSync(join(work, `${legacyName()}.sqlite`))).toBe(false);
	});

	it('with file access, an emptied database is deleted, not only emptied', async () => {
		work = mkdtempSync(join(tmpdir(), 'legacy-drain-'));
		const storage = sqliteIn(work);
		await writeGeneration6(storage, async () => undefined, ['recordMutations']);
		expect(existsSync(join(work, `${legacyName()}.sqlite`))).toBe(true);

		expect(
			await drainLegacyScopeDatabase({ storage, databaseFiles: filesIn(work) }, identity)
		).toEqual({ status: 'drained', databaseName: legacyName(), fileRemoved: true });
		expect(existsSync(join(work, `${legacyName()}.sqlite`))).toBe(false);
	});

	it('parks a queue even when the database holds no orders collection', async () => {
		work = mkdtempSync(join(tmpdir(), 'legacy-drain-'));
		const storage = sqliteIn(work);
		await writeGeneration6(storage, (db) => db.collections.recordMutations!.insert(deadLetter), [
			'recordMutations',
		]);

		expect(await drainLegacyScopeDatabase({ storage }, identity)).toEqual({
			status: 'kept',
			databaseName: legacyName(),
			carryError: null,
			remaining: 1,
			keptOrderUuids: [],
		});
	});

	it('a database the drainable schemas cannot open is failed, not kept', async () => {
		work = mkdtempSync(join(tmpdir(), 'legacy-drain-'));
		const storage = sqliteIn(work);
		// Orders written with a schema generation 6 never shipped, at the same version: opening it
		// as generation 6 throws DB6.
		const creators = drainableGenerationCollectionCreators();
		const orders = creators.orders as { schema: { properties: Json } };
		const db = await createRxDatabase({ name: legacyName(), storage, multiInstance: false });
		await db.addCollections({
			recordMutations: creators.recordMutations,
			orders: {
				...orders,
				schema: {
					...orders.schema,
					properties: { ...orders.schema.properties, foreign: { type: 'string' } },
				},
			},
		} as never);
		await db.close();

		const outcome = await drainLegacyScopeDatabase({ storage }, identity);
		expect(outcome).toMatchObject({ status: 'failed', databaseName: legacyName() });
		expect(outcome.status === 'failed' && outcome.error).toMatch(/DB6/);
	});

	it('a storage that cannot open is failed, not kept', async () => {
		const broken = {
			name: 'broken',
			rxdbVersion: RXDB_VERSION,
			createStorageInstance: () => Promise.reject(new Error('disk unavailable')),
		} as unknown as RxStorage<unknown, unknown>;
		expect(await drainLegacyScopeDatabase({ storage: broken }, identity)).toEqual({
			status: 'failed',
			databaseName: legacyName(),
			error: 'disk unavailable',
		});
	});
});

/**
 * The fixture was WRITTEN by the real rxdb / rxdb-premium 17.4.0 engine
 * (`manifest.writer.sourceCommit`) on both storages: a till that closed with unsent sales, a
 * failed push in backoff, a dead drain's expired claim, a held open cart, a dead letter and a
 * parked conflict. Each run restores a fresh COPY under this build's drainable name; its
 * `recordMutations-5` queue is migrated to today's queue schema version as the probe opens it.
 */
const FIXTURE = fileURLToPath(
	new URL('./upgrade-fixtures/rxdb-17.4.0-pending-orders/', import.meta.url)
);
const manifest = JSON.parse(readFileSync(join(FIXTURE, 'manifest.json'), 'utf8')) as {
	writer: { rxdb: string };
	identity: StoreScopeIdentity;
	databaseName: string;
	orders: { uuid: string }[];
};
const fixtureName = scopeDatabaseName(manifest.identity, {
	generation: DRAINABLE_SCOPE_DATABASE_GENERATION,
});
const STORAGES: [string, (dir: string) => RxStorage<unknown, unknown>][] = [
	[
		'filesystem-node',
		(dir) => {
			const files = JSON.parse(
				readFileSync(join(FIXTURE, 'filesystem-node.json'), 'utf8')
			) as Record<string, string>;
			for (const [path, text] of Object.entries(files)) {
				const restored = join(dir, path.replace(manifest.databaseName, fixtureName));
				mkdirSync(dirname(restored), { recursive: true });
				writeFileSync(restored, text);
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
			basics.open = async (name: string) =>
				open(name === fixtureName ? file : join(dir, `${name}.sqlite`));
			return getRxStorageSQLite({ sqliteBasics: basics }) as RxStorage<unknown, unknown>;
		},
	],
];

describe.each(STORAGES)('a database rxdb 17.4.0 wrote (%s)', (_name, restore) => {
	it("is probed with today's rxdb: its queue and orders open, and the queue parks", async () => {
		expect(String(RXDB_VERSION)).not.toBe(manifest.writer.rxdb);
		work = mkdtempSync(join(tmpdir(), 'rxdb-upgrade-parking-'));
		const storage = restore(work);
		expect(await drainLegacyScopeDatabase({ storage }, manifest.identity)).toEqual({
			status: 'kept',
			databaseName: fixtureName,
			carryError: null,
			// Four sendable rows (one a dead drain's expired claim), the held cart, a dead letter and
			// a parked conflict: none of it is sent.
			remaining: 7,
			keptOrderUuids: manifest.orders.map((order) => order.uuid).sort(),
		});
		// The next start reopens it the same way, and parks it again.
		expect(await drainLegacyScopeDatabase({ storage }, manifest.identity)).toMatchObject({
			status: 'kept',
			remaining: 7,
		});
	}, 30_000);
});
