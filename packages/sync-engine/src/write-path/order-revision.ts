/**
 * The one writer of an order resident's revision facts (ADR 0040 §1.3): `sync.revision`, the
 * stamp the next push goes out under; `sync.adopted = { revision, at }`, which certifies a
 * whole-document adoption and is bound to the revision adopted; and `sync.stamped`, the last
 * status poll's answer (`stamp`), which an adoption clears. A naked stamp (`stampedSync`: the
 * 428 refresh, a manual rebase, an ack withheld for a queued successor, a status poll) moves the
 * revision and leaves the adoption behind, so the inequality alone revokes the resident's
 * authority; no writer needs to clear it. Readers interpret all three through `residentRevision`.
 */

import { type OrderDocument, remoteIdOrNull } from '@wcpos/sync-core';

import type { EngineRequirement, RequirementHandle } from '../require-plane';
import type { RxDatabase } from 'rxdb';

type Fact = { revision: string; at: number };
/** An order resident's `sync`: the wire's `SyncMetadata` plus the facts only this module writes. */
export type ResidentSync = Partial<OrderDocument['sync']> & { adopted?: Fact; stamped?: Fact };
type RawFact = { revision?: unknown; at?: unknown };
type RevisionFacts = { revision?: unknown; adopted?: RawFact; stamped?: RawFact };

export interface ResidentRevision {
	readonly revision: string | undefined;
	readonly adopted: Fact | null;
	/** The last status poll's answer, unless an adoption has landed since. */
	readonly stamped: Fact | null;
	/** Adopted whole, under the revision it carries, after `at` (the pull guard's question). */
	adoptedAfter(at: number): boolean;
	/** Adopted whole, under the revision it carries, after `answeredAt` and the last poll's stamp. */
	holdsDocument(answeredAt?: number): boolean;
}

function factOf(value: RawFact | undefined): Fact | null {
	if (typeof value?.revision !== 'string') return null;
	return { revision: value.revision, at: typeof value.at === 'number' ? value.at : 0 };
}

/** One snapshot of `record.sync`. */
export function residentRevision(record: { sync?: unknown } | null | undefined): ResidentRevision {
	const sync = (record?.sync ?? {}) as RevisionFacts;
	const revision = typeof sync.revision === 'string' ? sync.revision : undefined;
	const adopted = factOf(sync.adopted);
	const stamped = factOf(sync.stamped);
	const adoptedAfter = (at: number) =>
		!!revision && adopted?.revision === revision && adopted.at > at;
	return {
		revision,
		adopted,
		stamped,
		adoptedAfter,
		holdsDocument: (answeredAt) =>
			adoptedAfter(Math.max(answeredAt ?? -Infinity, stamped?.at ?? -Infinity)),
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
 */
export function carriedFacts<S extends ResidentSync>(sync: S, resident: unknown): S {
	const { adopted, stamped } = (resident as { sync?: ResidentSync } | undefined)?.sync ?? {};
	return { ...sync, ...(adopted && { adopted }), ...(stamped && { stamped }) };
}

export interface OrderRevisionDoor {
	/**
	 * A status poll's answer names the store's document now: the next order push goes out under
	 * it (the drain reads `sync.revision`, never the journal), and `sync.stamped` records it even
	 * under an equal revision. Returns the revision replaced. Measured: order 115073, dev-next
	 * 2026-10-23, a 409 on the cash push after a terminal cancel.
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
				// An adoption that landed after this answer wins.
				if ((facts.adopted?.at ?? 0) > answeredAt) return current;
				if (facts.revision !== revision) replaced = facts.revision ?? null;
				const sync = stampedSync((current.sync ?? {}) as ResidentSync, revision);
				return { ...current, sync: { ...sync, stamped: { revision, at: answeredAt } } };
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
				// A readopt document skips the unchanged filter (written unless the local-work guard keeps
				// the resident), and `appliedRecordIds` counts only this requirement's own tasks.
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
