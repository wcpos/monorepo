/**
 * The one writer of an order resident's revision facts (ADR 0040 §1.3): `sync.revision`, the
 * stamp the next push goes out under, and `sync.adopted = { revision, at }`, which certifies a
 * whole-document adoption and is bound to the revision adopted. A naked stamp (`stampedSync`:
 * the 428 refresh, a manual rebase, an ack withheld for a queued successor, a status poll)
 * moves the revision and leaves the adoption behind, so the inequality alone revokes the
 * resident's authority; no writer needs to clear it. Readers interpret both through
 * `residentRevision`, and `sync.stamped = { at }`: when the last answer mirrored with a revision
 * arrived (`stamp`; an adoption clears it).
 */

import { type OrderDocument, remoteIdOrNull } from '@wcpos/sync-core';

import type { EngineRequirement, RequirementHandle } from '../require-plane';
import type { RxDatabase } from 'rxdb';

type Fact = { revision: string; at: number };
type WireSync = Partial<OrderDocument['sync']>;
/** An order resident's `sync`: the wire's `SyncMetadata` plus the facts only this module writes. */
export type ResidentSync = WireSync & { adopted?: Fact; stamped?: { at: number } };
type Raw = { revision?: unknown; at?: unknown };
type RevisionFacts = { revision?: unknown; adopted?: Raw; stamped?: Raw };

export interface ResidentRevision {
	readonly revision: string | undefined;
	readonly adopted: Fact | null;
	/** Adopted whole after `at`, whatever stamped the revision since (the pull guard's question). */
	adoptedAfter(at: number): boolean;
	/** An answer stamped its revision after `answeredAt` (the chain's) and the last adoption. */
	polledAfter(answeredAt?: number): boolean;
	/** Adopted whole, under the revision it carries, after `answeredAt` and the last stamp. */
	holdsDocument(answeredAt?: number): boolean;
}

/** One snapshot of `record.sync`. */
export function residentRevision(record: { sync?: unknown } | null | undefined): ResidentRevision {
	const sync = (record?.sync ?? {}) as RevisionFacts;
	const revision = typeof sync.revision === 'string' ? sync.revision : undefined;
	const adopted =
		typeof sync.adopted?.revision === 'string'
			? {
					revision: sync.adopted.revision,
					at: typeof sync.adopted.at === 'number' ? sync.adopted.at : 0,
				}
			: null;
	const stampedAt = typeof sync.stamped?.at === 'number' ? sync.stamped.at : null;
	const adoptedAfter = (at: number) => (adopted?.at ?? -Infinity) > at;
	return {
		revision,
		adopted,
		adoptedAfter,
		polledAfter: (answeredAt) => stampedAt !== null && stampedAt > (answeredAt ?? 0),
		holdsDocument: (answeredAt) =>
			!!revision &&
			adopted?.revision === revision &&
			adoptedAfter(Math.max(answeredAt ?? -Infinity, stampedAt ?? -Infinity)),
	};
}

/** A whole-document adoption: binds `adopted` to the revision `sync` carries (none: unchanged). */
export function adoptedSync<S extends ResidentSync>(sync: S, at: number): S {
	const { revision } = sync;
	if (typeof revision !== 'string' || revision === '') return sync;
	const { stamped: _answered, ...rest } = sync;
	return { ...rest, adopted: { revision, at } } as S;
}

/** A naked stamp: moves the revision and keeps the adoption. */
export function stampedSync<S extends ResidentSync>(sync: S, revision: string): S {
	return { ...sync, revision };
}

/**
 * The resident's own revision facts carried onto a pulled `sync`, so the unchanged-comparison
 * sees only the server's bytes; a document actually written is then adopted (`adoptedSync`).
 * At the write (`at`, the adoption's time), only a stamp that landed since is carried.
 */
export function carriedFacts<S extends ResidentSync>(sync: S, resident: unknown, at?: number): S {
	const { adopted, stamped } = (resident as { sync?: ResidentSync } | undefined)?.sync ?? {};
	if (at !== undefined) return stamped && stamped.at >= at ? { ...sync, stamped } : sync;
	return { ...sync, ...(adopted && { adopted }), ...(stamped && { stamped }) };
}

export interface OrderRevisionDoor {
	/**
	 * A status poll's answer names the store's document now: the next order push goes out under
	 * it (the drain re-stamps baseRevision from `sync.revision`; it never reads the journal's
	 * chain). Returns the revision replaced. Measured: order 115073, dev-next 2026-10-23, a 409
	 * on the cash push after a terminal cancel. Any answer mirrored with a revision stamps too.
	 */
	stamp(
		orderUuid: string,
		revision: string,
		answeredAt: number
	): Promise<{ replaced: string | null }>;
	/** The corrective refresh (re-adopts under an equal stamp): true only when its own task wrote. */
	readopt(wooId: number): Promise<boolean>;
}

export function createOrderRevisionDoor(deps: {
	resolveDatabase: () => Promise<RxDatabase>;
	require: (requirement: EngineRequirement) => RequirementHandle;
}): OrderRevisionDoor {
	return {
		async stamp(orderUuid, revision, answeredAt) {
			const database = await deps.resolveDatabase();
			const resident = await database.collections.orders?.findOne(orderUuid).exec();
			if (!resident) throw new Error(`Engine resident "${orderUuid}" is missing from "orders"`);
			// The guard and the write share one atomic modify over the CURRENT document: an adoption
			// that lands between a snapshot and the write must never be overwritten by the stamp.
			let replaced: string | null = null;
			await resident.incrementalModify((current: Record<string, unknown>) => {
				replaced = null;
				const facts = residentRevision(current);
				// An adoption that landed after this answer wins; an empty revision names nothing.
				if (!revision || (facts.adopted?.at ?? 0) > answeredAt) return current;
				if (facts.revision !== revision) replaced = facts.revision ?? null;
				const sync = stampedSync((current.sync ?? {}) as ResidentSync, revision);
				return { ...current, sync: { ...sync, stamped: { at: answeredAt } } };
			});
			return { replaced };
		},
		async readopt(wooId) {
			const remoteId = remoteIdOrNull(wooId);
			if (remoteId === null) return false;
			let handle: RequirementHandle | undefined;
			try {
				handle = deps.require({
					id: `order-revision:readopt:${wooId}`,
					collection: 'orders',
					kind: 'targeted-records',
					remoteIds: [remoteId],
					forceRefresh: true,
					readopt: true,
				});
				const outcome = await handle.ready;
				// Written unless the local-work guard keeps it; the ids are this requirement's own tasks'.
				return outcome.action === 'fetched' && !!outcome.appliedRecordIds?.includes(remoteId);
			} catch {
				return false;
			} finally {
				handle?.release();
			}
		},
	};
}

/**
 * Orders a corrective refresh re-adopts even when the server's stamp equals the resident's
 * (ADR 0040 §1.3). A naked revision write (the 428 refresh, a manual rebase, a non-adopting
 * ack) can leave the resident stamped with the very revision the server serves; the pull's
 * equal-stamp skip would then keep the stale payload under it. Keyed by the scope database and
 * held only while the refresh that asked for it drains; the local-work guard still applies.
 */
const requested = new WeakMap<object, Map<string, number>>();

export async function withOrderReadopt<T>(
	database: object,
	remoteIds: readonly string[],
	work: () => Promise<T>
): Promise<T> {
	const ids = requested.get(database) ?? new Map<string, number>();
	requested.set(database, ids);
	for (const id of remoteIds) ids.set(id, (ids.get(id) ?? 0) + 1);
	try {
		return await work();
	} finally {
		for (const id of remoteIds) {
			const left = (ids.get(id) ?? 1) - 1;
			if (left > 0) ids.set(id, left);
			else ids.delete(id);
		}
	}
}

export function readoptRequested(database: object, remoteId: unknown): boolean {
	return typeof remoteId === 'string' && (requested.get(database)?.has(remoteId) ?? false);
}
