/**
 * The one writer of an order resident's revision facts (ADR 0040 §1.3): `sync.revision`, the
 * stamp the next push goes out under, and `sync.adopted = { revision, at }`, which certifies a
 * whole-document adoption and is bound to the revision adopted. A naked stamp (`stampedSync`:
 * the 428 refresh, a manual rebase, an ack withheld for a queued successor, a status poll)
 * moves the revision and leaves the adoption behind, so the inequality alone revokes the
 * resident's authority; no writer needs to clear it. Readers interpret both through
 * `residentRevision`.
 */

import type { RxDatabase } from 'rxdb';

type RevisionFacts = { revision?: unknown; adopted?: { revision?: unknown; at?: unknown } };

export interface ResidentRevision {
	readonly revision: string | null;
	readonly adopted: { revision: string; at: number } | null;
	/** Adopted whole, under the revision it carries, and after `answeredAt` when one is given. */
	holdsDocument(answeredAt?: number): boolean;
}

/** One snapshot of `record.sync`. Any object: a reader's own record type need not name `sync`. */
export function residentRevision(record: object | null | undefined): ResidentRevision {
	const sync = ((record as { sync?: unknown } | null | undefined)?.sync ?? {}) as RevisionFacts;
	const revision = typeof sync.revision === 'string' ? sync.revision : null;
	const adopted =
		typeof sync.adopted?.revision === 'string'
			? {
					revision: sync.adopted.revision,
					at: typeof sync.adopted.at === 'number' ? sync.adopted.at : 0,
				}
			: null;
	return {
		revision,
		adopted,
		holdsDocument: (answeredAt) =>
			!!revision &&
			adopted?.revision === revision &&
			(answeredAt === undefined || adopted.at > answeredAt),
	};
}

/** A whole-document adoption: binds `adopted` to the revision `sync` carries (none: unchanged). */
export function adoptedSync<S extends object>(sync: S, at: number): S {
	const { revision } = sync as RevisionFacts;
	if (typeof revision !== 'string' || revision === '') return sync;
	return { ...sync, adopted: { revision, at } };
}

/**
 * A naked stamp: moves the revision and keeps the adoption. With an `answer`, it yields (null)
 * to an adoption that landed after that answer.
 */
export function stampedSync<S extends object>(sync: S, revision: string): S;
export function stampedSync<S extends object>(
	sync: S,
	revision: string,
	answer: { at: number }
): S | null;
export function stampedSync<S extends object>(
	sync: S,
	revision: string,
	answer?: { at: number }
): S | null {
	if (answer && (residentRevision({ sync }).adopted?.at ?? 0) > answer.at) return null;
	return { ...sync, revision };
}

export interface OrderRevisionDoor {
	/**
	 * A status poll's answer names the store's document now: the next order push goes out under
	 * it (the drain re-stamps baseRevision from `sync.revision`; it never reads the journal's
	 * chain). Returns the revision replaced. Measured: order 115073, dev-next 2026-10-23, a 409
	 * on the cash push after a terminal cancel.
	 */
	stamp(
		orderUuid: string,
		revision: string,
		answeredAt: number
	): Promise<{ replaced: string | null }>;
}

export function createOrderRevisionDoor(deps: {
	resolveDatabase: () => Promise<RxDatabase>;
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
				const before = residentRevision(current).revision;
				if (before === revision) return current;
				const sync = stampedSync((current.sync ?? {}) as object, revision, { at: answeredAt });
				if (!sync) return current;
				replaced = before;
				return { ...current, sync };
			});
			return { replaced };
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
