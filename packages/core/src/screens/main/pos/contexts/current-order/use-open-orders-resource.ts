import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { Observable, of } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { useQueryManager } from '@wcpos/query';
import {
	engineCollectionNameFor,
	resolveLegacyField,
	wrapEngineDocument,
} from '@wcpos/query/engine-compat';
import { declareRequirements, requirementsForQuery } from '@wcpos/query/requirements';

type OrderDocument = import('@wcpos/database').OrderDocument;
type EngineRxDocument = Parameters<typeof wrapEngineDocument>[1];
type OpenOrderHit = { id: string; document: OrderDocument };

type EngineDatabase = {
	collections: Record<string, unknown>;
};

type EngineOrderCollection = {
	find(query: { selector: Record<string, unknown> }): {
		$: Observable<EngineRxDocument[]>;
	};
};

function metaValue(document: EngineRxDocument, key: string): unknown {
	const payload = (document as unknown as { payload?: Record<string, unknown> }).payload;
	const metaData = payload?.meta_data;
	if (!Array.isArray(metaData)) return undefined;
	const entry = metaData.find(
		(item) => item !== null && typeof item === 'object' && (item as { key?: unknown }).key === key
	);
	return entry !== null && typeof entry === 'object'
		? (entry as { value?: unknown }).value
		: undefined;
}

export function useOpenOrdersResource(
	cashierID: number,
	storeID: number
): ObservableResource<OpenOrderHit[]> {
	const manager = useQueryManager();
	const resource = React.useMemo(() => {
		const openOrders$ = new Observable<EngineDatabase | null>((subscriber) => {
			return manager.engine.db$((database) =>
				subscriber.next(database as unknown as EngineDatabase | null)
			);
		}).pipe(
			switchMap((database) => {
				if (!database) return of([] as EngineRxDocument[]);
				const collection = database.collections[engineCollectionNameFor('orders')] as unknown as
					| EngineOrderCollection
					| undefined;
				if (!collection) return of([] as EngineRxDocument[]);
				const statusPath = resolveLegacyField('orders', 'status').enginePath;
				return collection.find({ selector: { [statusPath]: 'pos-open' } }).$;
			}),
			map((documents) =>
				documents
					.filter((document) => {
						const posUser = metaValue(document, '_pos_user');
						const posStore = metaValue(document, '_pos_store');
						if (storeID === 0) return posUser === String(cashierID);
						return posUser === String(cashierID) && posStore === String(storeID);
					})
					.map((document) => wrapEngineDocument<OrderDocument>('orders', document))
					.sort((a, b) => (a.date_created_gmt ?? '').localeCompare(b.date_created_gmt ?? ''))
					.map((document) => ({ id: document.uuid!, document }))
			),
			distinctUntilChanged(
				(prev: OpenOrderHit[], next: OpenOrderHit[]) => prev.length === next.length
			)
		);
		return new ObservableResource(openOrders$);
	}, [cashierID, manager, storeID]);

	React.useEffect(() => {
		// Keep remote demand and the resident subscription bound to the same resource lifetime.
		const handles = declareRequirements(
			manager.engine,
			requirementsForQuery({
				id: 'pos:open-orders',
				collectionName: 'orders',
				selector: { status: 'pos-open' },
				limit: undefined,
			})
		);
		return () => {
			for (const handle of handles) handle.release();
			resource.destroy();
		};
	}, [manager, resource]);

	return resource;
}
