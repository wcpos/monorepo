import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { Observable, of } from 'rxjs';
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
};

type DocumentKey = { type: 'uuid'; value: string } | { type: 'woo-id'; value: number };

function engineDocument$(
	manager: ReturnType<typeof useQueryManager>,
	collectionName: LegacyCollectionName,
	key: DocumentKey
): Observable<EngineRxDocument | null> {
	return new Observable((subscriber) =>
		manager.engine.db$(() => subscriber.next(manager.engine.active()?.database ?? null))
	).pipe(
		switchMap(() => {
			// Resolve after every db$ emission: scope moves and resets replace collection residents.
			const database = manager.engine.active()?.database;
			const collection = database?.collections[
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
