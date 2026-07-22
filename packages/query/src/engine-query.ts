import { defer, EMPTY, from, Observable, of, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	engineCollectionNameFor,
	type EngineDocument,
	type LegacyCollectionName,
} from './engine-adapter/collection-map';
import { wrapEngineDocument } from './engine-adapter/document-proxy';
import {
	type AdapterDatabase,
	type EngineRxDocument,
	executeAdapterQuery,
} from './engine-adapter/execute-query';
import { recoverEngineCollectionStorage } from './logs-storage-recovery';

import type { LegacyMangoSelector } from './engine-adapter/translate-selector';
import type { QueryResult } from './query-result';
import type { MangoQuerySortPart, RxCollection, RxDatabase } from 'rxdb';

type SearchInstance = {
	collection: { $: Observable<unknown> };
	find(term: string): Promise<EngineRxDocument[]>;
};

type SearchableCollection = {
	$: Observable<unknown>;
	initSearch(
		locale: string,
		options: {
			searchFields?: string[];
			documentSnapshot(document: EngineRxDocument): Record<string, unknown>;
		}
	): Promise<SearchInstance>;
};

export interface EngineQueryDescriptor {
	collection: LegacyCollectionName;
	selector?: LegacyMangoSelector;
	sort?: MangoQuerySortPart<EngineDocument>[];
	skip?: number;
	limit?: number;
	search?: string;
	searchFields?: string[];
}

export function observeEngineDatabases(engine: RxdbSyncEngine): Observable<RxDatabase | null> {
	return new Observable<RxDatabase | null>((subscriber) => {
		let current: RxDatabase | null | undefined;
		const publishIfChanged = (database: RxDatabase | null) => {
			if (database === current) return;
			current = database;
			subscriber.next(database);
		};
		publishIfChanged(engine.active()?.database ?? null);
		let subscribing = true;
		const unsubscribe = engine.db$((database) => {
			if (subscribing && database === current) return;
			current = database;
			subscriber.next(database);
		});
		subscribing = false;
		void engine.ready.then((scope) => publishIfChanged(scope.database)).catch(() => undefined);
		return unsubscribe;
	});
}

function withSearchSelector(selector: LegacyMangoSelector, ids: string[]): LegacyMangoSelector {
	const searchSelector = { uuid: { $in: ids } } as LegacyMangoSelector;
	return Object.keys(selector).length === 0
		? searchSelector
		: ({ $and: [selector, searchSelector] } as LegacyMangoSelector);
}

function matchingSelectors$(
	database: AdapterDatabase,
	descriptor: EngineQueryDescriptor,
	locale: string
): Observable<LegacyMangoSelector> {
	const selector = descriptor.selector ?? {};
	const search = descriptor.search?.trim() ?? '';
	if (!search) return of(selector);

	const collectionName = engineCollectionNameFor(descriptor.collection);
	const collection = database.collections[collectionName] as unknown as
		| SearchableCollection
		| undefined;
	if (!collection?.initSearch) return of(withSearchSelector(selector, []));

	return defer(() =>
		from(
			collection.initSearch(locale, {
				searchFields: descriptor.searchFields,
				documentSnapshot: (document) =>
					(
						wrapEngineDocument(descriptor.collection, document).toJSON as () => Record<
							string,
							unknown
						>
					)(),
			})
		)
	).pipe(
		switchMap((searchInstance) =>
			searchInstance.collection.$.pipe(
				startWith(null),
				switchMap(() => from(searchInstance.find(search)))
			)
		),
		map((documents) =>
			withSearchSelector(
				selector,
				documents.map((document) => document.primary)
			)
		)
	);
}

function emptyResult(): QueryResult<RxCollection> {
	return { elapsed: 0, searchActive: false, count: 0, hits: [] };
}

/** Direct reactive read against the current engine database through the adapter execute path. */
export function observeEngineQuery(
	engine: RxdbSyncEngine,
	locale: string,
	descriptor: EngineQueryDescriptor
): Observable<QueryResult<RxCollection>> {
	return observeEngineDatabases(engine).pipe(
		map((database) => {
			const adapterDatabase = database as unknown as AdapterDatabase | null;
			return {
				database: adapterDatabase,
				collection: adapterDatabase?.collections[engineCollectionNameFor(descriptor.collection)],
			};
		}),
		distinctUntilChanged(
			(previous, current) =>
				previous.database === current.database && previous.collection === current.collection
		),
		switchMap(({ database, collection }) => {
			if (!database || !collection) return of(emptyResult());
			return matchingSelectors$(database, descriptor, locale).pipe(
				switchMap((selector) =>
					executeAdapterQuery({
						database,
						collection: descriptor.collection,
						selector,
						sort: descriptor.sort,
						skip: descriptor.skip,
						limit: descriptor.limit,
					})
				),
				map(
					(result): QueryResult<RxCollection> => ({
						elapsed: result.elapsed,
						searchActive: Boolean(descriptor.search?.trim()),
						count: result.count,
						hits: result.hits.map((document) => ({
							id: document.primary,
							score: 0,
							document: wrapEngineDocument(descriptor.collection, document),
						})),
					})
				),
				catchError((error) =>
					from(
						recoverEngineCollectionStorage(
							engine,
							engineCollectionNameFor(descriptor.collection),
							error
						)
					).pipe(switchMap((recovered) => (recovered ? EMPTY : throwError(() => error))))
				)
			);
		})
	);
}
