import { combineLatest, EMPTY, from, Observable, of, throwError } from 'rxjs';
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

/**
 * A child collection whose search matches credit their parent (roadmap#423 R4): with a search
 * term, a parent is a hit when it matches directly or when a child the relation admits does;
 * the child count rides on the hit as `childrenSearchCount`, the term as `parentSearchTerm`,
 * and the parent's window (sort, limit) applies AFTER the union, so every matching child is
 * considered before the limit. Without a term the relation is ignored. The parents the
 * children named are listed on the result as `relatedIds` (resident or not): what an OWNER
 * asks the engine for — this read declares nothing.
 */
export type EngineQueryRelation = {
	collection: LegacyCollectionName;
	/** The child payload field naming the parent's woo id. */
	parentKey: string;
	/** The children the relation admits (the products status filter today). */
	selector?: LegacyMangoSelector;
	searchFields?: string[];
};

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
	/** One child collection whose search matches make their parent a hit (singular by design). */
	relation?: EngineQueryRelation;
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

function searchTermOf(descriptor: EngineQueryDescriptor): string {
	return (descriptor.read?.search ?? descriptor.search)?.trim() ?? '';
}

/**
 * The engine database, re-published whenever it or any of the named collections changes
 * identity (a store switch, a collection recreated by a reset); `null` while any is absent.
 * Every leg of one read hangs off ONE binding, so a store switch rebinds them together.
 */
function observeBinding(
	engine: RxdbSyncEngine,
	collections: LegacyCollectionName[]
): Observable<AdapterDatabase | null> {
	return observeEngineDatabases(engine).pipe(
		map((database) => {
			const adapterDatabase = database as unknown as AdapterDatabase | null;
			return {
				database: adapterDatabase,
				collections: collections.map(
					(name) => adapterDatabase?.collections[engineCollectionNameFor(name)]
				),
			};
		}),
		distinctUntilChanged(
			(previous, current) =>
				previous.database === current.database &&
				previous.collections.every((collection, index) => collection === current.collections[index])
		),
		map(({ database, collections: bound }) => (database && bound.every(Boolean) ? database : null))
	);
}

/** One read against a bound database, with storage recovery on a failed execution. */
function readBound(
	engine: RxdbSyncEngine,
	database: AdapterDatabase,
	descriptor: EngineQueryDescriptor
): Observable<QueryResult<RxCollection>> {
	const search = searchTermOf(descriptor);
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
}

/**
 * The relational search (roadmap#423 R4): direct hits ∪ the parents of matching children,
 * then ONE windowed read over that uuid set. `parent` carries no relation; every leg is a
 * plain read against the same bound database.
 */
function readRelation(
	engine: RxdbSyncEngine,
	database: AdapterDatabase,
	parent: EngineQueryDescriptor,
	relation: EngineQueryRelation,
	search: string
): Observable<QueryResult<RxCollection>> {
	const { read } = parent;
	// The direct leg is unwindowed: the window applies after the union.
	const direct$ = readBound(engine, database, {
		...parent,
		skip: undefined,
		limit: undefined,
		...(read ? { read: { ...read, limit: undefined } } : {}),
	});
	const children$ = readBound(engine, database, {
		collection: relation.collection,
		selector: relation.selector,
		sort: [{ id: 'asc' }],
		search,
		searchFields: relation.searchFields,
	});
	return combineLatest([direct$, children$]).pipe(
		switchMap(([direct, children]) => {
			const counts = new Map<number, number>();
			for (const hit of children.hits) {
				const parentId = Number(hit.record.payload[relation.parentKey]);
				if (Number.isFinite(parentId)) counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
			}
			const parentIds = [...counts.keys()];
			// The union is an ANSWER only once both search legs have answered (#1733). A bound
			// leg always answers; the pending state a reader sees comes from the null-binding
			// emission below and from `combineLatest` holding until both legs have spoken. The
			// guard keeps the contract explicit should a leg ever learn to answer 'pending'.
			const searchAnswered =
				direct.searchState === 'answered' && children.searchState === 'answered';
			const named$ =
				parentIds.length === 0
					? of(emptyResult())
					: readBound(engine, database, {
							collection: parent.collection,
							selector: { id: { $in: parentIds } },
							searchFields: parent.searchFields,
						});
			return named$.pipe(map((named) => ({ direct, named, counts, parentIds, searchAnswered })));
		}),
		switchMap(({ direct, named, counts, parentIds, searchAnswered }) => {
			const uuids = [...new Set([...direct.hits, ...named.hits].map((hit) => hit.id))];
			const uuidWindow = { uuid: { $in: uuids } };
			const own = parent.selector ?? {};
			return readBound(engine, database, {
				...parent,
				search: undefined,
				...(read ? { read: { ...read, search: '' } } : {}),
				// The parent's own selector still bounds the union: a parent it excludes stays out
				// even when one of its children matched.
				selector: Object.keys(own).length > 0 ? { $and: [own, uuidWindow] } : uuidWindow,
			}).pipe(
				map((result): QueryResult<RxCollection> => ({
					...result,
					searchActive: true,
					searchState: searchAnswered ? 'answered' : 'pending',
					relatedIds: parentIds,
					hits: result.hits.map((hit) => ({
						...hit,
						childrenSearchCount: counts.get(Number(hit.record.payload.id)) ?? 0,
						parentSearchTerm: search,
					})),
				}))
			);
		})
	);
}

/** Direct reactive read against the current engine database through the adapter execute path. */
export function observeEngineQuery(
	engine: RxdbSyncEngine,
	descriptor: EngineQueryDescriptor
): Observable<QueryResult<RxCollection>> {
	const search = searchTermOf(descriptor);
	const { relation, ...parent } = descriptor;
	if (relation && search) {
		return observeBinding(engine, [parent.collection, relation.collection]).pipe(
			switchMap((database) =>
				database
					? readRelation(engine, database, parent, relation, search)
					: of<QueryResult<RxCollection>>({
							...pendingSearchResult(),
							searchActive: true,
							relatedIds: [],
						})
			)
		);
	}
	return observeBinding(engine, [parent.collection]).pipe(
		switchMap((database) =>
			database
				? readBound(engine, database, parent)
				: of(search ? pendingSearchResult() : emptyResult())
		)
	);
}
