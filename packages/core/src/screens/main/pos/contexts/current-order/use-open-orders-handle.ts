import * as React from 'react';

import {
	acquireOpenOrdersQueryHandle,
	type QueryHandle,
	type QueryResult,
	useQueryRuntime,
} from '@wcpos/query';
import { acquireEmptyQueryHandle, canonicalQueryKey, useScopeKey } from '@wcpos/query/query-state';

type OpenOrdersResult = QueryResult;

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
	const runtime = useQueryRuntime();
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
				? acquireEmptyQueryHandle(runtime.engine, key)
				: acquireOpenOrdersQueryHandle(runtime.engine, key, {
						cashierId: cashierID,
						storeId: storeID,
						registerId: register,
					}),
		[runtime.engine, key, cashierID, storeID, register]
	);
	React.useEffect(() => handle.retain(), [handle]);
	return handle;
}
