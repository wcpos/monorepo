import {
	combineLatest,
	concatMap,
	distinctUntilChanged,
	finalize,
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
	ClosureRow,
	RefundDocumentType,
	RegisterSessionRow,
} from '@wcpos/database';
import { readLedger } from '@wcpos/order-math';
import { mintRemoteId, POS_META_KEYS } from '@wcpos/sync-core';
import type { RequirementHandle, RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineQuery } from '../engine-query';
import { declareRequirements } from '../requirement-bridge';
import { observeFollowedCollection } from '../use-local-collection';

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
