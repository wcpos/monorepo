import * as React from 'react';

import { of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
	acquireQueryHandle,
	createDemand,
	createQueryHandle,
	engineCollection,
	type EngineRecord,
	observeCollectionActive,
	observeEngineDatabases,
	OPEN_ORDER_STATUSES,
	OPEN_ORDERS_SORT,
	openOrdersSelector,
	type QueryHandle,
	type QueryResult,
	useQueryRuntime,
} from '@wcpos/query';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	acquireEmptyQueryHandle,
	canonicalQueryKey,
	demandPlanFor,
} from '../../../../../query/query-handles';
import { compileQuery } from '../../../../../query/query-state-translator';
import { useScopeKey } from '../../../../../query/scope-key';

import type { RxCollection } from 'rxdb';

type OpenOrdersResult = QueryResult<RxCollection>;

const OPEN_ORDERS_COMPILED = OPEN_ORDER_STATUSES.map((status) => ({
	status,
	compiled: compileQuery(
		'orders',
		{
			search: '',
			filters: { status },
			// Unsupported wire sort preserves unbounded demand; residents are sorted by storage.
			sort: { field: 'date_completed_gmt', direction: 'asc' },
		},
		{ id: `pos:open-orders:${status}` }
	),
}));

// Demand ids are the handle's own: two owners of one key share one declaration.
let nextHandleId = 0;

export type OpenOrdersScope = { cashierId: number; storeId?: number; registerId?: string | null };

/**
 * This till's open orders as a handle: one `collection.find(...).$` over the STORAGE-scoped
 * selector (#2242), rebound on every database the engine publishes (a scope move, a same-site
 * replacement), and one standing demand per open status while owned.
 */
export function acquireOpenOrdersQueryHandle(
	engine: RxdbSyncEngine,
	key: string,
	{ cashierId, storeId, registerId }: OpenOrdersScope
): QueryHandle<OpenOrdersResult> {
	return acquireQueryHandle(engine, key, (registry) => {
		const id = `pos:open-orders:qh${nextHandleId++}`;
		return createQueryHandle(
			engine,
			{
				key,
				result$: (target) =>
					observeEngineDatabases(target).pipe(
						switchMap((database) => {
							const collection = engineCollection(database, 'orders');
							return collection
								? collection.find({
										selector: openOrdersSelector(cashierId, storeId, registerId),
										sort: OPEN_ORDERS_SORT,
									}).$
								: of([] as EngineRecord<'orders'>[]);
						}),
						map((records): OpenOrdersResult => ({
							count: records.length,
							hits: records.map((record) => ({
								id: String(record.uuid),
								record,
							})) as unknown as OpenOrdersResult['hits'],
						}))
					),
				demands: OPEN_ORDERS_COMPILED.map(({ status, compiled }) =>
					createDemand(engine, `${id}:${status}`, demandPlanFor(compiled))
				),
				activeCollections: ['orders'],
				censusScoped: false,
				// The tabs read rows, never a total: no census, no coverage verdict.
				projectsTotal: false,
				observeActive: observeCollectionActive,
			},
			{ count: 0, hits: [] },
			registry
		);
	});
}

/**
 * The open-orders handle, retained (owned) by the caller while mounted.
 *
 * `(pos)/_layout.tsx` is the owner: it calls this ABOVE the `Suspense` that
 * `CurrentOrderProvider` (the `useQuerySnapshot` reader) suspends inside, so the owner commits
 * with the fallback and its retain effect starts the read. A handle acquired inside the
 * boundary that suspends on it would never start (#1707). Before that first commit, the
 * committed layout's `useMemo` is what hands a retry the same handle; a handle enters the
 * registry only when it STARTS (the owner's retain), and from then on every acquire of its key
 * reads it back. `packages/core/src/query/query-handles.suspense.test.tsx` pins that placement
 * rule for handles.
 *
 * No cashier, no query and no demand: a till with no cashier identity has nothing to show.
 */
export function useOpenOrdersHandle(
	cashierID: number | undefined,
	storeID: number | undefined,
	registerID?: string | null
): QueryHandle<OpenOrdersResult> {
	const { engine } = useQueryRuntime();
	const scope = useScopeKey('orders');
	// `''` and `null` are the same selector (no register condition), so they are one handle.
	const register = registerID || null;
	const key = canonicalQueryKey([
		'open-orders',
		scope,
		cashierID ?? null,
		storeID ?? null,
		register,
	]);
	const handle = React.useMemo(
		() =>
			cashierID === undefined
				? acquireEmptyQueryHandle(engine, key)
				: acquireOpenOrdersQueryHandle(engine, key, {
						cashierId: cashierID,
						storeId: storeID,
						registerId: register,
					}),
		[engine, key, cashierID, storeID, register]
	);
	React.useEffect(() => handle.retain(), [handle]);
	return handle;
}
