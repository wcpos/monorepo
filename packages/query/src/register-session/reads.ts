import {
	combineLatest,
	concatMap,
	distinctUntilChanged,
	finalize,
	firstValueFrom,
	map,
	type Observable,
	of,
	startWith,
	Subject,
	switchMap,
	tap,
} from 'rxjs';

import type {
	CashMovementRow,
	ClosureDocument,
	ClosureRow,
	RefundDocumentType,
	RegisterSessionRow,
} from '@wcpos/database';
import { readLedger } from '@wcpos/order-math';
import { mintRemoteId, POS_META_KEYS } from '@wcpos/sync-core';
import type { RequirementHandle, RxdbSyncEngine } from '@wcpos/sync-engine';

import { openSessionSelector } from './session-store';
import { observeEngineQuery } from '../engine-query';
import { declareRequirements } from '../requirement-bridge';
import { observeFollowedCollection } from '../use-local-collection';

import type { RxCollection } from 'rxdb';
import type { ReadonlyEngineRecord } from '../records/readonly-engine-record';
import type { RegisterStoreDatabase } from './store-database';

/** Absent → null. Keep reactive documents until the closure/report consumers move in PR D. */
export function observeRegisterSessions(storeDB: RegisterStoreDatabase, registerId: string | null) {
	return observeFollowedCollection<RegisterSessionRow>(storeDB, 'register_sessions').pipe(
		switchMap((sessions) =>
			sessions && registerId
				? combineLatest([
						sessions.find({
							selector: { register_id: registerId, status: { $in: ['open', 'counting'] } },
						}).$,
						sessions.find({ selector: { register_id: registerId, status: 'closed' } }).$,
					]).pipe(
						map(([active, closed]) => ({
							active,
							closed,
							// An old render may outlive a replacement's first (asynchronous) answer.
							isCurrent: () => storeDB?.collections.register_sessions === sessions,
						})),
						startWith(null)
					)
				: of(null)
		)
	);
}

/** Absent → null, not an empty/loaded drawer. Intentionally unscoped for refused movements. */
export function observeCashMovements(storeDB: RegisterStoreDatabase) {
	return observeFollowedCollection<CashMovementRow>(storeDB, 'cash_movements').pipe(
		switchMap((movements) => (movements ? movements.find().$.pipe(startWith(null)) : of(null)))
	);
}

/** Absent → null; closures belong to the selected register. */
export function observeRegisterClosures(storeDB: RegisterStoreDatabase, registerId: string | null) {
	return observeFollowedCollection<ClosureRow>(storeDB, 'closures').pipe(
		switchMap((closures) =>
			closures && registerId
				? closures.find({ selector: { register_id: registerId } }).$.pipe(startWith(null))
				: of(null)
		)
	);
}

/** Absent → false. Bridge cycles also follow in-place register collection replacements. */
export function observeRegisterSessionAvailability(storeDB: RegisterStoreDatabase) {
	return combineLatest(
		['register_sessions', 'cash_movements', 'closures'].map((name) =>
			observeFollowedCollection(storeDB, name)
		)
	).pipe(
		map((collections) => collections.every(Boolean)),
		startWith(false)
	);
}

/** Reactive closure identity without storage or mutation doors. */
export type ReadonlyClosureDocument = Readonly<ClosureRow> &
	Pick<ClosureDocument, 'toJSON' | 'toMutableJSON'> & {
		getLatest(): ReadonlyClosureDocument;
		readonly $: Observable<ReadonlyClosureDocument>;
	};
export type ClosureIdentity =
	{ id: string; serverClosureId?: string } | { serverClosureId: string; id?: string };

function closureQuery(closures: RxCollection<ClosureRow>, identity: ClosureIdentity) {
	return closures.findOne(
		'serverClosureId' in identity
			? {
					selector: {
						$or: [
							{ id: identity.id ?? identity.serverClosureId },
							{ server_closure_id: identity.serverClosureId ?? identity.id },
						],
					},
				}
			: identity.id
	).$ as unknown as Observable<ReadonlyClosureDocument | null>;
}

/** Absent → null. Reports may know the local UUID, the server identity, or both. */
export function observeClosure(
	storeDB: RegisterStoreDatabase,
	identity: ClosureIdentity
): Observable<ReadonlyClosureDocument | null> {
	return observeFollowedCollection<ClosureRow>(storeDB, 'closures').pipe(
		switchMap((closures) =>
			closures ? closureQuery(closures, identity).pipe(startWith(null)) : of(null)
		)
	);
}

/**
 * Fresh one-shot answer for print callbacks: the first ANSWERED query of the collection that
 * is current when it answers. A reset landing before the first answer moves the lookup to the
 * replacement (switchMap drops the superseded query), so a loading emission is never mistaken
 * for "no such closure" (CodeRabbit, #2700).
 */
export function readClosure(storeDB: RegisterStoreDatabase, identity: ClosureIdentity) {
	if (!storeDB?.collections.closures) return Promise.resolve(null);
	return firstValueFrom(
		observeFollowedCollection<ClosureRow>(storeDB, 'closures').pipe(
			switchMap((closures) => (closures ? closureQuery(closures, identity) : of(null)))
		),
		{ defaultValue: null }
	);
}

/** Absent → null (unavailable), not [] (loaded empty); the Reports list is unscoped. */
export function observeClosures(storeDB: RegisterStoreDatabase): Observable<ClosureRow[] | null> {
	return observeFollowedCollection<ClosureRow>(storeDB, 'closures').pipe(
		switchMap((closures) =>
			closures
				? closures.find().$.pipe(
						map((rows) => rows.map((row) => row.toMutableJSON())),
						startWith(null)
					)
				: of(null)
		)
	);
}

/** Absent → null; only an answered query may invalidate or reopen checkout. */
export function observeOpenSessionPresence(
	storeDB: RegisterStoreDatabase,
	scope: { sessionId: string } | { registerId: string }
): Observable<boolean | null> {
	return observeFollowedCollection<RegisterSessionRow>(storeDB, 'register_sessions').pipe(
		switchMap((sessions) =>
			sessions
				? sessions
						.findOne({
							selector: {
								...openSessionSelector,
								...('sessionId' in scope
									? { id: scope.sessionId }
									: { register_id: scope.registerId }),
							},
						})
						.$.pipe(map(Boolean), startWith(null))
				: of(null)
		)
	);
}

/** Shared across read rebindings so an in-flight close keeps receiving parent accounting. */
export function createSessionAccountingState() {
	const missingParentKey = { current: '' };
	const pendingParents = { current: [] as RequirementHandle[] };
	const accountingChanges = new Subject<void>();
	const latestAccounting: {
		current: {
			orders: ReadonlyEngineRecord<'orders'>[];
			refundRecords: RefundDocumentType[];
			refundSources: ReadonlyEngineRecord<'refunds'>[];
		} | null;
	} = { current: null };
	return { missingParentKey, pendingParents, accountingChanges, latestAccounting };
}

/** The synchronous controller state lets close wait for parents before the async render emission. */
export function observeSessionAccounting(
	engine: RxdbSyncEngine,
	current: Observable<RegisterSessionRow | undefined | null>,
	state = createSessionAccountingState()
) {
	const { missingParentKey, pendingParents, accountingChanges, latestAccounting } = state;
	const stream: Observable<{
		orders: { hits: { record: ReadonlyEngineRecord<'orders'> }[] };
		refundRecords: RefundDocumentType[];
		refundSources: ReadonlyEngineRecord<'refunds'>[];
	} | null> = current.pipe(
		distinctUntilChanged((previous, current) =>
			previous === null || current === null ? previous === current : previous?.id === current?.id
		),
		switchMap((current) => {
			if (current === null) return of(null);
			if (!current)
				return of({
					orders: { hits: [] as never[] },
					refundRecords: [] as RefundDocumentType[],
					refundSources: [] as ReadonlyEngineRecord<'refunds'>[],
				});
			return observeEngineQuery(engine, {
				collection: 'orders',
				selector: { date_modified_gmt: { $gte: current.opened_at_gmt } },
				limit: Number.MAX_SAFE_INTEGER,
			}).pipe(
				switchMap((recent) => {
					const ids = recent.hits.flatMap(({ record }) =>
						readLedger(record.payload.meta_data)
							.filter((row) => row.session_id === current.id)
							.flatMap((row) => (row.refunds ?? []).map(({ id }) => id))
					);
					return observeEngineQuery(engine, {
						collection: 'refunds',
						selector: {
							$or: [{ session_id: current.id }, { id: { $in: ids } }],
						},
						limit: Number.MAX_SAFE_INTEGER,
					}).pipe(
						switchMap((refunds) => {
							const refundRecords = refunds.hits.map(
								({ record }) => record.payload as RefundDocumentType
							);
							const parentIds = refundRecords
								.filter((refund) =>
									refund.meta_data?.some(
										({ key, value }) => key === POS_META_KEYS.session && value === current.id
									)
								)
								.map((refund) => refund.parent_id);
							const parents$: ReturnType<typeof observeEngineQuery> = parentIds.length
								? observeEngineQuery(engine, {
										collection: 'orders',
										selector: { id: { $in: parentIds } },
										limit: Number.MAX_SAFE_INTEGER,
									})
								: of({ count: 0, hits: [] });
							let missingKey = '';
							let parentRequirements: RequirementHandle[] = [];
							return parents$.pipe(
								tap((parents) => {
									const held = new Set(parents.hits.map(({ record }) => record.payload.id));
									const missing = [...new Set(parentIds)]
										.filter((id) => !held.has(id))
										.sort((a, b) => a - b);
									const key = missing.join(',');
									missingParentKey.current = key;
									if (key === missingKey) return;
									missingKey = key;
									parentRequirements.forEach((handle) => handle.release());
									parentRequirements = missing.length
										? declareRequirements(engine, [
												{
													id: 'register-session:refund-parents',
													kind: 'targeted-records',
													collection: 'orders',
													remoteIds: missing.map((id) => mintRemoteId(id, 'refund parent')),
												},
											])
										: [];
									pendingParents.current = parentRequirements;
								}),
								finalize(() => {
									parentRequirements.forEach((handle) => handle.release());
									if (pendingParents.current === parentRequirements) pendingParents.current = [];
								}),
								map((parents) => ({
									orders: {
										hits: [
											...new Map(
												[...recent.hits, ...parents.hits].map((hit) => [hit.record.uuid, hit])
											).values(),
										],
									},
									refundRecords,
									refundSources: refunds.hits.map(({ record }) => record),
								}))
							);
						})
					);
				}),
				tap((accounting) => {
					latestAccounting.current = {
						orders: accounting.orders.hits.map(({ record }) => record),
						refundRecords: accounting.refundRecords,
						refundSources: accounting.refundSources,
					};
					accountingChanges.next();
				}),
				// Preserve the existing asynchronous accounting emission boundary.
				concatMap(async (accounting) => accounting)
			);
		})
	);
	return { stream, missingParentKey, pendingParents, accountingChanges, latestAccounting };
}
