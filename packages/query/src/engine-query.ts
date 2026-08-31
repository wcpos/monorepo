import {
	asyncScheduler,
	defer,
	EMPTY,
	from,
	merge,
	Observable,
	of,
	ReplaySubject,
	throwError,
	timer,
} from 'rxjs';
import {
	catchError,
	distinctUntilChanged,
	map,
	startWith,
	switchMap,
	takeUntil,
	tap,
	throttleTime,
} from 'rxjs/operators';
import get from 'lodash/get';

import { FLEXSEARCH_MIN_TERM_LENGTH } from '@wcpos/sync-core';
import type { CoverageTarget, CoverageVerdict, RxdbSyncEngine } from '@wcpos/sync-engine';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

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
import {
	FLEXSEARCH_TOKEN_BOUNDARY,
	normalizeForScan,
	rebuiltSearchIndexes,
	type SearchableCollection,
	searchLogger,
	sharedSearchInstances,
} from './search-shared';

import type { LegacyMangoSelector } from './engine-adapter/translate-selector';
import type { QueryResult } from './query-result';
import type { MangoQuerySortPart, RxCollection, RxDatabase } from 'rxdb';

/**
 * How long one search waits for the FlexSearch index before answering from a
 * direct document scan. A healthy, built index answers in single-digit
 * milliseconds; this deadline only passes while the index is still building or
 * its pipeline cannot run at all (a follower tab, a backgrounded leader —
 * #1733). 250ms keeps the worst-case first answer under half a second
 * including the input debounce, without paying a scan on healthy keystrokes.
 */
const SEARCH_INDEX_ANSWER_DEADLINE_MS = 250;
/** Collapse scan re-runs while sync churn streams source-collection events. */
const SEARCH_SCAN_RETHROTTLE_MS = 500;
/** Log the scan takeover once per collection:locale per session, not per keystroke. */
const stalledSearchIndexes = new Set<string>();
// Owned by the side that builds the index; re-exported for existing consumers.
export { FLEXSEARCH_MIN_TERM_LENGTH };

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

function withSearchSelector(selector: LegacyMangoSelector, ids: string[]): LegacyMangoSelector {
	const searchSelector = { uuid: { $in: ids } } as LegacyMangoSelector;
	return Object.keys(selector).length === 0
		? searchSelector
		: ({ $and: [selector, searchSelector] } as LegacyMangoSelector);
}

const DIACRITICS = /[\u0300-\u036f]/g;
function normalizeSearchValue(value: unknown) {
	return String(value).toLowerCase().normalize('NFD').replace(DIACRITICS, '');
}

/**
 * The fallback answer when the index cannot answer: match the query directly
 * against the documents, mirroring the index's semantics — per-token AND over
 * the same fields joined into one blob, substring match (`tokenize: 'full'`),
 * tokens under the index's minimum length dropped as the index drops them.
 *
 * The scan reads the documents themselves, so its answer is ground truth for
 * local data; the indexed answer replaces it only because the index also
 * carries the query cheaply on every later keystroke.
 */
async function scanDocumentsForSearch(
	collection: SearchableCollection,
	search: string,
	searchFields: string[],
	documentSnapshot: (document: EngineRxDocument) => Record<string, unknown>
): Promise<EngineRxDocument[]> {
	const tokens = normalizeForScan(search)
		.split(FLEXSEARCH_TOKEN_BOUNDARY)
		.filter((token) => token.length >= FLEXSEARCH_MIN_TERM_LENGTH);
	if (tokens.length === 0 || searchFields.length === 0) return [];
	const documents = await collection.find().exec();
	return documents.filter((document) => {
		const snapshot = documentSnapshot(document);
		const blob = normalizeForScan(
			searchFields.map((field) => String(get(snapshot, field) ?? '')).join(' ')
		);
		return tokens.every((token) => blob.includes(token));
	});
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
		legacySearchSnapshot(descriptor.collection, document);

	if (search.length < FLEXSEARCH_MIN_TERM_LENGTH) {
		const prefix = search.toLowerCase();
		// Mirror initSearch's fallback so short and indexed terms search the same fields.
		const searchFields =
			descriptor.read?.searchFields ??
			descriptor.searchFields ??
			collection.options?.searchFields ??
			[];
		// No error handling here on purpose: this path has no search index, so a failure
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
	const configuredFields = descriptor.read?.searchFields ?? descriptor.searchFields;
	const searchFields = configuredFields ?? collection.options?.searchFields ?? [];
	const findFalseHits = (documents: EngineRxDocument[]) => {
		const tokens = normalizeSearchValue(search)
			.split(FLEXSEARCH_TOKEN_BOUNDARY)
			.filter((token) => token.length >= FLEXSEARCH_MIN_TERM_LENGTH);
		if (searchFields.length === 0 || tokens.length === 0) return [];
		return documents.flatMap((document) => {
			const snapshot = documentSnapshot(document);
			const fields = searchFields.map((field) => String(get(snapshot, field) ?? ''));
			return tokens.some((token) =>
				fields.every((field) => !normalizeSearchValue(field).includes(token))
			)
				? [{ document, uuid: document.primary, fields: fields.join(' ').slice(0, 120) }]
				: [];
		});
	};

	const sharedKey = `${descriptor.collection}:${locale}`;
	const logIndexNotAnswering = (error?: unknown) => {
		if (stalledSearchIndexes.has(sharedKey)) return;
		stalledSearchIndexes.add(sharedKey);
		searchLogger.warn('Search index is not answering; searching by document scan', {
			code: ERROR_CODES.SEARCH_INDEX_STALLED,
			showToast: false,
			context: {
				collection: descriptor.collection,
				locale,
				search,
				...(error instanceof Error ? { error: error.message } : {}),
			},
		});
	};

	return defer(() => {
		// Latched by the FIRST indexed answer for this subscription; the scan lane
		// stands down once the index has proven it can answer this term.
		const indexAnswered$ = new ReplaySubject<void>(1);
		const indexedLane$ = from(
			collection.initSearch(locale, {
				searchFields: descriptor.read?.searchFields ?? descriptor.searchFields,
				documentSnapshot,
			})
		).pipe(
			switchMap((searchInstance) => {
				if (!searchInstance) return EMPTY;
				const searchInstances = sharedSearchInstances(sharedKey, searchInstance);
				return searchInstances.pipe(map((activeSearch) => ({ activeSearch, searchInstances })));
			}),
			switchMap(({ activeSearch, searchInstances }) =>
				activeSearch.collection.$.pipe(
					startWith(null),
					switchMap(() => from(activeSearch.find(search)).pipe(tap(() => indexAnswered$.next()))),
					switchMap(async (documents) => {
						const falseHits = findFalseHits(documents);
						if (falseHits.length === 0) return documents;
						const alreadyRebuilt = rebuiltSearchIndexes.has(sharedKey);
						searchLogger.error('Search index divergence detected', {
							code: ERROR_CODES.SEARCH_INDEX_DIVERGENCE,
							showToast: false,
							context: {
								collection: descriptor.collection,
								locale,
								search,
								falseHits: falseHits.slice(0, 5).map(({ uuid, fields }) => ({ uuid, fields })),
								totalHits: documents.length,
								falseHitCount: falseHits.length,
								...(alreadyRebuilt ? { alreadyRebuilt: true } : {}),
							},
						});
						const filtered = documents.filter((document) =>
							falseHits.every((falseHit) => falseHit.document !== document)
						);
						if (alreadyRebuilt) return filtered;
						rebuiltSearchIndexes.add(sharedKey);
						try {
							await collection.recreateSearch?.(locale);
							const rebuilt = await collection.initSearch(locale, {
								searchFields: descriptor.read?.searchFields ?? descriptor.searchFields,
								documentSnapshot,
							});
							if (rebuilt) searchInstances.next(rebuilt);
							return filtered;
						} catch (error) {
							searchLogger.warn('Search index rebuild failed', {
								context: { collection: descriptor.collection, locale, search, error },
							});
							return filtered;
						}
					})
				)
			),
			// A failed index — an initSearch rejection, a poisoned pipeline surfacing
			// through find() — must never take search down with it: log once and let
			// the scan lane keep answering. The next subscription (next keystroke)
			// tries the index afresh.
			catchError((error) => {
				logIndexNotAnswering(error);
				return EMPTY;
			})
		);
		const scanLane$ = timer(SEARCH_INDEX_ANSWER_DEADLINE_MS).pipe(
			tap(() => logIndexNotAnswering()),
			switchMap(() =>
				collection.$.pipe(
					startWith(null),
					throttleTime(SEARCH_SCAN_RETHROTTLE_MS, asyncScheduler, {
						leading: true,
						trailing: true,
					})
				)
			),
			// No error handling here on purpose: a scan failure is a genuine collection
			// read error and must stay eligible for storage recovery (mirrors the
			// short-term path above).
			switchMap(() =>
				from(scanDocumentsForSearch(collection, search, searchFields, documentSnapshot))
			),
			takeUntil(indexAnswered$)
		);
		return merge(indexedLane$, scanLane$);
	}).pipe(
		map((documents) =>
			withSearchSelector(
				selector,
				documents.map((document) => document.primary)
			)
		)
	);
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
	locale: string,
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
					})),
					// Every selector the search path emits derives from an actual answer
					// (indexed or scanned), so reaching here with a term settles the state.
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
