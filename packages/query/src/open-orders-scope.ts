import { NO_STORE, wooMetaCarrier } from '@wcpos/sync-core';

import { resolveLegacyField } from './engine-adapter/collection-map';
import { normalizeSelectorSemantics } from './engine-adapter/normalize-selector';

import type { EngineDocument } from './engine-adapter/collection-map';
import type { MangoQuerySelector, MangoQuerySortPart } from 'rxdb';

// record-manual-payment.ts patches status to derive().status, so a part-paid order
// leaves pos-open and would drop out of the tabs mid-checkout. Include pos-partial
// and pending to keep the order and its tender reachable, including after reload.
export const OPEN_ORDER_STATUSES = ['pos-open', 'pos-partial', 'pending'] as const;

/** Creation order, oldest tab first; `uuid` keeps the order total when two share a second. */
export const OPEN_ORDERS_SORT: MangoQuerySortPart<EngineDocument>[] = [
	{ 'payload.date_created_gmt': 'asc' },
	{ uuid: 'asc' },
];

/**
 * This till's open orders, scoped IN STORAGE (#2242): the cashier and store identity the
 * carrier stamps into the order's `meta_data` is the selector, not a JS filter over every
 * open order in the store. `NO_STORE` (or an unknown store) scopes by cashier alone, as the
 * carrier omits the store entry for it. At 2.0 the identity moves to promoted columns; the
 * carrier's `identityFilter` is the one place that spelling lives.
 */
export function openOrdersSelector(
	cashierId: number,
	storeId: number | undefined
): MangoQuerySelector<EngineDocument> {
	const statusPath = resolveLegacyField('orders', 'status').enginePath;
	const metaDataPath = resolveLegacyField('orders', 'meta_data').enginePath;
	const identity = wooMetaCarrier.identityFilter({
		cashierId: String(cashierId),
		...(storeId !== undefined && storeId !== NO_STORE ? { storeId: String(storeId) } : {}),
	});
	const conditions = Array.isArray(identity.$and) ? identity.$and : [identity];
	return normalizeSelectorSemantics({
		$and: [
			{ [statusPath]: { $in: [...OPEN_ORDER_STATUSES] } },
			...conditions.map((condition) => ({
				[metaDataPath]: (condition as { meta_data: unknown }).meta_data,
			})),
		],
	}) as MangoQuerySelector<EngineDocument>;
}
