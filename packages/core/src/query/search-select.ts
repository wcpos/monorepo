import * as React from 'react';

import { type LegacyCollectionName, useQueryRuntime, useSearchFields } from '@wcpos/query';
import {
	acquireSearchSelectHandle,
	canonicalQueryKey,
	SEARCH_SELECT_COLLECTIONS,
	type SearchSelectCollection,
	useScopeKey,
} from '@wcpos/query/query-state';

/**
 * The field list is a subscription (`useSearchFields`): the identity is stable until the
 * site's added meta keys change, and a change re-renders the picker so its handle key moves with
 * the keyed list. Read-only in practice; the cast is for the descriptor's mutable type.
 */
function useSearchFieldsFor(collection: LegacyCollectionName): string[] | undefined {
	return useSearchFields(collection) as string[] | undefined;
}

export type { SearchSelectCollection } from '@wcpos/query/query-state';

/**
 * One page of picker rows: the window a search-select opens with, and the step every
 * end-reached extension adds. It is a page size, not a ceiling — the pickers page through the
 * whole collection, exactly as the grids do (#1553).
 */
const SEARCH_SELECT_PAGE_SIZE = 50;
const SEARCH_SELECT_PAGE_SIZE_MAX = 100;

/**
 * A picker's search: the typed text, its debounced commit, local paging, and the query handle
 * for the committed search and window (roadmap#423). Each committed search or page is its own
 * handle; a list reads it through `useDrawnHandle` so the previous options stay while it answers.
 */
export function useSearchSelect(
	collection: SearchSelectCollection,
	options: { debounceMs?: number; pageSize?: number } = {}
) {
	const [search, setSearch] = React.useState('');
	const [committedSearch, setCommittedSearch] = React.useState('');
	const debounceMs = options.debounceMs ?? 150;
	React.useEffect(() => {
		// Input text is intentionally the only debounced state; query state remains committed.
		const timerId = setTimeout(() => setCommittedSearch(search.trim()), debounceMs);
		return () => clearTimeout(timerId);
	}, [debounceMs, search]);
	const pageSize = Math.max(
		1,
		Math.min(options.pageSize ?? SEARCH_SELECT_PAGE_SIZE, SEARCH_SELECT_PAGE_SIZE_MAX)
	);
	/**
	 * Paging state, keyed by the result set it belongs to: a committed search is a DIFFERENT
	 * result set, so it starts over at page one. Carrying the window across would hold 500 rows
	 * of declared demand over three freshly typed characters.
	 *
	 * The key is compared during render rather than reset from an effect — an effect that
	 * setStates on every search change is a cascading render, and the stale window would be
	 * declared for one render before it healed.
	 */
	const pagingKey = `${committedSearch}|${pageSize}`;
	const [paging, setPaging] = React.useState({ key: pagingKey, limit: pageSize });
	if (paging.key !== pagingKey) {
		setPaging({ key: pagingKey, limit: pageSize });
	}
	const limit = paging.key === pagingKey ? paging.limit : pageSize;
	const extendLimit = React.useCallback(() => {
		setPaging((current) => ({
			key: pagingKey,
			limit: (current.key === pagingKey ? current.limit : pageSize) + pageSize,
		}));
	}, [pageSize, pagingKey]);
	const runtime = useQueryRuntime();
	const legacy = SEARCH_SELECT_COLLECTIONS[collection];
	const scope = useScopeKey(legacy);
	const searchFields = useSearchFieldsFor(legacy);
	// Scope and search fields are in the key so a scope switch or a site's new meta keys is a
	// new handle, declared before the old one releases (as `useCollectionQueryHandle` keys).
	const key = canonicalQueryKey([
		'search-select',
		collection,
		scope,
		committedSearch,
		limit,
		searchFields ?? null,
	]);
	const handle = React.useMemo(() => {
		// Built from the key itself, as `useCollectionQueryHandle` is: the key is the query.
		const [, , , text, size, fields] = JSON.parse(key) as [
			string,
			SearchSelectCollection,
			string,
			string,
			number,
			string[] | null,
		];
		return acquireSearchSelectHandle(runtime.engine, key, {
			collection,
			search: text,
			limit: size,
			searchFields: fields ?? undefined,
		});
	}, [collection, runtime.engine, key]);
	// The picker that holds the search owns the read: its demand is declared while it is mounted.
	React.useEffect(() => handle.retain(), [handle]);
	return { handle, search, setSearch, committedSearch, limit, extendLimit };
}

export type SearchSelect = ReturnType<typeof useSearchSelect>;
