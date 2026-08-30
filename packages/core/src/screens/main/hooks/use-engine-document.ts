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
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	acquireEngineResource,
	releaseEngineResource,
	retainEngineResource,
} from './engine-record-resource';

import type { Observable } from 'rxjs';

/**
 * Bind one keyed resource for the lifetime of this consumer.
 *
 * The resource is fetched from a cache OUTSIDE React rather than built in a `useMemo`,
 * because a consumer that suspends before it has ever committed loses its hook state and
 * would otherwise rebuild — and re-suspend on — a fresh resource on every Suspense retry,
 * forever. See `engine-record-resource.ts` for the full mechanism.
 */
function useEngineResource<T>(
	engine: RxdbSyncEngine,
	key: string,
	createInput$: () => Observable<T>
): ObservableResource<T> {
	const [, rebind] = React.useReducer((attempt: number) => attempt + 1, 0);
	const entry = acquireEngineResource(engine, key, createInput$);

	React.useEffect(() => {
		if (entry.resource.isDestroyed) {
			// The last mounted reader released this entry between this render and this effect —
			// only possible when a component sharing the key unmounted in the same commit. The
			// cache has already dropped it, so re-render onto a fresh resource rather than bind
			// to a dead subscription.
			rebind();
			return;
		}
		// ObservableResource owns the db$/RxDB subscriptions; the last release destroys them.
		retainEngineResource(entry);
		return () => releaseEngineResource(entry);
	}, [entry]);

	return entry.resource;
}

/** Bind one engine-native record by its UUID primary key. */
export function useEngineRecord<C extends EngineRecordCollectionName>(
	collectionName: C,
	uuid: string
): ObservableResource<EngineRecord<C> | null> {
	const { engine } = useQueryRuntime();

	return useEngineResource<EngineRecord<C> | null>(engine, `uuid:${collectionName}:${uuid}`, () =>
		observeEngineDatabases(engine).pipe(
			switchMap((database) => {
				const collection = engineCollection(database, collectionName);
				if (!collection) {
					return EMPTY;
				}

				return collection.findOne(uuid).$;
			})
		)
	);
}

/** Bind one engine-native record by its numeric Woo identifier. */
export function useEngineRecordByWooId<C extends EngineRecordCollectionName>(
	collectionName: C,
	wooId: number
): ObservableResource<EngineRecord<C> | null> {
	const { engine } = useQueryRuntime();

	return useEngineResource<EngineRecord<C> | null>(engine, `woo:${collectionName}:${wooId}`, () => {
		// An invalid Woo id (0, negative, NaN) must resolve to null rather than query
		// `remoteId: null`, which would match a locally-created unacknowledged record
		// on writeable collections.
		const remoteId = remoteIdOrNull(wooId);

		return observeEngineDatabases(engine).pipe(
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
	});
}

/** Bind engine-native records by numeric Woo identifiers, preserving requested ID order. */
export function useEngineRecordsByWooId<C extends EngineRecordCollectionName>(
	collectionName: C,
	wooIds: number[]
): ObservableResource<EngineRecord<C>[]> {
	const { engine } = useQueryRuntime();
	const wooIdsKey = wooIds.join(',');
	const stableWooIds = React.useMemo(
		() => (wooIdsKey === '' ? [] : [...new Set(wooIdsKey.split(',').map(Number))]),
		[wooIdsKey]
	);

	return useEngineResource<EngineRecord<C>[]>(
		engine,
		// The requested order is part of the identity: it decides the emitted sort order.
		`woos:${collectionName}:${stableWooIds.join(',')}`,
		() => {
			const stableRemoteIds = stableWooIds
				.map(remoteIdOrNull)
				.filter((remoteId) => remoteId !== null);

			return observeEngineDatabases(engine).pipe(
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
		}
	);
}
