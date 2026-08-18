import { defer, EMPTY, from, Observable, of, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';
import get from 'lodash/get';

import type { CoverageTarget, CoverageVerdict, RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	engineCollectionNameFor,
	type EngineDocument,
	type LegacyCollectionName,
} from './engine-adapter/collection-map';
import { wrapEngineDocument } from './engine-adapter/document-proxy';
import {
	type AdapterDatabase,
	type CompiledQueryRead,
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
	options?: { searchFields?: string[] };
	find(): { exec(): Promise<EngineRxDocument[]> };
	initSearch(
		locale: string,
		options: {
			searchFields?: string[];
			documentSnapshot(document: EngineRxDocument): Record<string, unknown>;
		}
	): Promise<SearchInstance>;
};

const SEARCH_INDEX_ERROR = Symbol('search-index-error');
/** Must equal FlexSearch `minlength` in packages/database/src/plugins/search.ts. */
export const FLEXSEARCH_MIN_TERM_LENGTH = 3;

export interface EngineQueryDescriptor {
	collection: LegacyCollectionName;
	selector?: LegacyMangoSelector;
	sort?: MangoQuerySortPart<EngineDocument>[];
	skip?: number;
	limit?: number;
	search?: string;
	searchFields?: string[];
	/** Precompiled query-state read face; selectors remain the escape hatch for hand-built queries. */
	read?: CompiledQueryRead;
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

/**
 * The engine's coverage verdict for one target, as an Observable.
 *
 * The door is callback-shaped on purpose — the engine carries no RxJS — so the adaptation lives
 * here, next to `observeEngineDatabases`. It publishes synchronously on subscribe, so a caller
 * combining it with a local count never waits on a first emission.
 */
export function observeCoverage(
	engine: RxdbSyncEngine,
	target: CoverageTarget
): Observable<CoverageVerdict> {
	return new Observable<CoverageVerdict>((subscriber) =>
		engine.coverageChanges(target, (verdict) => subscriber.next(verdict))
	);
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
	const search = (descriptor.read?.search ?? descriptor.search)?.trim() ?? '';
	if (!search) return of(selector);

	const collectionName = engineCollectionNameFor(descriptor.collection);
	const collection = database.collections[collectionName] as unknown as
		SearchableCollection | undefined;
	if (!collection?.initSearch) return of(withSearchSelector(selector, []));
	const documentSnapshot = (document: EngineRxDocument): Record<string, unknown> =>
		(wrapEngineDocument(descriptor.collection, document).toJSON as () => Record<string, unknown>)();

	if (search.length < FLEXSEARCH_MIN_TERM_LENGTH) {
		const prefix = search.toLowerCase();
		// Mirror initSearch's fallback so short and indexed terms search the same fields.
		const searchFields =
			descriptor.read?.searchFields ??
			descriptor.searchFields ??
			collection.options?.searchFields ??
			[];
		// No SEARCH_INDEX_ERROR tagging here: this path has no search index, so a failure
		// is a genuine collection read error and must stay eligible for storage recovery.
		return collection.$.pipe(
			startWith(null),
			switchMap(() => from(collection.find().exec())),
			map((documents) =>
				withSearchSelector(
					selector,
					documents
						.filter((document) => {
							const snapshot = documentSnapshot(document);
							return searchFields.some((field) =>
								String(get(snapshot, field) ?? '')
									.split(/\s+/)
									.some((token) => token.toLowerCase().startsWith(prefix))
							);
						})
						.map((document) => document.primary)
				)
			)
		);
	}

	return defer(() =>
		from(
			collection.initSearch(locale, {
				searchFields: descriptor.read?.searchFields ?? descriptor.searchFields,
				documentSnapshot,
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
		),
		catchError((error) => throwError(() => ({ [SEARCH_INDEX_ERROR]: error })))
	);
}

function emptyResult(): QueryResult<RxCollection> {
	return { count: 0, hits: [] };
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
						read: descriptor.read,
					})
				),
				map((result): QueryResult<RxCollection> => ({
					count: result.count,
					hits: result.hits.map((document) => ({
						id: document.primary,
						record: document,
						document: wrapEngineDocument(descriptor.collection, document),
					})),
				})),
				catchError((error) => {
					if (error && SEARCH_INDEX_ERROR in error) {
						return throwError(() => error[SEARCH_INDEX_ERROR]);
					}
					return from(
						recoverEngineCollectionStorage(
							engine,
							engineCollectionNameFor(descriptor.collection),
							error
						)
					).pipe(switchMap((recovered) => (recovered ? EMPTY : throwError(() => error))));
				})
			);
		})
	);
}
