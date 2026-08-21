import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { EMPTY, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
	engineCollection,
	engineCollectionNameFor,
	type EngineRecord,
	type EngineRecordCollectionName,
	type LegacyCollectionName,
	observeEngineDatabases,
	useQueryRuntime,
	wrapEngineDocument,
} from '@wcpos/query';
import { remoteIdOrNull, wooIdOf } from '@wcpos/sync-core';

type AnyEngineRecord = EngineRecord<EngineRecordCollectionName>;

type DocumentKey = { type: 'uuid'; value: string } | { type: 'woo-id'; value: number };

function engineDocument$(
	runtime: ReturnType<typeof useQueryRuntime>,
	collectionName: LegacyCollectionName,
	key: DocumentKey
): Observable<AnyEngineRecord | null> {
	return observeEngineDatabases(runtime.engine).pipe(
		switchMap((database) => {
			// Resolve after every db$ emission: scope moves and resets replace collection residents.
			const collection = engineCollection(database, engineCollectionNameFor(collectionName));
			if (!collection) {
				return EMPTY;
			}

			const query =
				key.type === 'uuid' ? key.value : { selector: { remoteId: remoteIdOrNull(key.value) } };
			return collection.findOne(query).$;
		})
	);
}

export function engineDocumentByWooId$<TDocument extends object>(
	runtime: ReturnType<typeof useQueryRuntime>,
	collectionName: LegacyCollectionName,
	wooId: number
): Observable<TDocument | null> {
	return engineDocument$(runtime, collectionName, { type: 'woo-id', value: wooId }).pipe(
		map((document) => document && wrapEngineDocument<TDocument>(collectionName, document as never))
	);
}

function useEngineDocumentResource<TDocument extends object>(
	collectionName: LegacyCollectionName,
	key: DocumentKey
): ObservableResource<TDocument> {
	const runtime = useQueryRuntime();
	const resource = React.useMemo(() => {
		const document$ = engineDocument$(runtime, collectionName, key).pipe(
			map((document) =>
				document === null ? null : wrapEngineDocument<TDocument>(collectionName, document as never)
			)
		);
		return new ObservableResource(document$ as Observable<TDocument>);
	}, [collectionName, key, runtime]);

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

/** Bind one engine-native record by its UUID primary key. */
export function useEngineRecord<C extends EngineRecordCollectionName>(
	collectionName: C,
	uuid: string
): ObservableResource<EngineRecord<C> | null> {
	const runtime = useQueryRuntime();
	const resource = React.useMemo(() => {
		const record$ = observeEngineDatabases(runtime.engine).pipe(
			switchMap((database) => {
				const collection = engineCollection(database, collectionName);
				if (!collection) {
					return EMPTY;
				}

				return collection.findOne(uuid).$;
			})
		);
		return new ObservableResource(record$);
	}, [collectionName, runtime, uuid]);

	React.useEffect(() => {
		// ObservableResource owns the db$/RxDB subscriptions and must release them on rebind/unmount.
		return () => resource.destroy();
	}, [resource]);

	return resource;
}

/** Bind one engine-native record by its numeric Woo identifier. */
export function useEngineRecordByWooId<C extends EngineRecordCollectionName>(
	collectionName: C,
	wooId: number
): ObservableResource<EngineRecord<C> | null> {
	const runtime = useQueryRuntime();
	const resource = React.useMemo(() => {
		// An invalid Woo id (0, negative, NaN) must resolve to null rather than query
		// `remoteId: null`, which would match a locally-created unacknowledged record
		// on writeable collections.
		const remoteId = remoteIdOrNull(wooId);
		const record$ = observeEngineDatabases(runtime.engine).pipe(
			switchMap((database) => {
				const collection = engineCollection(database, collectionName);
				if (!collection) {
					return EMPTY;
				}
				if (remoteId === null) {
					return of(null);
				}

				return collection.findOne({ selector: { remoteId } }).$;
			})
		);
		return new ObservableResource(record$);
	}, [collectionName, runtime, wooId]);

	React.useEffect(() => {
		// ObservableResource owns the db$/RxDB subscriptions and must release them on rebind/unmount.
		return () => resource.destroy();
	}, [resource]);

	return resource;
}

/** Bind legacy-shaped documents by numeric Woo identifiers, preserving requested ID order. */
export function useEngineDocumentsByWooId<TDocument extends object>(
	collectionName: LegacyCollectionName,
	wooIds: number[]
): ObservableResource<TDocument[]> {
	const runtime = useQueryRuntime();
	const wooIdsKey = wooIds.join('\u0000');
	const stableWooIds = React.useMemo(
		() => (wooIdsKey === '' ? [] : [...new Set(wooIdsKey.split('\u0000').map(Number))]),
		[wooIdsKey]
	);
	const stableRemoteIds = React.useMemo(
		() => stableWooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
		[stableWooIds]
	);
	const resource = React.useMemo(() => {
		const documents$ = observeEngineDatabases(runtime.engine).pipe(
			switchMap((database) => {
				const collection = engineCollection(database, engineCollectionNameFor(collectionName));
				if (!collection || stableWooIds.length === 0) {
					return of([] as AnyEngineRecord[]);
				}

				return collection.find({ selector: { remoteId: { $in: stableRemoteIds } } }).$.pipe(
					map((documents) => {
						const order = new Map(stableWooIds.map((id, index) => [id, index]));
						return [...documents].sort((a, b) => {
							const aId = a.remoteId === null ? undefined : wooIdOf(a.remoteId);
							const bId = b.remoteId === null ? undefined : wooIdOf(b.remoteId);
							const aOrder = aId === undefined ? undefined : order.get(aId);
							const bOrder = bId === undefined ? undefined : order.get(bId);
							return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
						});
					})
				);
			}),
			map((documents) =>
				documents.map((document) =>
					wrapEngineDocument<TDocument>(collectionName, document as never)
				)
			)
		);
		return new ObservableResource(documents$);
	}, [collectionName, runtime, stableRemoteIds, stableWooIds]);

	React.useEffect(() => {
		// ObservableResource owns the db$/RxDB subscriptions and must release them on rebind/unmount.
		return () => resource.destroy();
	}, [resource]);

	return resource;
}

/** Bind engine-native records by numeric Woo identifiers, preserving requested ID order. */
export function useEngineRecordsByWooId<C extends EngineRecordCollectionName>(
	collectionName: C,
	wooIds: number[]
): ObservableResource<EngineRecord<C>[]> {
	const runtime = useQueryRuntime();
	const wooIdsKey = wooIds.join('\u0000');
	const stableWooIds = React.useMemo(
		() => (wooIdsKey === '' ? [] : [...new Set(wooIdsKey.split('\u0000').map(Number))]),
		[wooIdsKey]
	);
	const stableRemoteIds = React.useMemo(
		() => stableWooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
		[stableWooIds]
	);
	const resource = React.useMemo(() => {
		const records$ = observeEngineDatabases(runtime.engine).pipe(
			switchMap((database) => {
				const collection = engineCollection(database, collectionName);
				if (!collection || stableWooIds.length === 0) {
					return of([] as EngineRecord<C>[]);
				}

				return collection.find({ selector: { remoteId: { $in: stableRemoteIds } } }).$.pipe(
					map((records) => {
						const order = new Map(stableWooIds.map((id, index) => [id, index]));
						return [...records].sort((a, b) => {
							const aId = a.remoteId === null ? undefined : wooIdOf(a.remoteId);
							const bId = b.remoteId === null ? undefined : wooIdOf(b.remoteId);
							const aOrder = aId === undefined ? undefined : order.get(aId);
							const bOrder = bId === undefined ? undefined : order.get(bId);
							return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
						});
					})
				);
			})
		);
		return new ObservableResource(records$);
	}, [collectionName, runtime, stableRemoteIds, stableWooIds]);

	React.useEffect(() => {
		// ObservableResource owns the db$/RxDB subscriptions and must release them on rebind/unmount.
		return () => resource.destroy();
	}, [resource]);

	return resource;
}
