/**
 * Probe, park, carry print counts, remove when empty: a scope's DRAINABLE-generation database.
 * Push and open-cart carry-over retired 2026-10-24 (C10 slice 3); the protocol-2 drain is at 2017d7b901.
 */

import {
	createRxDatabase,
	getAllCollectionDocuments,
	removeRxDatabase,
	type RxCollection,
	type RxDatabase,
	type RxStorage,
} from 'rxdb';

import {
	DRAINABLE_SCOPE_DATABASE_GENERATION,
	isInternalRow,
	type QueuedMutation,
	remoteIdOrNull,
	scopeDatabaseName,
	scopeKeyFor,
	type StoreScopeIdentity,
} from '@wcpos/sync-core';

import { MUTATION_QUEUE_RXDB_COLLECTION } from '../collections/engine-collections';
import { drainableGenerationCollectionCreators } from '../collections/drainable-generation';
import { findAllUncached } from '../collections/find-all-uncached';
import { type RxdbSyncEngine, type RxdbSyncEnginePorts } from '../create-rxdb-sync-engine';
import {
	applyStashedPrintCounts,
	RESYNC_RECEIPT_PRINT_COUNTS_ID,
	stashPrintCounts,
} from './engine-order-repository';
import { OPEN_CART_ORDER_STATUS } from './open-cart-hold';

/** The files a drainable database occupies, where the platform can see them (native). */
export type LegacyScopeDatabaseFiles = {
	/** True when the database's file exists — answered WITHOUT opening it. */
	exists(databaseName: string): Promise<boolean>;
	/** Delete its file and sidecars once rxdb has closed and dropped it. */
	remove(databaseName: string): Promise<unknown>;
};

export type LegacyScopeDrainPorts = Pick<RxdbSyncEnginePorts, 'storage' | 'multiInstance'> & {
	/**
	 * File-level existence and deletion. Absent (web sahpool, Electron IPC): the
	 * database is opened to check, and a removal drops its tables while the file
	 * itself remains.
	 */
	databaseFiles?: LegacyScopeDatabaseFiles | null;
	liveEngine?: Pick<RxdbSyncEngine, 'whenActive'>;
};

export type LegacyScopeDrainOutcome =
	/** No drainable-generation database exists for this scope. */
	| { status: 'absent'; databaseName: string }
	/**
	 * The queue was empty (or there was none), and the
	 * database is removed. `fileRemoved` is false where the platform cannot delete
	 * files: its tables are dropped, its file remains.
	 */
	| {
			status: 'drained';
			databaseName: string;
			fileRemoved: boolean;
	  }
	/** Parked work, or a print count with nowhere to go yet, keeps the database. */
	| {
			status: 'kept';
			databaseName: string;
			carryError: string | null;
			remaining: number;
			/**
			 * The orders whose queue rows are left (sendable or not) — what a reader that
			 * would give up on an order for "not being here" asks about.
			 */
			keptOrderUuids: string[];
	  }
	/** The database could not be checked or opened — nothing was sent or removed. */
	| { status: 'failed'; databaseName: string; error: string };

type Classified = {
	total: number;
	/** The orders the rows left belong to, sorted. */
	orderUuids: string[];
};

function storageFor(
	ports: LegacyScopeDrainPorts,
	identity: StoreScopeIdentity
): RxStorage<unknown, unknown> {
	return typeof ports.storage === 'function' ? ports.storage(identity) : ports.storage;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function queueOf(database: RxDatabase): RxCollection {
	return database.collections[MUTATION_QUEUE_RXDB_COLLECTION]!;
}

async function classify(database: RxDatabase): Promise<Classified> {
	const rows = (await findAllUncached(queueOf(database)))
		.map((doc) => doc.toJSON() as QueuedMutation)
		.filter((row) => !isInternalRow(row));
	const orders = database.collections.orders;
	// ORPHAN SKELETONS: a till killed between inserting a new cart's order and enqueueing its
	// create leaves a local-only open order with NO queue row (the app recovers it as an
	// `orphanedSkeleton` on the next add). An empty queue is not "nothing unsent" while one
	// exists: it is a cart, counted as held, and it keeps the database.
	const queued = new Set(rows.map((row) => row.recordId));
	const orphans: Record<string, unknown>[] = orders
		? (await orders.find({ selector: { status: OPEN_CART_ORDER_STATUS } }).exec())
				.map((doc) => doc.toJSON() as Record<string, unknown>)
				.filter(
					(order) => !queued.has(String(order.uuid)) && remoteIdOrNull(order.remoteId) === null
				)
		: [];
	const orderUuids = [
		...new Set([
			...rows.filter((row) => row.collectionName === 'orders').map((row) => row.recordId),
			...orphans.map((order) => String(order.uuid)),
		]),
	].sort();
	return { total: rows.length + orphans.length, orderUuids };
}

/**
 * POS-LOCAL STATE on a synced order is carried, never dropped with the old database. The order
 * resident's `local` holds sync bookkeeping (`dirty`, `pendingMutationIds` — meaningless once the
 * queue is empty) and one piece of state the till alone owns: `receiptPrintCount`, which labels
 * the next receipt a COPY and numbers it (`use-receipt-document.ts`). Dropping it would make the
 * first receipt printed after the bump an "original" again. So, before the database is removed:
 * an order the live database already holds gets the larger of the two counts on its resident; any
 * other is stashed in the live orders collection's print-count document
 * (`RESYNC_RECEIPT_PRINT_COUNTS_ID`), which the pull's materialisation applies once when that
 * order lands, then deletes.
 */
async function carryPosLocalState(
	ports: LegacyScopeDrainPorts,
	identity: StoreScopeIdentity,
	legacy: RxDatabase
): Promise<{ error: string | null }> {
	const legacyOrders = legacy.collections.orders;
	if (!legacyOrders) return { error: null };
	const counts = new Map<string, number>();
	const keep = (uuid: string, count: unknown) => {
		if (typeof count === 'number' && count > 0)
			counts.set(uuid, Math.max(counts.get(uuid) ?? 0, count));
	};
	for (const doc of await findAllUncached(legacyOrders)) {
		const order = doc.toJSON() as { uuid: string; local?: { receiptPrintCount?: unknown } };
		keep(order.uuid, order.local?.receiptPrintCount);
	}
	// v5's OWN print-count stash: a v5 resync interrupted after it stashed counts and removed the
	// orders, before the repull, holds them only there.
	const legacyStash = (await legacyOrders.getLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID))?.get(
		'counts'
	) as Record<string, unknown> | undefined;
	for (const [uuid, count] of Object.entries(legacyStash ?? {})) keep(uuid, count);
	if (counts.size === 0) return { error: null };
	const live = ports.liveEngine;
	if (!live) return { error: 'no live engine to carry them into' };
	try {
		const active = await live.whenActive();
		if (scopeKeyFor(active.identity) !== scopeKeyFor(identity)) {
			return { error: 'the live engine is on another scope' };
		}
		const liveOrders = active.database.collections.orders;
		if (!liveOrders) return { error: 'the live database has no orders' };
		// One writer path for print counts — the repository's: stash every count (atomic, larger
		// wins), then have the repository apply what is stashed to the orders already resident (their
		// own incremental write, never lowering a count). A pull's commit applies the rest when it
		// materialises those orders. The drain never writes a resident itself.
		await stashPrintCounts(liveOrders as never, Object.fromEntries(counts));
		await applyStashedPrintCounts(liveOrders as never, [...counts.keys()]);
		return { error: null };
	} catch (error) {
		return { error: errorMessage(error) };
	}
}

/** The `kept` reason of a queue written before protocol 3: parked, never sent (ADR 0040). */
export const WRITTEN_BEFORE_PROTOCOL_3 = 'written-before-protocol-3';

/**
 * Park a protocol-2 queue (Paul's ruling, ADR 0040 PR A): nothing is pushed and no cart is carried
 * over, but the receipt print counts are, so an order printed on this till still prints a COPY
 * after the re-sync. A failed carry waits for the next start and never hides the park.
 */
async function settle(
	ports: LegacyScopeDrainPorts,
	identity: StoreScopeIdentity,
	databaseName: string,
	database: RxDatabase,
	before: Classified
): Promise<LegacyScopeDrainOutcome> {
	const localState = await carryPosLocalState(ports, identity, database);
	if (before.total === 0 && localState.error === null) {
		await database.close();
		await removeRxDatabase(databaseName, storageFor(ports, identity), ports.multiInstance ?? false);
		return { status: 'drained', databaseName, fileRemoved: await removeFiles(ports, databaseName) };
	}
	await database.close();
	return {
		status: 'kept',
		databaseName,
		carryError: localState.error,
		remaining: before.total,
		keptOrderUuids: before.orderUuids,
	};
}

async function removeFiles(ports: LegacyScopeDrainPorts, databaseName: string): Promise<boolean> {
	if (!ports.databaseFiles) return false;
	await ports.databaseFiles.remove(databaseName);
	return true;
}

/**
 * Never throws: a check or open failure is a `failed` outcome naming the error.
 *
 * @param identity - The scope whose previous-generation database is drained.
 * @returns What happened to that database — the host logs one line per outcome.
 */
export async function drainLegacyScopeDatabase(
	ports: LegacyScopeDrainPorts,
	identity: StoreScopeIdentity
): Promise<LegacyScopeDrainOutcome> {
	const databaseName = scopeDatabaseName(identity, {
		generation: DRAINABLE_SCOPE_DATABASE_GENERATION,
	});
	let probe: RxDatabase | null = null;
	try {
		// Where the platform can list files, a missing database is never opened (opening creates one).
		if (ports.databaseFiles && !(await ports.databaseFiles.exists(databaseName))) {
			return { status: 'absent', databaseName };
		}
		probe = await createRxDatabase({
			name: databaseName,
			storage: storageFor(ports, identity),
			multiInstance: ports.multiInstance ?? false,
		});
		const stored = new Set(
			(await getAllCollectionDocuments(probe.internalStore)).map((doc) => doc.data.name)
		);
		if (!stored.has(MUTATION_QUEUE_RXDB_COLLECTION)) {
			// Nothing was ever queued here (or, opened to check, it did not exist at all).
			const opened = probe;
			probe = null;
			await opened.remove();
			const fileRemoved = await removeFiles(ports, databaseName);
			return stored.size === 0
				? { status: 'absent', databaseName }
				: { status: 'drained', databaseName, fileRemoved };
		}
		// The queue and orders schemas are unchanged across the bump: they open alone, beside nothing else.
		const creators = drainableGenerationCollectionCreators();
		await probe.addCollections({
			[MUTATION_QUEUE_RXDB_COLLECTION]: creators[MUTATION_QUEUE_RXDB_COLLECTION] as never,
			...(stored.has('orders') ? { orders: creators.orders as never } : {}),
		});
		return await settle(ports, identity, databaseName, probe, await classify(probe));
	} catch (error) {
		if (probe !== null) await probe.close().catch(() => undefined);
		return { status: 'failed', databaseName, error: errorMessage(error) };
	}
}
