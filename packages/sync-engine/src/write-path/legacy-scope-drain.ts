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
 * queue is then empty.
 *
 * What is left decides what happens (ruled):
 *  - an OPEN CART the till built locally (a `pos-open` order the server has
 *    never seen, every queued edit still held) is live work the cashier can no
 *    longer reach in the old database. It is CARRIED OVER: the order is copied
 *    into the current database and its create is enqueued there through the
 *    live engine's write path, then it leaves the old one. Nothing else is
 *    carried — in particular a held cart whose order already has a remote id (a
 *    server order reopened for edits) is never carried over or sent: it keeps
 *    the old database (`held`) until Store health can resolve it.
 *  - a retryable failure, a row backing off, or a sendable row the tick could
 *    not reach keeps the database (`kept`, `retryable`) for a later attempt.
 *  - a dead letter or a parked conflict (and the rows queued behind a conflict)
 *    keeps it too (`kept`, not retryable) — never deleted silently. Surfacing
 *    them is Store health's job; the outcome says once a day that they are
 *    there (`reportDue`).
 *
 * Cheap on purpose: where the platform can list files the database's
 * existence is checked without opening it; otherwise the queue (and the
 * orders it may hold back) is opened alone and classified, and the full
 * engine is opened only when a SENDABLE row exists.
 *
 * Bounded: one scope, one legacy generation, one tick.
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
	type QueuedMutation,
	remoteIdOrNull,
	scopeDatabaseName,
	scopeKeyFor,
	type StoreScopeIdentity,
} from '@wcpos/sync-core';

import { MUTATION_QUEUE_RXDB_COLLECTION } from '../collections/engine-collections';
import { drainableGenerationCollectionCreators } from '../collections/drainable-generation';
import {
	createRxdbSyncEngine,
	type EngineEvent,
	type EngineFetcher,
	type RxdbSyncEngine,
	type RxdbSyncEnginePorts,
} from '../create-rxdb-sync-engine';
import { isOpenCartHoldCandidate, OPEN_CART_ORDER_STATUS } from './open-cart-hold';

/** A push outcome the drain's engine reports — what the host logs with its reason. */
export type LegacyScopeDrainWriteEvent = Extract<
	EngineEvent,
	{ type: 'write-rejected' } | { type: 'write-conflict' }
>;

/** The files a drainable database occupies, where the platform can see them (native). */
export type LegacyScopeDatabaseFiles = {
	/** True when the database's file exists — answered WITHOUT opening it. */
	exists(databaseName: string): Promise<boolean>;
	/** Delete its file and sidecars once rxdb has closed and dropped it. */
	remove(databaseName: string): Promise<unknown>;
};

/** The host ports a drain needs — the live engine's, minus everything a one-tick drain never arms. */
export type LegacyScopeDrainPorts = Pick<
	RxdbSyncEnginePorts,
	'site' | 'storage' | 'fetcher' | 'connectivity' | 'multiInstance' | 'uuid' | 'now' | 'diagnostics'
> & {
	/**
	 * File-level existence and deletion. Absent (web sahpool, Electron IPC): the
	 * database is opened to check, and a removal drops its tables while the file
	 * itself remains.
	 */
	databaseFiles?: LegacyScopeDatabaseFiles | null;
	/** The live engine, active on the SAME scope: where an open cart is carried over to. */
	liveEngine?: Pick<RxdbSyncEngine, 'whenActive' | 'write'>;
	/** Every write-rejected / write-conflict the drain's push produces. */
	onWriteEvent?: (event: LegacyScopeDrainWriteEvent) => void;
	/**
	 * Why the host will not let this drain push right now (its session is refused),
	 * or null. The probe is LOCAL, so a blocked drain still checks, classifies,
	 * carries open carts over and reports what it kept — it only opens no engine
	 * and sends nothing. Offline is read from `connectivity` the same way.
	 */
	pushBlockedReason?: string | null;
};

/**
 * Queue rows still left, by kind — only the kinds present:
 *  - `unsent`: sendable rows (pending, claimed, backing off) — a later attempt sends them;
 *  - `held`: an open cart's held edits that were not carried over;
 *  - `deadLetters`: rows the store rejected;
 *  - `conflicts`: parked conflicts AND the rows queued behind one for the same record.
 */
export type LegacyScopeRemainingWork = Partial<
	Record<'unsent' | 'held' | 'deadLetters' | 'conflicts', number>
>;

export type LegacyScopeDrainOutcome =
	/** No drainable-generation database exists for this scope. */
	| { status: 'absent'; databaseName: string }
	/**
	 * Every queued mutation was sent, carried over, or there were none — and the
	 * database is removed. `fileRemoved` is false where the platform cannot delete
	 * files: its tables are dropped, its file remains.
	 */
	| {
			status: 'drained';
			databaseName: string;
			pushed: number;
			carried: number;
			fileRemoved: boolean;
	  }
	/** Unsent work is left — the database stays. */
	| {
			status: 'kept';
			databaseName: string;
			reason: string;
			/** True when a later attempt can make progress (something sendable is left). */
			retryable: boolean;
			pushed: number;
			carried: number;
			remaining: LegacyScopeRemainingWork;
			/**
			 * The orders whose queue rows are left (sendable or not) — what a reader that
			 * would give up on an order for "not being here" asks about.
			 */
			keptOrderUuids: string[];
			/** Un-sendable work is due its once-a-day report (always true when retryable). */
			reportDue: boolean;
	  }
	/** The database could not be checked or opened — nothing was sent or removed. */
	| { status: 'failed'; databaseName: string; error: string };

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

/**
 * Dead letters and conflicts stay in a kept database until Store health
 * resolves them; a start every few minutes must not repeat that line each
 * time. Once a day per scope is enough to keep it visible in the logs.
 */
export const LEGACY_UNSENDABLE_REPORT_INTERVAL_MS = 24 * 60 * 60_000;

/** The kept database's own local document recording when its un-sendable work was last reported. */
const UNSENDABLE_REPORT_LOCAL_ID = 'legacy-drain-unsendable-report';

type QueueRow = QueuedMutation & { claimedBy?: string };

type CarriableCart = {
	recordId: string;
	order: Record<string, unknown>;
	rows: QueueRow[];
};

type Classified = {
	total: number;
	remaining: LegacyScopeRemainingWork;
	/** The orders the rows left belong to, sorted. */
	orderUuids: string[];
	carriable: CarriableCart[];
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

/** A plain, mutable copy: rxdb hands out frozen (dev) and proxied values. */
function plainCopy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function queueOf(database: RxDatabase): RxCollection {
	return database.collections[MUTATION_QUEUE_RXDB_COLLECTION]!;
}

/**
 * What the queue still holds, by kind, and which open carts can be carried
 * over. Mirrors the drain lane's own rules: a conflicted / needs-revision row
 * blocks every later row for its record; an explicit row or a delete releases
 * its record's whole chain; an eligible row is held while its order is open.
 */
async function classify(database: RxDatabase): Promise<Classified> {
	const rows = (await queueOf(database).find().exec())
		.map((doc) => doc.toJSON() as QueueRow)
		.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
	const orders = database.collections.orders;
	const residents = new Map<string, Record<string, unknown>>();
	if (orders) {
		const ids = [
			...new Set(rows.filter((row) => row.collectionName === 'orders').map((row) => row.recordId)),
		];
		for (const [id, doc] of await orders.findByIds(ids).exec()) {
			residents.set(id, doc.toJSON() as Record<string, unknown>);
		}
	}
	const isOpenCart = (recordId: string): boolean =>
		residents.get(recordId)?.status === OPEN_CART_ORDER_STATUS;
	const blocked = new Set(
		rows
			.filter((row) => row.status === 'conflicted' || row.status === 'needs-revision')
			.map((row) => row.recordId)
	);
	const released = new Set(
		rows
			.filter((row) => row.status !== 'rejected')
			.filter((row) => row.explicit === true || row.operation === 'delete')
			.map((row) => row.recordId)
	);
	const remaining: LegacyScopeRemainingWork = {};
	const count = (kind: keyof LegacyScopeRemainingWork) => {
		remaining[kind] = (remaining[kind] ?? 0) + 1;
	};
	const heldByRecord = new Map<string, QueueRow[]>();
	for (const row of rows) {
		if (row.status === 'rejected') count('deadLetters');
		else if (row.status === 'conflicted' || row.status === 'needs-revision') count('conflicts');
		else if (blocked.has(row.recordId)) count('conflicts');
		else if (
			!released.has(row.recordId) &&
			isOpenCartHoldCandidate(row) &&
			isOpenCart(row.recordId)
		) {
			count('held');
			heldByRecord.set(row.recordId, [...(heldByRecord.get(row.recordId) ?? []), row]);
		} else count('unsent');
	}
	const carriable: CarriableCart[] = [];
	for (const [recordId, held] of heldByRecord) {
		const order = residents.get(recordId);
		const chain = rows.filter((row) => row.recordId === recordId);
		// Local-only and never sent: the server has not seen this cart, so a copy
		// cannot be a second sale. Anything else stays where it is.
		const neverSent =
			chain.length === held.length &&
			chain[0]?.operation === 'create' &&
			chain.every((row) => (row.attempts ?? 0) === 0 && row.claimedBy === undefined);
		if (order && neverSent && remoteIdOrNull(order.remoteId) === null) {
			carriable.push({ recordId, order, rows: held });
		}
	}
	const orderUuids = [
		...new Set(rows.filter((row) => row.collectionName === 'orders').map((row) => row.recordId)),
	].sort();
	return { total: rows.length, remaining, carriable, orderUuids };
}

/**
 * Carry each never-sent open cart into the live engine's database: copy the
 * order, enqueue its create through the live write path (so it is `pos-open`
 * there, held exactly as before), then remove it from the drained database.
 * Copy first, remove second: a crash in between leaves the cart in both, and
 * the next drain finds the live copy (with its queued create) and only removes
 * the old one. Returns how many carts moved.
 */
async function carryOverOpenCarts(
	ports: LegacyScopeDrainPorts,
	identity: StoreScopeIdentity,
	legacy: RxDatabase,
	carts: CarriableCart[]
): Promise<{ carried: number; error: string | null }> {
	const live = ports.liveEngine;
	if (!live || carts.length === 0) return { carried: 0, error: null };
	let carried = 0;
	try {
		const active = await live.whenActive();
		// Only into the drained scope's own database: another cashier or store never receives this cart.
		if (scopeKeyFor(active.identity) !== scopeKeyFor(identity)) {
			return { carried: 0, error: 'the live engine is on another scope' };
		}
		const liveOrders = active.database.collections.orders;
		const liveQueue = queueOf(active.database);
		if (!liveOrders || !liveQueue) return { carried: 0, error: 'the live database has no orders' };
		for (const cart of carts) {
			let resident = await liveOrders.findOne(cart.recordId).exec();
			let inserted = false;
			if (!resident) {
				const order = plainCopy(cart.order);
				const local = (order.local ?? {}) as Record<string, unknown>;
				resident = await liveOrders.insert({
					...order,
					local: { ...local, dirty: false, pendingMutationIds: [] },
				});
				inserted = true;
			}
			const liveRows = await liveQueue.find({ selector: { recordId: cart.recordId } }).exec();
			const residentRemoteId = remoteIdOrNull(
				(resident.toJSON() as { remoteId?: unknown }).remoteId
			);
			if (liveRows.length === 0 && residentRemoteId === null) {
				// The held chain coalesced as it would have in the old queue: the create's payload with
				// each later edit layered on, in seq order.
				const payload = Object.assign(
					{},
					...cart.rows.map((row) => plainCopy((row.payload ?? {}) as Record<string, unknown>))
				) as Record<string, unknown>;
				try {
					await live.write({
						collection: 'orders',
						operation: 'create',
						recordId: cart.recordId,
						payload,
					});
				} catch (error) {
					// Leave nothing half-copied: the cart stays (held) in the old database.
					if (inserted) await resident.remove().catch(() => undefined);
					throw error;
				}
			}
			await queueOf(legacy).bulkRemove(cart.rows.map((row) => row.mutationId));
			const legacyOrder = await legacy.collections.orders?.findOne(cart.recordId).exec();
			await legacyOrder?.remove();
			carried += 1;
		}
		return { carried, error: null };
	} catch (error) {
		return { carried, error: errorMessage(error) };
	}
}

/** True when the kept database's un-sendable work has not been reported within the interval; stamps it. */
async function unsendableReportDue(database: RxDatabase, nowMs: number): Promise<boolean> {
	const orders = database.collections.orders;
	if (!orders) return true;
	const stamp = await orders.getLocal(UNSENDABLE_REPORT_LOCAL_ID);
	const last = Number(stamp?.get('at'));
	if (Number.isFinite(last) && nowMs - last < LEGACY_UNSENDABLE_REPORT_INTERVAL_MS) return false;
	await orders.upsertLocal(UNSENDABLE_REPORT_LOCAL_ID, { at: nowMs });
	return true;
}

async function removeFiles(ports: LegacyScopeDrainPorts, databaseName: string): Promise<boolean> {
	if (!ports.databaseFiles) return false;
	await ports.databaseFiles.remove(databaseName);
	return true;
}

/**
 * After a drain (or without one): carry the open carts over, then remove the
 * database when nothing is left, else say what is.
 */
async function settle(input: {
	ports: LegacyScopeDrainPorts;
	identity: StoreScopeIdentity;
	databaseName: string;
	database: RxDatabase;
	/** Closes (without removing) whatever opened `database`. */
	close: () => Promise<unknown>;
	pushed: number;
	/** Why the tick itself left sendable work, when it did. */
	tickProblem: string | null;
}): Promise<LegacyScopeDrainOutcome> {
	const { ports, identity, databaseName, database, pushed } = input;
	const before = await classify(database);
	const carry = await carryOverOpenCarts(ports, identity, database, before.carriable);
	const after = carry.carried > 0 ? await classify(database) : before;
	if (after.total === 0) {
		await input.close();
		await removeRxDatabase(databaseName, storageFor(ports, identity), ports.multiInstance ?? false);
		const fileRemoved = await removeFiles(ports, databaseName);
		return { status: 'drained', databaseName, pushed, carried: carry.carried, fileRemoved };
	}
	const retryable = input.tickProblem !== null || (after.remaining.unsent ?? 0) > 0;
	const reasons = [
		input.tickProblem ??
			(retryable ? 'sendable work is left in the queue' : 'unsent work is left in the queue'),
		...(carry.error !== null ? [`open carts not carried over: ${carry.error}`] : []),
	];
	const reportDue = retryable || (await unsendableReportDue(database, (ports.now ?? Date.now)()));
	await input.close();
	return {
		status: 'kept',
		databaseName,
		reason: reasons.join('; '),
		retryable,
		pushed,
		carried: carry.carried,
		remaining: after.remaining,
		keptOrderUuids: after.orderUuids,
		reportDue,
	};
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
	databaseName: string,
	before: Pick<Classified, 'remaining' | 'orderUuids'>
): Promise<LegacyScopeDrainOutcome> {
	const { databaseFiles: _files, liveEngine: _live, onWriteEvent, ...enginePorts } = ports;
	let engine: RxdbSyncEngine | null = null;
	try {
		engine = createRxdbSyncEngine(
			{
				...enginePorts,
				fetcher: sessionRefusalIsRetryable(ports.fetcher),
				mode: 'manual',
				scopeDatabaseGeneration: DRAINABLE_SCOPE_DATABASE_GENERATION,
			},
			identity
		);
		if (onWriteEvent) {
			engine.events((event) => {
				if (event.type === 'write-rejected' || event.type === 'write-conflict') onWriteEvent(event);
			});
		}
		await engine.ready;
	} catch (error) {
		if (engine !== null) await engine.dispose().catch(() => undefined);
		return { status: 'failed', databaseName, error: errorMessage(error) };
	}
	const opened = engine;
	try {
		const report = await opened.sync('write-drain');
		const failed = report.failed ?? 0;
		const deferred = report.deferred ?? 0;
		const tickProblem =
			report.status !== 'ran'
				? `write-drain ${report.status}: ${report.reason ?? report.error ?? 'no reason given'}`
				: failed > 0 || deferred > 0
					? `${failed} failed, ${deferred} still backing off`
					: null;
		const { database } = await opened.whenActive();
		return await settle({
			ports,
			identity,
			databaseName,
			database: database as unknown as RxDatabase,
			close: () => opened.dispose(),
			pushed: report.pushed ?? 0,
			tickProblem,
		});
	} catch (error) {
		// The database opened and held sendable work: it stays, for a later attempt.
		return {
			status: 'kept',
			databaseName,
			reason: errorMessage(error),
			retryable: true,
			pushed: 0,
			carried: 0,
			remaining: before.remaining,
			keptOrderUuids: before.orderUuids,
			reportDue: true,
		};
	} finally {
		// Deliberate swallow: the outcome already says what happened; a close failure on top of it
		// changes nothing about whether the database stays. (Disposing twice is a no-op.)
		await opened.dispose().catch(() => undefined);
	}
}

/**
 * Send a scope's drainable-generation unsent mutations exactly once, carry its
 * open carts over, then remove that database; leave it in place whenever
 * unsent work is left.
 *
 * Never throws: a check or open failure is a `failed` outcome naming the error;
 * `kept` is only ever real unsent work.
 *
 * @param ports - The live engine's site, storage, fetcher and connectivity, plus
 *   the platform's file access and the live engine itself where available.
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
	let before: Classified;
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
				: { status: 'drained', databaseName, pushed: 0, carried: 0, fileRemoved };
		}
		// The queue and orders schemas are unchanged across the bump: they open alone, beside nothing else.
		const creators = drainableGenerationCollectionCreators();
		await probe.addCollections({
			[MUTATION_QUEUE_RXDB_COLLECTION]: creators[MUTATION_QUEUE_RXDB_COLLECTION] as never,
			...(stored.has('orders') ? { orders: creators.orders as never } : {}),
		});
		before = await classify(probe);
		const blocked =
			ports.connectivity?.() === 'offline'
				? 'write-drain skipped: offline'
				: (ports.pushBlockedReason ?? null);
		if ((before.remaining.unsent ?? 0) === 0 || blocked !== null) {
			// Nothing the engine could send now: no engine. Carry carts over, remove if empty, else count.
			// (`probe` stays set: a failure part-way closes it below; closing twice is a no-op.)
			const opened = probe;
			return await settle({
				ports,
				identity,
				databaseName,
				database: opened,
				close: () => opened.close(),
				pushed: 0,
				tickProblem: blocked !== null && (before.remaining.unsent ?? 0) > 0 ? blocked : null,
			});
		}
		const opened = probe;
		probe = null;
		await opened.close();
	} catch (error) {
		if (probe !== null) await probe.close().catch(() => undefined);
		return { status: 'failed', databaseName, error: errorMessage(error) };
	}
	return drainWithEngine(ports, identity, databaseName, before);
}
