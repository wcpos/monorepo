import { map, type Observable } from 'rxjs';

import { identityColumnFilter, NO_STORE, wooMetaCarrier } from '@wcpos/sync-core';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineQuery } from '../engine-query';
import { OPEN_ORDER_STATUSES, type OpenOrdersScope } from '../open-orders-scope';

/**
 * How many open carts a cashier has on this store and register, from local rows only: the
 * scope `openOrdersSelector` means, in the legacy spelling `observeEngineQuery` compiles. Unlike
 * the open-orders handle it declares no server demand (opening the user sheet fetches nothing).
 */
export function observeOpenCartCount(
	engine: RxdbSyncEngine,
	{ cashierId, storeId, registerId }: OpenOrdersScope
): Observable<number> {
	return observeEngineQuery(engine, {
		collection: 'orders',
		limit: Number.MAX_SAFE_INTEGER,
		selector: {
			status: { $in: [...OPEN_ORDER_STATUSES] },
			...identityColumnFilter({
				cashierId: String(cashierId),
				...(storeId !== undefined && storeId !== NO_STORE ? { storeId: String(storeId) } : {}),
			}),
			...(typeof registerId === 'string' && registerId !== ''
				? wooMetaCarrier.identityFilter({ registerId })
				: {}),
		},
	}).pipe(map((result) => result.hits.length));
}
