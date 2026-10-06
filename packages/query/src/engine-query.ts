import { EMPTY, from, Observable, of, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { foldSearchText, searchTerms } from '@wcpos/sync-core';
import type { CoverageTarget, CoverageVerdict, RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	engineCollectionNameFor,
	type EngineDocument,
	type LegacyCollectionName,
} from './engine-adapter/collection-map';
import {
	type AdapterDatabase,
	type CompiledQueryRead,
	type EngineRxDocument,
	executeAdapterQuery,
} from './engine-adapter/execute-query';
import { legacySearchSnapshot } from './engine-adapter/search-snapshot';
import { recoverEngineCollectionStorage } from './logs-storage-recovery';
import { searchBlobFor } from './search-blob';
import { searchFieldsFor } from './search-fields';

import type { SearchableCollection } from './search-shared';
import type { LegacyMangoSelector } from './engine-adapter/translate-selector';
import type { QueryResult } from './query-result';
import type { MangoQuerySortPart, RxCollection, RxDatabase } from 'rxdb';

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
		/**
		 * The boot barrier: `ready` exists so a subscription taken before the
		 * first scope opens still gets a database, for a host whose `db$` does not
		 * re-emit on open. It is awaited for TIMING and the database is re-read
		 * from `active()` afterwards — publishing a database carried BY `ready`
		 * would name the scope the engine booted on forever (#1542; `ready` is
		 * valueless now, so that is no longer expressible).
		 *
		 * `whenActive()` is deliberately NOT used here: this is a subscription,
		 * not a read, and a torn-down engine must publish `null` to its
		 * subscribers rather than reject at nobody.
		 */
		void engine.ready
			.then(() => publishIfChanged(engine.active()?.database ?? null))
			.catch(() => undefined);
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

/**
 * The ids a search term selects, or `null` when there is no term. One path for every
 * collection (#2411): the folded blob answers from local rows and re-answers on the
 * collection's change stream. A collection without search fields answers nothing — never
 * everything — so a stray term on an unsearchable panel cannot select the whole table.
 */
function matchingSelectors$(
	database: AdapterDatabase,
	descriptor: EngineQueryDescriptor
): Observable<{ selector: LegacyMangoSelector; hitIds: string[] | null }> {
	const selector = descriptor.selector ?? {};
	const search = (descriptor.read?.search ?? descriptor.search)?.trim() ?? '';
	if (!search) return of({ selector, hitIds: null });

	const collectionName = engineCollectionNameFor(descriptor.collection);
	const collection = database.collections[collectionName] as unknown as
		SearchableCollection | undefined;
	if (!collection) return of({ selector, hitIds: [] });

	// A query that folds away entirely (only combining marks) matches everything, like
	// WooCommerce's ai_ci LIKE would (#1732).
	if (!foldSearchText(search)) return of({ selector, hitIds: null });
	const terms = searchTerms(search);
	if (terms.length === 0) return of({ selector, hitIds: [] });

	const searchFields =
		descriptor.read?.searchFields ??
		descriptor.searchFields ??
		collection.options?.searchFields ??
		searchFieldsFor(descriptor.collection) ??
		[];
	if (searchFields.length === 0) return of({ selector, hitIds: [] });

	const documentSnapshot = (document: EngineRxDocument): Record<string, unknown> =>
		legacySearchSnapshot(descriptor.collection, document);
	const blob = searchBlobFor(collection, searchFields, documentSnapshot, descriptor.collection);
	return blob.changes$.pipe(map(() => ({ selector, hitIds: blob.search(terms) })));
}

function emptyResult(): QueryResult<RxCollection> {
	return { count: 0, hits: [] };
}

/**
 * The empty result emitted while no engine database is bound yet. While a
 * search term is active this is NOT an answer — rendering it as "no products
 * found" is the lie #1733 was filed over — so it carries `searchState:
 * 'pending'` for the empty state to distinguish.
 */
function pendingSearchResult(): QueryResult<RxCollection> {
	return { count: 0, hits: [], searchState: 'pending' };
}

/** Direct reactive read against the current engine database through the adapter execute path. */
export function observeEngineQuery(
	engine: RxdbSyncEngine,
	descriptor: EngineQueryDescriptor
): Observable<QueryResult<RxCollection>> {
	const search = (descriptor.read?.search ?? descriptor.search)?.trim() ?? '';
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
			if (!database || !collection) {
				return of(search ? pendingSearchResult() : emptyResult());
			}
			return matchingSelectors$(database, descriptor).pipe(
				switchMap(({ selector, hitIds }) =>
					executeAdapterQuery({
						database,
						collection: descriptor.collection,
						selector,
						hitIds,
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
					})),
					// Every selector the search path emits derives from an actual blob answer,
					// so reaching here with a term settles the state.
					...(search ? { searchState: 'answered' as const } : {}),
				})),
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
