import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { combineLatest, defer, EMPTY, from, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { useQueryManager } from './provider';
import { recoverLogsCollectionStorage } from './logs-storage-recovery';

import type { QueryResult } from './query-result';
import type { MonoTypeOperatorFunction } from 'rxjs';
import type { MangoQuerySelector, MangoQuerySortPart, RxCollection, RxDocument } from 'rxdb';

type LocalDocumentData = Record<string, unknown>;
type LocalDocument = RxDocument<LocalDocumentData>;
type LocalCollection = RxCollection<LocalDocumentData>;

type LocalSearch = {
	collection: LocalCollection;
	find(term: string): Promise<LocalDocument[]>;
};

export interface LocalQueryOptions {
	collectionName: 'logs';
	selector?: MangoQuerySelector<LocalDocumentData>;
	sort?: MangoQuerySortPart<LocalDocumentData>[];
	limit?: number;
	search?: string;
}

function recoverAsEmpty<T>(collection: LocalCollection): MonoTypeOperatorFunction<T> {
	return catchError((error: unknown) =>
		from(recoverLogsCollectionStorage(collection, error)).pipe(
			switchMap((recovered) => {
				return recovered ? EMPTY : throwError(() => error);
			})
		)
	);
}

function selectorForSearch(
	collection: LocalCollection,
	selector: MangoQuerySelector<LocalDocumentData>,
	documents: LocalDocument[]
): MangoQuerySelector<LocalDocumentData> {
	const primaryPath = collection.schema.primaryPath;
	const ids = documents.map((document) => document.primary);
	const searchSelector = { [primaryPath]: { $in: ids } } as MangoQuerySelector<LocalDocumentData>;
	return Object.keys(selector).length === 0
		? searchSelector
		: ({ $and: [selector, searchSelector] } as MangoQuerySelector<LocalDocumentData>);
}

function localQueryResult$(
	collection: LocalCollection,
	locale: string,
	options: LocalQueryOptions
) {
	const selector = options.selector ?? {};
	const search = options.search?.trim() ?? '';
	const selectors$ = search
		? defer(() =>
				from(
					(
						collection as unknown as { initSearch(locale: string): Promise<LocalSearch> }
					).initSearch(locale)
				)
			).pipe(
				switchMap((searchInstance) =>
					searchInstance.collection.$.pipe(
						startWith(null),
						switchMap(() => from(searchInstance.find(search)))
					)
				),
				map((documents) => selectorForSearch(collection, selector, documents))
			)
		: of(selector);

	return selectors$.pipe(
		switchMap((matchingSelector) => {
			const startedAt = performance.now();
			const documents$ = collection
				.find({
					selector: matchingSelector,
					sort: options.sort,
					limit: options.limit,
				})
				.$.pipe(recoverAsEmpty<LocalDocument[]>(collection), startWith([] as LocalDocument[]));
			const total$ = collection
				.count({ selector: matchingSelector })
				.$.pipe(recoverAsEmpty<number>(collection), startWith(0));
			return combineLatest([documents$, total$]).pipe(
				map(
					([documents, count]): QueryResult<LocalCollection> => ({
						elapsed: performance.now() - startedAt,
						searchActive: search.length > 0,
						count,
						hits: documents.map((document) => ({
							id: String(document.primary),
							score: 0,
							document,
						})),
					})
				)
			);
		}),
		shareReplay({ bufferSize: 1, refCount: true })
	);
}

/** Direct local-only query binding. It never registers engine demand. */
export const useLocalQuery = (options: LocalQueryOptions) => {
	const runtime = useQueryManager();
	const collection = runtime.localDB.collections[options.collectionName] as LocalCollection;
	const key = JSON.stringify(options);
	const stableOptions = React.useMemo(() => JSON.parse(key) as LocalQueryOptions, [key]);
	const result$ = React.useMemo(
		() => localQueryResult$(collection, runtime.locale, stableOptions),
		[collection, runtime.locale, stableOptions]
	);
	const resource = React.useMemo(() => new ObservableResource(result$), [result$]);
	const total$ = React.useMemo(
		() => result$.pipe(map((result) => result.count ?? result.hits.length)),
		[result$]
	);

	React.useEffect(() => {
		// ObservableResource owns the local RxDB subscriptions for this descriptor.
		return () => resource.destroy();
	}, [resource]);

	return { resource, result$, total$ };
};
