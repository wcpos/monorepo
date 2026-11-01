import { map, type Observable } from 'rxjs';

import { identityColumnFilter, NO_STORE, wooMetaCarrier } from '@wcpos/sync-core';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineQuery } from '../engine-query';
import { OPEN_ORDER_STATUSES, type OpenOrdersScope } from '../open-orders-scope';

/** A cashier's open carts on this store and register (`openOrdersSelector`'s scope); local only, no demand. */
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
