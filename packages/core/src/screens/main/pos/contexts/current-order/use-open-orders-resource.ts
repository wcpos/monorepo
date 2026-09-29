import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
	declareRequirements,
	engineCollection,
	type EngineRecord,
	OPEN_ORDER_STATUSES,
	OPEN_ORDERS_SORT,
	openOrdersSelector,
	useQueryRuntime,
} from '@wcpos/query';

import {
	compileQuery,
	requirementsForCompiledQuery,
} from '../../../../../query/query-state-translator';

import type { OpenOrderHit } from './context';
import type { RxDatabase } from 'rxdb';

const OPEN_ORDERS_COMPILED = OPEN_ORDER_STATUSES.map((status) =>
	compileQuery(
		'orders',
		{
			search: '',
			filters: { status },
			// Unsupported wire sort preserves unbounded demand; residents are sorted below.
			sort: { field: 'date_completed_gmt', direction: 'asc' },
		},
		{ id: `pos:open-orders:${status}` }
	)
);

/**
 * CANNOT loop across a Suspense retry: `(pos)/_layout.tsx` calls this hook and renders
 * `CurrentOrderProvider` — the `useObservableSuspense` consumer — inside a `Suspense` BELOW
 * itself. React unwinds only as far as that boundary and commits everything above it with the
 * fallback, so the layout's `useMemo` is preserved and the retry reads back the same resource.
 * Only a builder inside the boundary's own subtree loses its state, which is the Orders blank
 * body (#1707). `packages/query/tests/suspense-boundary-placement.test.tsx` pins both halves of that rule.
 *
 * The demand handles and the resident subscription are bound to this resource's lifetime in the
 * effect below, which is why it stays a per-mount resource rather than a cached one.
 */
export function useOpenOrdersResource(
	cashierID: number | undefined,
	storeID: number | undefined
): ObservableResource<OpenOrderHit[]> {
	const runtime = useQueryRuntime();
	const resource = React.useMemo(() => {
		const openOrders$ = new Observable<RxDatabase | null>((subscriber) => {
			return runtime.engine.db$((database) => subscriber.next(database));
		}).pipe(
			switchMap((database) => {
				const collection = engineCollection(database, 'orders');
				// The scope and the order are the STORAGE's (#2242): no cashier, no query.
				if (!collection || cashierID === undefined) return of([] as EngineRecord<'orders'>[]);
				return collection.find({
					selector: openOrdersSelector(cashierID, storeID),
					sort: OPEN_ORDERS_SORT,
				}).$;
			}),
			map((documents) => documents.map((record) => ({ id: String(record.uuid), record })))
		);
		return new ObservableResource(openOrders$);
	}, [cashierID, runtime, storeID]);

	React.useEffect(() => {
		// Keep remote demand and the resident subscription bound to the same resource lifetime.
		const handles = declareRequirements(
			runtime.engine,
			OPEN_ORDERS_COMPILED.flatMap((compiled, index) =>
				requirementsForCompiledQuery(compiled.demand, {
					id: `pos:open-orders:${OPEN_ORDER_STATUSES[index]}`,
				})
			)
		);
		return () => {
			for (const handle of handles) handle.release();
			resource.destroy();
		};
	}, [runtime, resource]);

	return resource;
}
