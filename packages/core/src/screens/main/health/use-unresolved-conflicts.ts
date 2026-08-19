import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { from, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { useQueryRuntime, WRITEABLE_REMOTE_ID_FIELD } from '@wcpos/query';
import { MUTATION_QUEUE_RXDB_COLLECTION, rejectionSuggestsServerRecord } from '@wcpos/sync-engine';
import type { EngineConflict, RxdbSyncEngine } from '@wcpos/sync-engine';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

const healthLogger = getLogger(['wcpos', 'health']);

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

type EngineDatabase = NonNullable<ReturnType<RxdbSyncEngine['active']>>['database'];
type MutationRow = EngineConflict | { toJSON(): EngineConflict };
type MutationCollection = {
	find(query: { selector: { status: { $in: string[] } } }): {
		$: Observable<readonly MutationRow[]>;
	};
};

const PARKED_STATUSES = ['conflicted', 'needs-revision'];

const REMOTE_ID_FIELD: Record<string, string | undefined> = WRITEABLE_REMOTE_ID_FIELD;

function toJson(row: MutationRow): EngineConflict {
	return 'toJSON' in row && typeof row.toJSON === 'function'
		? row.toJSON()
		: (row as EngineConflict);
}

/**
 * Best-effort record handle, same precedence the attention banner resolves
 * (products: name; orders: number · total; customers: first/last or username),
 * read from the resident first and the queued snapshot as the last resort — a
 * parked UPDATE's payload may be partial (a lone stock tweak carries no name).
 */
function labelFor(resident: Record<string, unknown> | null, entry: EngineConflict): string | null {
	const queued = (entry.payload ?? {}) as Record<string, unknown>;
	const residentPayload = (resident?.payload ?? {}) as Record<string, unknown>;
	const pick = (key: string): unknown => resident?.[key] ?? residentPayload[key] ?? queued[key];
	const name = pick('name');
	if (typeof name === 'string' && name.trim() !== '') return name.trim();
	const number = pick('number');
	if (typeof number === 'string' || typeof number === 'number') {
		const total = pick('total');
		return typeof total === 'string' && total !== '' ? `#${number} · ${total}` : `#${number}`;
	}
	const person = [pick('first_name'), pick('last_name')]
		.filter((part): part is string => typeof part === 'string' && part.trim() !== '')
		.map((part) => part.trim())
		.join(' ');
	if (person !== '') return person;
	const username = pick('username');
	return typeof username === 'string' && username !== '' ? username : null;
}

async function describe(
	database: EngineDatabase,
	rows: readonly MutationRow[]
): Promise<UnresolvedConflict[]> {
	const described = await Promise.all(
		rows.map(async (row) => {
			const entry = toJson(row);
			// A failed resident read must NOT reject this Promise.all (see
			// use-rejected-mutations): the label is decoration — degrade to the
			// queued snapshot rather than blanking the screen.
			let resident: Record<string, unknown> | null = null;
			let readFailed = false;
			try {
				const doc = await database.collections[entry.collectionName]
					?.findOne(entry.recordId)
					.exec();
				resident = (doc?.toJSON() ?? null) as Record<string, unknown> | null;
			} catch (error) {
				readFailed = true;
				healthLogger.warn('Conflicts panel could not read the local record', {
					context: {
						collection: entry.collectionName,
						recordId: entry.recordId,
						error: getErrorMessage(error),
					},
				});
			}
			const remoteIdField = REMOTE_ID_FIELD[entry.collectionName];
			const columnRemoteId = remoteIdField ? resident?.[remoteIdField] : undefined;
			const queuedRemoteId =
				entry.collectionName === 'orders'
					? undefined
					: ((entry.payload as Record<string, unknown> | undefined)?.id ??
						(entry.conflictDocument as Record<string, unknown> | undefined)?.id);
			const remoteId = remoteIdOrNull(columnRemoteId) ?? remoteIdOrNull(queuedRemoteId);
			return {
				mutationId: entry.mutationId,
				collectionName: entry.collectionName,
				recordId: entry.recordId,
				operation: entry.operation,
				label: labelFor(resident, entry),
				queuedAt: entry.queuedAt ?? null,
				status: entry.status === 'needs-revision' ? 'needs-revision' : 'conflicted',
				destroysRecord:
					entry.operation === 'create' &&
					resident !== null &&
					!readFailed &&
					remoteId === null &&
					!rejectionSuggestsServerRecord(entry.rejectedReason),
				mayDestroyRecord:
					entry.collectionName !== 'orders' &&
					resident !== null &&
					!readFailed &&
					remoteId !== null,
				residentUnknown: readFailed,
			} satisfies UnresolvedConflict;
		})
	);
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
	return new Observable<EngineDatabase | null>((subscriber) =>
		engine.db$((database) => subscriber.next(database))
	).pipe(
		switchMap((database) => {
			if (!database) return of<UnresolvedConflictsRead>({ rows: [], readError: false });
			const mutations = database.collections[
				MUTATION_QUEUE_RXDB_COLLECTION
			] as unknown as MutationCollection;
			return mutations.find({ selector: { status: { $in: PARKED_STATUSES } } }).$.pipe(
				switchMap((rows) => from(describe(database, rows))),
				map((rows) => ({ rows, readError: false }))
			);
		}),
		// Never poison the cached resource (see use-rejected-mutations): a storage
		// fault degrades to a visible read error, not a forever-throwing read().
		catchError(() => of<UnresolvedConflictsRead>({ rows: [], readError: true }))
	);
}

/**
 * One resource per engine, held OUTSIDE the render lifecycle — the same
 * suspend-before-commit trap use-rejected-mutations documents: this panel only
 * mounts behind the `unresolvedConflicts > 0` gate, so its first read is always
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
	const { engine } = useQueryRuntime();
	const result = useObservableSuspense(conflictedResource(engine));
	if (result.readError) resourceByEngine.delete(engine);
	return result;
}

/**
 * Non-suspending `collection:recordId` keys of the parked rows, for the screen's
 * one-framing-per-record dedupe (Paul, 2026-08-08): a record listed in the
 * conflicted panel must not ALSO surface as a session-log stuck banner. Same
 * shape the dead-letter keys take, same reason.
 */
export function useUnresolvedConflictKeys(): Set<string> {
	const { engine } = useQueryRuntime();
	const [keys, setKeys] = React.useState<Set<string>>(() => new Set());

	React.useEffect(() => {
		// The engine owns this external subscription; bind it to the hook lifecycle.
		const subscription = new Observable<EngineDatabase | null>((subscriber) =>
			engine.db$((database) => subscriber.next(database))
		)
			.pipe(
				switchMap((database) => {
					if (!database) return of<readonly MutationRow[]>([]);
					const mutations = database.collections[
						MUTATION_QUEUE_RXDB_COLLECTION
					] as unknown as MutationCollection;
					return mutations.find({ selector: { status: { $in: PARKED_STATUSES } } }).$;
				}),
				map(
					(rows) =>
						new Set(
							rows.map((row) => {
								const entry = toJson(row);
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
	}, [engine]);

	return keys;
}
