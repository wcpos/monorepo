/**
 * Drain a scope's DRAINABLE-generation database before it is removed.
 *
 * A scope generation bump (`SCOPE_DATABASE_GENERATION`) opens a fresh
 * database; the previous generation's database keeps whatever the till had
 * not sent — closed-but-unsent sales above all. Nothing else will ever read
 * that database again, so its pending mutations are pushed HERE, exactly once,
 * through the current write path: the database is opened by a manual-mode
 * engine with the schemas that generation shipped
 * (`collections/drainable-generation.ts`), one `write-drain` tick sends the
 * queue in seq order (the same lane, acks, claim leases and server-side
 * mutationId dedupe as a live till), and the database is removed ONLY when its
 * queue is then empty. Anything left — a retryable failure, a row backing off,
 * an open cart's held edits, a dead letter, a parked conflict — keeps it in
 * place for a later start, and the outcome counts what is left (ruled: a
 * cashier's in-progress cart is live work, and a dead letter or conflict is
 * never deleted silently alongside it).
 *
 * Bounded on purpose: one scope, one legacy generation, one tick. A database
 * whose queue is empty is removed without opening an engine at all.
 */

import {
	createRxDatabase,
	getAllCollectionDocuments,
	removeRxDatabase,
	type RxDatabase,
	type RxStorage,
} from 'rxdb';

import {
	DRAINABLE_SCOPE_DATABASE_GENERATION,
	recordMutationQueueMigrationStrategies,
	recordMutationQueueSchema,
	scopeDatabaseName,
	type StoreScopeIdentity,
} from '@wcpos/sync-core';

import { MUTATION_QUEUE_RXDB_COLLECTION } from '../collections/engine-collections';
import {
	createRxdbSyncEngine,
	type EngineFetcher,
	type RxdbSyncEngine,
	type RxdbSyncEnginePorts,
} from '../create-rxdb-sync-engine';

/** The host ports a drain needs — the live engine's, minus everything a one-tick drain never arms. */
export type LegacyScopeDrainPorts = Pick<
	RxdbSyncEnginePorts,
	'site' | 'storage' | 'fetcher' | 'connectivity' | 'multiInstance' | 'uuid' | 'now'
>;

export type LegacyScopeDrainOutcome =
	/** No drainable-generation database exists for this scope. */
	| { status: 'absent'; databaseName: string }
	/** Every queued mutation was sent (or there were none) and the database is removed. */
	| { status: 'drained'; databaseName: string; pushed: number }
	/**
	 * Unsent work is left — the database stays for a later start. `remaining` counts
	 * the queue rows still there, by kind, when the drain ran.
	 */
	| {
			status: 'kept';
			databaseName: string;
			reason: string;
			pushed?: number;
			remaining?: Record<string, number>;
	  };

/**
 * An expired session is a property of THIS start, not a verdict on the sale:
 * the write path dead-letters a permanent 4xx, so a 401 reaching it would
 * strand every legacy mutation as 'rejected' — removable, and never re-sent.
 * The drain turns it into a retryable transport failure instead, which keeps
 * the database. (The host's fetcher already refreshes a renewable session; a
 * 401 that gets here is one it could not renew. A 403 stays a verdict: a
 * cashier without the capability is refused on every start.)
 */
const SESSION_REFUSED_STATUS = 401;

function storageFor(
	ports: LegacyScopeDrainPorts,
	identity: StoreScopeIdentity
): RxStorage<unknown, unknown> {
	return typeof ports.storage === 'function' ? ports.storage(identity) : ports.storage;
}

/**
 * How many queue rows a drainable database holds: null when it holds no
 * collections at all (it did not exist — the probe just created it), 0 when it
 * has no queue.
 */
async function queuedRows(database: RxDatabase): Promise<number | null> {
	const collections = await getAllCollectionDocuments(database.internalStore);
	if (collections.length === 0) return null;
	if (!collections.some((doc) => doc.data.name === MUTATION_QUEUE_RXDB_COLLECTION)) return 0;
	// The queue schema is unchanged across the bump, so it opens alone, beside nothing else.
	await database.addCollections({
		[MUTATION_QUEUE_RXDB_COLLECTION]: {
			schema: recordMutationQueueSchema as never,
			migrationStrategies: recordMutationQueueMigrationStrategies as never,
		},
	});
	return database.collections[MUTATION_QUEUE_RXDB_COLLECTION]!.count().exec();
}

/**
 * The kind of work a queue row still left after a drain is. Once nothing failed
 * or is backing off, a row still `pending` is one the open-cart hold kept back.
 */
const REMAINING_KIND: Record<string, string> = {
	pending: 'held',
	rejected: 'deadLetters',
	conflicted: 'conflicts',
	'needs-revision': 'conflicts',
};

async function remainingWork(database: RxDatabase): Promise<Record<string, number>> {
	const rows = await database.collections[MUTATION_QUEUE_RXDB_COLLECTION]!.find().exec();
	const remaining: Record<string, number> = {};
	for (const row of rows) {
		const status = String((row.toJSON() as { status?: unknown }).status ?? 'pending');
		const kind = REMAINING_KIND[status] ?? status;
		remaining[kind] = (remaining[kind] ?? 0) + 1;
	}
	return remaining;
}

function sessionRefusalIsRetryable(fetcher: EngineFetcher): EngineFetcher {
	return async (url, init) => {
		const response = await fetcher(url, init);
		if (response.status === SESSION_REFUSED_STATUS) {
			throw new Error(`legacy drain: the store refused the session (${response.status})`);
		}
		return response;
	};
}

async function drainWithEngine(
	ports: LegacyScopeDrainPorts,
	identity: StoreScopeIdentity,
	databaseName: string
): Promise<LegacyScopeDrainOutcome> {
	let engine: RxdbSyncEngine | null = null;
	try {
		engine = createRxdbSyncEngine(
			{
				...ports,
				fetcher: sessionRefusalIsRetryable(ports.fetcher),
				mode: 'manual',
				scopeDatabaseGeneration: DRAINABLE_SCOPE_DATABASE_GENERATION,
			},
			identity
		);
		await engine.ready;
		const report = await engine.sync('write-drain');
		if (report.status !== 'ran') {
			return {
				status: 'kept',
				databaseName,
				reason: `write-drain ${report.status}: ${report.reason ?? report.error ?? 'no reason given'}`,
			};
		}
		const failed = report.failed ?? 0;
		const deferred = report.deferred ?? 0;
		if (failed > 0 || deferred > 0) {
			return {
				status: 'kept',
				databaseName,
				reason: `${failed} failed, ${deferred} still backing off`,
			};
		}
		const pushed = report.pushed ?? 0;
		const { database } = await engine.whenActive();
		const remaining = await remainingWork(database as unknown as RxDatabase);
		if (Object.keys(remaining).length > 0) {
			return {
				status: 'kept',
				databaseName,
				reason: 'unsent work is left in the queue',
				pushed,
				remaining,
			};
		}
		await engine.dispose();
		engine = null;
		await removeRxDatabase(databaseName, storageFor(ports, identity), ports.multiInstance ?? false);
		return { status: 'drained', databaseName, pushed };
	} finally {
		// Deliberate swallow: the outcome (or the open failure) already says what happened; a
		// close failure on top of it changes nothing about whether the database stays.
		if (engine !== null) await engine.dispose().catch(() => undefined);
	}
}

/**
 * Send a scope's drainable-generation unsent mutations exactly once, then remove
 * that database; leave it in place whenever the drain did not finish.
 *
 * Never throws: an open or drain failure is a `kept` outcome naming the error.
 *
 * @param ports - The live engine's site, storage, fetcher and connectivity.
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
	try {
		// Opening a missing database creates an empty one; it is removed again below.
		const probe = await createRxDatabase({
			name: databaseName,
			storage: storageFor(ports, identity),
			multiInstance: ports.multiInstance ?? false,
		});
		let rows: number | null;
		try {
			rows = await queuedRows(probe);
		} catch (error) {
			await probe.close();
			throw error;
		}
		if (rows === null || rows === 0) {
			const existed = rows !== null;
			await probe.remove();
			return existed
				? { status: 'drained', databaseName, pushed: 0 }
				: { status: 'absent', databaseName };
		}
		await probe.close();
		return await drainWithEngine(ports, identity, databaseName);
	} catch (error) {
		return {
			status: 'kept',
			databaseName,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}
