import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { type Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import {
	type DescribedQueueRow,
	observeDescribedQueueRows,
	observeQueueRows,
	PARKED_QUEUE_STATUSES,
	useQueryRuntime,
} from '@wcpos/query';
import type { QueueRow, RxdbSyncEngine } from '@wcpos/sync-engine';

import { recordHandle } from './record-handle';

/**
 * The unresolved-conflict feed for Store health → Database.
 *
 * A 'conflicted' queue row is a change this device HELD after the server
 * reported a newer copy (a 409 stale-revision push); 'needs-revision' is the
 * same park reached through a 428 that carried no server truth. Until this hook
 * existed the only surface was a lumped count with hardcoded "sale(s)" copy —
 * the parked row could be a product, and nothing on the screen named it or
 * offered `resolveConflict`, so the record was wedged with no way out short of
 * a support session (dev-next 2026-08-14: a stock edit parked on a false 409
 * and the banner reported it as an anonymous sale).
 *
 * Each row carries what the cashier needs to decide: what record it is, what
 * kind it is, when it was queued — and the two honest resolutions the engine
 * offers ('retry-with-server-base' to keep this device's change, 'discard' to
 * drop it). The discard outcome is derived from the same identity rules the
 * engine uses so the panel can distinguish restoration from local deletion.
 */
export type UnresolvedConflict = {
	mutationId: string;
	collectionName: string;
	recordId: string;
	operation: 'create' | 'update' | 'delete';
	/** Human handle for the record ("Aether Gym Pant", "#1042 · 25.00"), or null when nothing names it. */
	label: string | null;
	/** ISO time the change was queued on this device. */
	queuedAt: string | null;
	/** 'conflicted' carries the server's 409 truth; 'needs-revision' parked without it. */
	status: 'conflicted' | 'needs-revision';
	/** Discard removes a born-local resident because no server identity can be restored. */
	destroysRecord: boolean;
	/** Discard may remove a non-order resident when its server document no longer exists. */
	mayDestroyRecord: boolean;
	/** The resident read failed, so the discard outcome cannot be described safely. */
	residentUnknown: boolean;
};

/**
 * The record handle (shared with the attention panel and the Logs rows), read
 * from the resident first and the queued snapshot as the last resort — a
 * parked UPDATE's payload may be partial (a lone stock tweak carries no name).
 */
function labelFor(resident: Record<string, unknown> | null, entry: QueueRow): string | null {
	return recordHandle(
		entry.collectionName,
		resident,
		(entry.payload ?? {}) as Record<string, unknown>
	);
}

function describe(rows: readonly DescribedQueueRow[]): UnresolvedConflict[] {
	const described = rows.map((entry): UnresolvedConflict => {
		const { resident, residentRead, discard } = entry;
		return {
			mutationId: entry.mutationId,
			collectionName: entry.collectionName,
			recordId: entry.recordId,
			operation: entry.operation,
			label: labelFor(resident, entry),
			queuedAt: entry.queuedAt ?? null,
			status: entry.status === 'needs-revision' ? 'needs-revision' : 'conflicted',
			residentUnknown: residentRead === 'failed',
			destroysRecord: discard === 'destroys-record',
			mayDestroyRecord: discard === 'may-destroy-record',
		};
	});
	// Newest first — the row the cashier just watched park.
	return described.sort((a, b) => (b.queuedAt ?? '').localeCompare(a.queuedAt ?? ''));
}

/**
 * What the panel renders: the parked rows, or the fact that they could not be
 * read — "no clashes" and "cannot read clashes" must never look the same (the
 * cashier-full-information ruling, mirrored from the rejected feed).
 */
export type UnresolvedConflictsRead = { rows: UnresolvedConflict[]; readError: boolean };

function conflicted$(engine: RxdbSyncEngine): Observable<UnresolvedConflictsRead> {
	return observeDescribedQueueRows(engine, { statuses: PARKED_QUEUE_STATUSES }).pipe(
		map((rows) => ({ rows: describe(rows), readError: false })),
		// Never poison the cached resource (see use-rejected-mutations): a storage
		// fault degrades to a visible read error, not a forever-throwing read().
		catchError(() => of<UnresolvedConflictsRead>({ rows: [], readError: true }))
	);
}

/**
 * One resource per engine, held OUTSIDE the render lifecycle — the same
 * suspend-before-commit trap use-rejected-mutations documents: this panel only
 * mounts behind the `needsDecisionUnresolved > 0` gate, so its first read is always
 * async and a per-render resource would suspend forever.
 */
const resourceByEngine = new WeakMap<RxdbSyncEngine, ObservableResource<UnresolvedConflictsRead>>();

function conflictedResource(engine: RxdbSyncEngine): ObservableResource<UnresolvedConflictsRead> {
	let resource = resourceByEngine.get(engine);
	if (!resource) {
		resource = new ObservableResource(conflicted$(engine));
		resourceByEngine.set(engine, resource);
	}
	return resource;
}

/**
 * Suspends until the first emission, then re-renders on every queue change —
 * the house data-flow (ObservableResource + Suspense).
 */
export function useUnresolvedConflicts(): UnresolvedConflictsRead {
	const runtime = useQueryRuntime();
	const result = useObservableSuspense(conflictedResource(runtime.engine));
	if (result.readError) resourceByEngine.delete(runtime.engine);
	return result;
}

/**
 * Non-suspending `collection:recordId` keys of the parked rows, for the screen's
 * one-framing-per-record dedupe (Paul, 2026-08-08): a record listed in the
 * conflicted panel must not ALSO surface as a session-log stuck banner. Same
 * shape the dead-letter keys take, same reason.
 */
export function useUnresolvedConflictKeys(): Set<string> {
	const runtime = useQueryRuntime();
	const [keys, setKeys] = React.useState<Set<string>>(() => new Set());

	React.useEffect(() => {
		// The engine owns this external subscription; bind it to the hook lifecycle.
		const subscription = observeQueueRows(runtime.engine, { statuses: PARKED_QUEUE_STATUSES })
			.pipe(
				map(
					(rows) =>
						new Set(
							rows.map((row) => {
								const entry = row;
								return `${entry.collectionName}:${entry.recordId}`;
							})
						)
				),
				// Dedupe is best-effort decoration: on a storage fault, keep the stuck
				// banner (possibly duplicated) rather than take the screen down.
				catchError(() => of(new Set<string>()))
			)
			.subscribe(setKeys);
		return () => subscription.unsubscribe();
	}, [runtime.engine]);

	return keys;
}
