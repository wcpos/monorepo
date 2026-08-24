import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { combineLatest, defer, from, of, throwError } from 'rxjs';
import { catchError, filter, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { useQueryRuntime } from './provider';
import { recoverLogsCollectionStorage } from './logs-storage-recovery';

import type { QueryResult } from './query-result';
import type { MonoTypeOperatorFunction, Observable } from 'rxjs';
import type {
	MangoQuerySelector,
	MangoQuerySortPart,
	RxCollection,
	RxDatabase,
	RxDocument,
} from 'rxdb';

type LocalDocumentData = Record<string, unknown>;
type LocalDocument = RxDocument<LocalDocumentData>;
type LocalCollection = RxCollection<LocalDocumentData>;
/** `reset$` is contributed by the reset-collection plugin; absent on plain databases. */
type LocalDatabaseWithReset = RxDatabase & {
	collections: Record<string, unknown>;
	reset$?: Observable<{ name: string } | undefined>;
};

type LocalSearch = {
	collection: LocalCollection;
	find(term: string): Promise<LocalDocument[]>;
};

interface LocalQueryOptions {
	collectionName: 'logs';
	selector?: MangoQuerySelector<LocalDocumentData>;
	sort?: MangoQuerySortPart<LocalDocumentData>[];
	limit?: number;
	search?: string;
}

function recoverAsEmpty<T>(
	collection: LocalCollection,
	emptyValue: T
): MonoTypeOperatorFunction<T> {
	return catchError((error: unknown) =>
		from(recoverLogsCollectionStorage(collection, error)).pipe(
			switchMap((recovered) => {
				return recovered ? of(emptyValue) : throwError(() => error);
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
			// No startWith(empty) on these: the first emission must be the real query
			// result, so a descriptor swap in useLocalQuery keeps the previous window
			// on screen instead of flashing an empty table.
			const documents$ = collection
				.find({
					selector: matchingSelector,
					sort: options.sort,
					limit: options.limit,
				})
				.$.pipe(recoverAsEmpty<LocalDocument[]>(collection, []));
			const total$ = collection
				.count({ selector: matchingSelector })
				.$.pipe(recoverAsEmpty<number>(collection, 0));
			return combineLatest([documents$, total$]).pipe(
				map(([documents, count]): QueryResult<LocalCollection> => ({
					searchActive: search.length > 0,
					count,
					hits: documents.map((document) => ({
						id: String(document.primary),
						record: document,
					})),
				}))
			);
		}),
		shareReplay({ bufferSize: 1, refCount: true })
	);
}

/** Direct local-only query binding. It never registers engine demand. */
export const useLocalQuery = (options: LocalQueryOptions) => {
	const runtime = useQueryRuntime();
	const localDB = runtime.localDB as LocalDatabaseWithReset;
	const collectionName = options.collectionName;
	const key = JSON.stringify(options);
	const stableOptions = React.useMemo(() => JSON.parse(key) as LocalQueryOptions, [key]);
	/**
	 * Follow the collection, not a snapshot of it.
	 *
	 * `logs` is removed and re-created IN PLACE by logs-storage-recovery (an OPFS
	 * corruption repair, reached from this very query's `recoverAsEmpty`). The
	 * replacement is only ever announced on `reset$`, and nothing re-renders the
	 * table when it lands — so reading `collections[name]` once left the ledger
	 * subscribed to the removed collection, showing a frozen window while writes
	 * went to its replacement. `startWith` also covers the plain case of a new
	 * `localDB` arriving (store switch), which re-runs this memo.
	 */
	const current = localDB.collections[collectionName] as LocalCollection | undefined;
	const collection$ = React.useMemo(
		() =>
			localDB.reset$
				? localDB.reset$.pipe(
						filter((replacement) => replacement?.name === collectionName),
						startWith(current)
					)
				: of(current),
		// `current` is a dependency on purpose: a replacement swapped into
		// `collections` alongside a re-render must be picked up even when no
		// `reset$` emission accompanies it. `reset$` covers the reverse — a
		// replacement with nothing to re-render us.
		[localDB, collectionName, current]
	);
	const result$ = React.useMemo(
		() =>
			collection$.pipe(
				switchMap((collection) =>
					collection
						? localQueryResult$(collection, runtime.locale, stableOptions)
						: of<QueryResult<LocalCollection>>({ searchActive: false, count: 0, hits: [] })
				),
				shareReplay({ bufferSize: 1, refCount: true })
			),
		[collection$, runtime.locale, stableOptions]
	);
	// One resource for the hook's lifetime (mirrors useObservableResource in
	// @wcpos/core query-bindings): reloading retains the current value while the
	// new query loads and clears terminal errors, so a descriptor change never
	// blanks a mounted consumer.
	const [resource] = React.useState(() => new ObservableResource(result$));
	const resourceRef = React.useRef(resource);
	const total$ = React.useMemo(
		() => result$.pipe(map((result) => result.count ?? result.hits.length)),
		[result$]
	);

	React.useEffect(() => {
		if (resource.input$ !== result$) resource.reload(result$);
	}, [resource, result$]);

	React.useEffect(() => {
		const lifetimeResource = resourceRef.current;
		// The resource owns the local RxDB subscriptions for this hook.
		return () => lifetimeResource.destroy();
	}, []);

	return { resource, result$, total$ };
};
