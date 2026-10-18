import * as React from 'react';

import {
	acquireOrderRefundsQueryHandle,
	type QueryHandle,
	type QueryResult,
	useQueryRuntime,
} from '@wcpos/query';
import type { WooRefundPayload } from '@wcpos/sync-engine';
import { canonicalQueryKey, useScopeKey } from '@wcpos/query/query-state';

export type WCRefund = WooRefundPayload;

type RefundsResult = QueryResult;

/**
 * The order's refunds handle, retained while the caller is mounted: the caller is the OWNER,
 * above the Suspense/error boundary it renders. Keyed on BOTH scope keys, so a reset of the
 * refunds collection or of the orders collection (a cascade empties the detail rows) is a new
 * handle, whose forced pull is declared before the old one releases.
 */
export function useOrderRefunds(orderId: number): QueryHandle<RefundsResult> {
	const runtime = useQueryRuntime();
	const key = canonicalQueryKey([
		'refunds-by-parent',
		useScopeKey('refunds'),
		useScopeKey('orders'),
		orderId,
	]);
	const handle = React.useMemo(
		() => acquireOrderRefundsQueryHandle(runtime.engine, key, orderId),
		[runtime.engine, key, orderId]
	);
	React.useEffect(() => handle.retain(), [handle]);
	return handle;
}
