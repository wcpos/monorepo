import { map, type Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { OPEN_CART_ORDER_STATUS, type RxdbSyncEngine } from '@wcpos/sync-engine';
import { identityColumnFilter, NO_STORE, wooMetaCarrier } from '@wcpos/sync-core';

import { engineCollection } from './records/engine-collection';
import { resolveLegacyField } from './engine-adapter/collection-map';
import { observeEngineDatabases } from './engine-query';
import { observeCollectionActive } from './engine-status';
import {
	acquireQueryHandle,
	createDemand,
	createQueryHandle,
	type QueryHandle,
} from './query-handle';
import { compileQuery } from './query-state/query-state-translator';
import { demandPlanFor } from './query-state/query-handles';

import type { QueryResult } from './query-result';
import type { EngineRecord } from './records/engine-record';
import type { EngineDocument } from './engine-adapter/collection-map';
import type { MangoQuerySelector, MangoQuerySortPart } from 'rxdb';

// record-manual-payment.ts patches status to derive().status, so a part-paid order
// leaves pos-open and would drop out of the tabs mid-checkout. Include pos-partial
// and pending to keep the order and its tender reachable, including after reload.
export const OPEN_ORDER_STATUSES = ['pos-open', 'pos-partial', 'pending'] as const;

/** Creation order, oldest tab first; `uuid` keeps the order total when two share a second. */
export const OPEN_ORDERS_SORT: MangoQuerySortPart<EngineDocument>[] = [
	{ dateCreatedGmt: 'asc' },
	{ uuid: 'asc' },
];

/**
 * This till's open orders, scoped IN STORAGE (#2242): the cashier, store and register identity the
 * carrier promotes from the order's `meta_data` is the selector, not a JS filter over every
 * open order in the store. `NO_STORE` (or an unknown store) scopes by cashier alone, as the
 * carrier omits the store entry for it. The
 * carrier's `identityColumnFilter` is the one place that spelling lives.
 */
export function openOrdersSelector(
	cashierId: number,
	storeId: number | undefined,
	registerId?: string | null
): MangoQuerySelector<EngineDocument> {
	const statusPath = resolveLegacyField('orders', 'status').enginePath;
	// The register is not a promoted column: it is the `_pos_register` entry of `meta_data`,
	// matched with the carrier's own condition once the indexed cashier/store scope has done
	// the narrowing (Paul, 2026-09-29: a cashier sees their orders on this store AND register).
	const register =
		typeof registerId === 'string' && registerId !== ''
			? {
					[resolveLegacyField('orders', 'meta_data').enginePath]: (
						wooMetaCarrier.identityFilter({ registerId }) as { meta_data: unknown }
					).meta_data,
				}
			: {};
	return {
		[statusPath]: { $in: [...OPEN_ORDER_STATUSES] },
		...identityColumnFilter({
			cashierId: String(cashierId),
			...(storeId !== undefined && storeId !== NO_STORE ? { storeId: String(storeId) } : {}),
		}),
		...register,
	} as MangoQuerySelector<EngineDocument>;
}

/** All resident open carts, not just this cashier's tabs: the engine holds all of them. */
export function openCartRecordIds$(
	database: Parameters<typeof engineCollection>[0]
): Observable<ReadonlySet<string>> {
	const orders = engineCollection(database, 'orders');
	return orders
		? orders
				.find({ selector: { status: { $eq: OPEN_CART_ORDER_STATUS } } })
				.$.pipe(
					map(
						(documents) =>
							new Set(
								documents
									.map((document) => document.uuid)
									.filter((uuid): uuid is typeof uuid & string => uuid !== undefined)
							)
					)
				)
		: of(new Set<string>());
}

type OpenOrdersResult = QueryResult;

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
