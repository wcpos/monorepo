import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { EMPTY, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
	engineCollection,
	type EngineRecord,
	type EngineRecordCollectionName,
	observeEngineDatabases,
	useQueryRuntime,
} from '@wcpos/query';
import { remoteIdOrNull, wooIdOf } from '@wcpos/sync-core';

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
