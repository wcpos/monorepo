import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { combineLatest, defer, from, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { encodeSearchText } from '@wcpos/sync-core';

import { useQueryRuntime } from './provider';
import { useLocalCollection$ } from './use-local-collection';
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

function withSelector(
	selector: MangoQuerySelector<LocalDocumentData>,
	extra: MangoQuerySelector<LocalDocumentData>
): MangoQuerySelector<LocalDocumentData> {
	return Object.keys(selector).length === 0
		? extra
		: ({ $and: [selector, extra] } as MangoQuerySelector<LocalDocumentData>);
}

function selectorForSearch(
	collection: LocalCollection,
	selector: MangoQuerySelector<LocalDocumentData>,
	documents: LocalDocument[]
): MangoQuerySelector<LocalDocumentData> {
	const primaryPath = collection.schema.primaryPath;
	const ids = documents.map((document) => document.primary);
	return withSelector(selector, {
		[primaryPath]: { $in: ids },
	} as MangoQuerySelector<LocalDocumentData>);
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The scan-based search for a collection that refuses a FlexSearch index
 * (`options.searchIndex === false` — logs, see the collection creator for the
 * measurement). Every encoder token must appear in at least one searched field,
 * case-insensitively: the same "each term is somewhere in the record" contract
 * the index gives with `tokenize: 'full'`, expressed as a mango selector so the
 * STORAGE evaluates it — in the OPFS worker on web, off the main thread — and
 * the query's own `limit` bounds what comes back. Tokens are accent-folded by
 * the encoder while the stored text is not, so an accented term matches only
 * its accented spelling here; log text is overwhelmingly ASCII, and that is a
 * narrower miss than a 20-second index build.
 *
 * `null` means the search cannot select anything (no fields, or a term with no
 * usable token) — callers turn that into "no hits", never into "all rows".
 */
export function scanSelectorFor(
	fields: readonly string[],
	search: string
): MangoQuerySelector<LocalDocumentData> | null {
	const terms = encodeSearchText(search);
	if (terms.length === 0 || fields.length === 0) return null;
	return {
		$and: terms.map((term) => ({
			$or: fields.map((field) => ({ [field]: { $regex: escapeRegex(term), $options: 'i' } })),
		})),
	} as MangoQuerySelector<LocalDocumentData>;
}

function scanFieldsFor(collection: LocalCollection): readonly string[] {
	const fields = (collection.options as { searchFields?: unknown } | undefined)?.searchFields;
	return Array.isArray(fields) ? (fields as string[]) : [];
}

function nothingSelector(collection: LocalCollection): MangoQuerySelector<LocalDocumentData> {
	return { [collection.schema.primaryPath]: { $in: [] } } as MangoQuerySelector<LocalDocumentData>;
}

function scanSelector$(
	collection: LocalCollection,
	selector: MangoQuerySelector<LocalDocumentData>,
	search: string
) {
	const scan = scanSelectorFor(scanFieldsFor(collection), search);
	return of(withSelector(selector, scan ?? nothingSelector(collection)));
}

function localQueryResult$(
	collection: LocalCollection,
	locale: string,
	options: LocalQueryOptions
) {
	const selector = options.selector ?? {};
	const search = options.search?.trim() ?? '';
	const refusesIndex =
		(collection.options as { searchIndex?: unknown } | undefined)?.searchIndex === false;
	const selectors$ = !search
		? of(selector)
		: refusesIndex
			? scanSelector$(collection, selector, search)
			: defer(() =>
					from(
						(
							collection as unknown as {
								initSearch(locale: string): Promise<LocalSearch | null>;
							}
						).initSearch(locale)
					)
				).pipe(
					switchMap((searchInstance) =>
						// The plugin returns null when it will not index this collection;
						// the scan is the contract then, not an empty result.
						searchInstance
							? searchInstance.collection.$.pipe(
									startWith(null),
									switchMap(() => from(searchInstance.find(search))),
									map((documents) => selectorForSearch(collection, selector, documents))
								)
							: scanSelector$(collection, selector, search)
					)
				);

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
	const collectionName = options.collectionName;
	const key = JSON.stringify(options);
	const stableOptions = React.useMemo(() => JSON.parse(key) as LocalQueryOptions, [key]);
	// Follow the collection rather than a snapshot of it — see useLocalCollection$.
	const collection$ = useLocalCollection$<LocalDocumentData>(collectionName);
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
