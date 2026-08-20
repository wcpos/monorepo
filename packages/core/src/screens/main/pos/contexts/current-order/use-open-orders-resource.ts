import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
	declareRequirements,
	engineCollection,
	type EngineRecord,
	resolveLegacyField,
	useQueryRuntime,
	wrapEngineDocument,
} from '@wcpos/query';
import { NO_STORE, wooMetaCarrier } from '@wcpos/sync-core';

import {
	compileQuery,
	requirementsForCompiledQuery,
} from '../../../../../query/query-state-translator';

import type { RxDatabase } from 'rxdb';

type OrderDocument = import('@wcpos/database').OrderDocument;
type OpenOrderHit = { id: string; document: OrderDocument };

const OPEN_ORDERS_COMPILED = compileQuery(
	'orders',
	{
		search: '',
		filters: { status: 'pos-open' },
		// This resource owns its read order; an unsupported wire sort preserves unbounded demand.
		sort: { field: 'date_completed_gmt', direction: 'asc' },
	},
	{ id: 'pos:open-orders' }
);

function orderMeta(document: EngineRecord<'orders'>) {
	const meta = document.payload?.meta_data;
	return Array.isArray(meta) ? meta : undefined;
}

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
				if (!collection) return of([] as EngineRecord<'orders'>[]);
				const statusPath = resolveLegacyField('orders', 'status').enginePath;
				return collection.find({ selector: { [statusPath]: 'pos-open' } }).$;
			}),
			map((documents) =>
				documents
					.filter((document) => {
						const { cashierId: posUser, storeId: posStore } = wooMetaCarrier.readIdentity(
							orderMeta(document)
						);
						if (cashierID === undefined) return false;
						if (storeID === undefined || storeID === NO_STORE) return posUser === String(cashierID);
						return posUser === String(cashierID) && posStore === String(storeID);
					})
					.map((document) => wrapEngineDocument<OrderDocument>('orders', document as never))
					.sort((a, b) => (a.date_created_gmt ?? '').localeCompare(b.date_created_gmt ?? ''))
					.map((document) => ({ id: document.uuid!, document }))
			)
		);
		return new ObservableResource(openOrders$);
	}, [cashierID, runtime, storeID]);

	React.useEffect(() => {
		// Keep remote demand and the resident subscription bound to the same resource lifetime.
		const handles = declareRequirements(
			runtime.engine,
			requirementsForCompiledQuery(OPEN_ORDERS_COMPILED.demand, { id: 'pos:open-orders' })
		);
		return () => {
			for (const handle of handles) handle.release();
			resource.destroy();
		};
	}, [runtime, resource]);

	return resource;
}
