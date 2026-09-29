import { identityColumnFilter, NO_STORE } from '@wcpos/sync-core';

import { resolveLegacyField } from './engine-adapter/collection-map';

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
 * This till's open orders, scoped IN STORAGE (#2242): the cashier and store identity the
 * carrier promotes from the order's `meta_data` is the selector, not a JS filter over every
 * open order in the store. `NO_STORE` (or an unknown store) scopes by cashier alone, as the
 * carrier omits the store entry for it. The
 * carrier's `identityColumnFilter` is the one place that spelling lives.
 */
export function openOrdersSelector(
	cashierId: number,
	storeId: number | undefined
): MangoQuerySelector<EngineDocument> {
	const statusPath = resolveLegacyField('orders', 'status').enginePath;
	return {
		[statusPath]: { $in: [...OPEN_ORDER_STATUSES] },
		...identityColumnFilter({
			cashierId: String(cashierId),
			...(storeId !== undefined && storeId !== NO_STORE ? { storeId: String(storeId) } : {}),
		}),
	} as MangoQuerySelector<EngineDocument>;
}
