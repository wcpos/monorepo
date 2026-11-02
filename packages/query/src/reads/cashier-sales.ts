import { map, type Observable } from 'rxjs';

import { toMinor } from '@wcpos/order-math';
import { identityColumnFilter } from '@wcpos/sync-core';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineQuery } from '../engine-query';

// Woo persists at most 6 fractional digits; rounding belongs to the display formatter.
const AGGREGATE_DECIMALS = 6;

/**
 * Local completed sales only; this read does not declare server demand. The count rides with
 * the total so a figure and its "n sales" line always describe the same orders.
 */
export function observeCashierSalesTotal(
	engine: RxdbSyncEngine,
	{
		cashierId,
		storeId,
		fromGmt,
		toGmt,
	}: {
		cashierId: string;
		storeId: string;
		fromGmt: string;
		toGmt: string;
	}
): Observable<{ total: number; count: number }> {
	return observeEngineQuery(engine, {
		collection: 'orders',
		limit: Number.MAX_SAFE_INTEGER,
		selector: {
			status: 'completed',
			date_created_gmt: { $gte: fromGmt, $lt: toGmt },
			...identityColumnFilter({ cashierId, storeId }),
		},
	}).pipe(
		map((result) => ({
			total:
				result.hits.reduce(
					(sum, hit) => sum + toMinor(hit.record.payload.total as string, AGGREGATE_DECIMALS),
					0
				) /
				10 ** AGGREGATE_DECIMALS,
			count: result.hits.length,
		}))
	);
}
