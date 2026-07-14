import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { NEVER, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { useQueryManager } from '@wcpos/query';
import {
	engineCollectionNameFor,
	type LegacyCollectionName,
	resolveLegacyField,
} from '@wcpos/query/engine-adapter/collection-map';
import { wrapEngineDocument } from '@wcpos/query/engine-adapter/document-proxy';

type EngineRxDocument = Parameters<typeof wrapEngineDocument>[1];

type EngineCollection = {
	findOne(query: string | { selector: Record<string, unknown> }): {
		$: Observable<EngineRxDocument | null>;
	};
	find(query: { selector: Record<string, unknown> }): {
		$: Observable<EngineRxDocument[]>;
	};
};

type EngineDatabase = {
	collections: Record<string, unknown>;
};

type DocumentKey = { type: 'uuid'; value: string } | { type: 'woo-id'; value: number };

function engineDocument$(
	manager: ReturnType<typeof useQueryManager>,
	collectionName: LegacyCollectionName,
	key: DocumentKey
): Observable<EngineRxDocument | null> {
	return new Observable<EngineDatabase | null>((subscriber) =>
		manager.engine.db$((database) => subscriber.next(database as unknown as EngineDatabase | null))
	).pipe(
		switchMap((database) => {
			if (!database) {
				return NEVER;
			}

			// Resolve after every db$ emission: scope moves and resets replace collection residents.
			const collection = database.collections[
				engineCollectionNameFor(collectionName)
			] as unknown as EngineCollection | undefined;
			if (!collection) {
				return of(null);
			}

			const query =
				key.type === 'uuid'
					? key.value
					: {
							selector: {
								[resolveLegacyField(collectionName, 'id').enginePath]: key.value,
							},
						};
			return collection.findOne(query).$;
		})
	);
}

function useEngineDocumentResource<TDocument extends object>(
	collectionName: LegacyCollectionName,
	key: DocumentKey
): ObservableResource<TDocument> {
	const manager = useQueryManager();
	const resource = React.useMemo(() => {
		const document$ = engineDocument$(manager, collectionName, key).pipe(
			map((document) =>
				document === null ? null : wrapEngineDocument<TDocument>(collectionName, document)
			)
		);
		return new ObservableResource(document$ as Observable<TDocument>);
	}, [collectionName, key, manager]);

	React.useEffect(() => {
		// ObservableResource owns the db$/RxDB subscriptions and must release them on rebind/unmount.
		return () => resource.destroy();
	}, [resource]);

	return resource;
}

/** Bind one legacy-shaped document by its engine UUID primary key. */
export function useEngineDocument<TDocument extends object>(
	collectionName: LegacyCollectionName,
	uuid: string
): ObservableResource<TDocument> {
	const key = React.useMemo<DocumentKey>(() => ({ type: 'uuid', value: uuid }), [uuid]);
	return useEngineDocumentResource(collectionName, key);
}

/** Bind one legacy-shaped document by its numeric Woo identifier. */
export function useEngineDocumentByWooId<TDocument extends object>(
	collectionName: LegacyCollectionName,
	wooId: number
): ObservableResource<TDocument> {
	const key = React.useMemo<DocumentKey>(() => ({ type: 'woo-id', value: wooId }), [wooId]);
	return useEngineDocumentResource(collectionName, key);
}

/** Bind legacy-shaped documents by numeric Woo identifiers, preserving requested ID order. */
export function useEngineDocumentsByWooId<TDocument extends object>(
	collectionName: LegacyCollectionName,
	wooIds: number[]
): ObservableResource<TDocument[]> {
	const manager = useQueryManager();
	const wooIdsKey = wooIds.join('\u0000');
	const stableWooIds = React.useMemo(
		() => (wooIdsKey === '' ? [] : [...new Set(wooIdsKey.split('\u0000').map(Number))]),
		[wooIdsKey]
	);
	const resource = React.useMemo(() => {
		const documents$ = new Observable<EngineDatabase | null>((subscriber) =>
			manager.engine.db$((database) =>
				subscriber.next(database as unknown as EngineDatabase | null)
			)
		).pipe(
			switchMap((database) => {
				if (!database) {
					return NEVER;
				}

				const collection = database.collections[
					engineCollectionNameFor(collectionName)
				] as unknown as EngineCollection | undefined;
				if (!collection || stableWooIds.length === 0) {
					return of([] as EngineRxDocument[]);
				}

				const wooIdPath = resolveLegacyField(collectionName, 'id').enginePath;
				return collection.find({ selector: { [wooIdPath]: { $in: stableWooIds } } }).$.pipe(
					map((documents) => {
						const order = new Map(stableWooIds.map((id, index) => [id, index]));
						return [...documents].sort((a, b) => {
							const aId = Number((a as unknown as Record<string, unknown>)[wooIdPath]);
							const bId = Number((b as unknown as Record<string, unknown>)[wooIdPath]);
							return (
								(order.get(aId) ?? Number.MAX_SAFE_INTEGER) -
								(order.get(bId) ?? Number.MAX_SAFE_INTEGER)
							);
						});
					})
				);
			}),
			map((documents) =>
				documents.map((document) => wrapEngineDocument<TDocument>(collectionName, document))
			)
		);
		return new ObservableResource(documents$);
	}, [collectionName, manager, stableWooIds]);

	React.useEffect(() => {
		// ObservableResource owns the db$/RxDB subscriptions and must release them on rebind/unmount.
		return () => resource.destroy();
	}, [resource]);

	return resource;
}
