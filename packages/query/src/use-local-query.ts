import * as React from 'react';

import { combineLatest, from, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';

import { buildScanSearchSelector } from '@wcpos/sync-core';

import { normalizeSelectorSemantics } from './engine-adapter/normalize-selector';
import { useLocalCollection$ } from './use-local-collection';
import { useOwnedResource } from './use-owned-resource';
import { recoverLogsCollectionStorage } from './logs-storage-recovery';

import type { QueryResult } from './query-result';
import type { MonoTypeOperatorFunction } from 'rxjs';
import type { MangoQuerySelector, MangoQuerySortPart, RxCollection, RxDocument } from 'rxdb';

type LocalDocumentData = Record<string, unknown>;
type LocalDocument = RxDocument<LocalDocumentData>;
type LocalCollection = RxCollection<LocalDocumentData>;

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

/**
 * The scan-based search of the local collections (`options.searchIndex === false` —
 * logs, see the collection creator for the measurement; the synced collections search
 * through the blob in `engine-query.ts`). `buildScanSearchSelector` in @wcpos/sync-core owns the shape:
 * every encoder term must appear in the collection's FOLDED field (written by
 * the logger with the same fold the encoder applies to the term, so the match
 * is exact in fold space for any script or normal form) or, for rows that
 * predate that field, in one of the raw `searchFields`. The storage evaluates
 * it — in the OPFS worker on web, off the main thread — bounded by the query's
 * own `limit`. A term with no usable token selects nothing, never everything.
 */
function scanSelector$(
	collection: LocalCollection,
	selector: MangoQuerySelector<LocalDocumentData>,
	search: string
) {
	const options = collection.options as
		{ searchFields?: unknown; searchFoldedField?: unknown } | undefined;
	const scan = buildScanSearchSelector({
		foldedField:
			typeof options?.searchFoldedField === 'string' ? options.searchFoldedField : undefined,
		rawFields: Array.isArray(options?.searchFields) ? (options.searchFields as string[]) : [],
		search,
	});
	return of(
		withSelector(
			selector,
			(scan as MangoQuerySelector<LocalDocumentData> | null) ?? nothingSelector(collection)
		)
	);
}

function nothingSelector(collection: LocalCollection): MangoQuerySelector<LocalDocumentData> {
	return { [collection.schema.primaryPath]: { $in: [] } } as MangoQuerySelector<LocalDocumentData>;
}

function localQueryResult$(collection: LocalCollection, options: LocalQueryOptions) {
	const selector = options.selector ?? {};
	const search = options.search?.trim() ?? '';
	const selectors$ = !search ? of(selector) : scanSelector$(collection, selector, search);

	return selectors$.pipe(
		map((selector) => normalizeSelectorSemantics(selector)),
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

/**
 * The local-only query's observables, and nothing subscribed: the caller decides when the read
 * runs (a query handle's retain). `result$` follows the collection (see useLocalCollection$);
 * `total$` is the matching count. It never registers engine demand.
 */
export const useLocalQuery$ = (options: LocalQueryOptions) => {
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
						? localQueryResult$(collection, stableOptions)
						: of<QueryResult<LocalCollection>>({ searchActive: false, count: 0, hits: [] })
				),
				shareReplay({ bufferSize: 1, refCount: true })
			),
		[collection$, stableOptions]
	);
	const total$ = React.useMemo(
		() => result$.pipe(map((result) => result.count ?? result.hits.length)),
		[result$]
	);
	return { result$, total$ };
};

/** Direct local-only query binding. It never registers engine demand. */
export const useLocalQuery = (options: LocalQueryOptions) => {
	const { result$, total$ } = useLocalQuery$(options);
	// The hook's resource: a changed query reloads it (the current window stays while the new
	// one loads), and it reads only once the caller commits — a caller that owns the read's
	// lifetime itself takes `useLocalQuery$`.
	const resource = useOwnedResource(result$);
	return { resource, result$, total$ };
};
