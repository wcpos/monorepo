/**
 * SEQUENCING NOTE (ADR 0024 step 4): these bindings deliberately ride the
 * phase-1 manager seam (registerQuery + useReplicationState) instead of raw
 * engine-DB reads. The public binding contract is the stable surface screens
 * migrate to; when the fluent surface and the manager are deleted, ONLY this
 * file's internals swap to direct engine reads — no screen changes. The
 * terminal-deletion increment must include that swap.
 */
import * as React from 'react';

import { of } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { useQueryManager, useReplicationState } from '@wcpos/query';

import { translateQueryState } from './query-state-translator';

import type { CollectionKey, QueryStateOf } from './query-state-types';

type Manager = ReturnType<typeof useQueryManager>;
type RegisteredQuery = NonNullable<ReturnType<Manager['registerQuery']>>;
type QueryParams = Parameters<Manager['registerQuery']>[0]['initialParams'];

function useEngineEpoch(manager: Manager): number {
	const [epoch, setEpoch] = React.useState(0);
	React.useEffect(() => {
		// db$ is the engine's scope/reset seam; every emission re-resolves collection residents.
		return manager.engine.db$(() => setEpoch((current) => current + 1));
	}, [manager]);
	return epoch;
}

function useRegisteredQuery(input: {
	collectionName: string;
	params: QueryParams;
	search: string;
	identity: string;
}): RegisteredQuery {
	const manager = useQueryManager();
	const epoch = useEngineEpoch(manager);
	const key = JSON.stringify(input);
	const query = React.useMemo(() => {
		void epoch; // Re-register the stable query key after each db$ scope/reset emission.
		const stable = JSON.parse(key) as typeof input;
		const registered = manager.registerQuery({
			queryKeys: ['query-binding', stable.collectionName, stable.identity, key],
			collectionName: stable.collectionName,
			initialParams: stable.params,
		});
		if (!registered) throw new Error(`Unable to bind ${stable.collectionName}`);
		if (stable.search) registered.search(stable.search);
		return registered;
	}, [manager, epoch, key]);

	React.useEffect(() => {
		// The manager owns the query; this hook only releases its demand handles.
		return () => manager.maybePauseQueryReplications(query);
	}, [manager, query]);
	return query;
}

function useBindingOutput(query: RegisteredQuery) {
	const replication = useReplicationState(query);
	return { resource: query.resource, ...replication };
}

const LOCAL_TOTAL_SOURCE$ = of('local' as const);

function useLogsTotalQuery(input: {
	collection: CollectionKey;
	params: QueryParams;
	search: string;
}): RegisteredQuery | null {
	const manager = useQueryManager();
	const epoch = useEngineEpoch(manager);
	const key = JSON.stringify(input);
	const query = React.useMemo(() => {
		void epoch;
		const stable = JSON.parse(key) as typeof input;
		if (stable.collection !== 'logs') return null;
		const registered = manager.registerQuery({
			queryKeys: ['query-binding', 'logs-total', key],
			collectionName: 'logs',
			initialParams: stable.params,
		});
		if (!registered) throw new Error('Unable to bind logs total');
		if (stable.search) registered.search(stable.search);
		return registered;
	}, [manager, epoch, key]);
	React.useEffect(() => {
		return () => {
			if (query) manager.maybePauseQueryReplications(query);
		};
	}, [manager, query]);
	return query;
}

export function useCollectionBinding<C extends CollectionKey>(
	collection: C,
	state: QueryStateOf<C>
) {
	const translated = translateQueryState(collection, state);
	const query = useRegisteredQuery({
		collectionName: translated.collectionName,
		params: { selector: translated.selector, sort: translated.sort, limit: translated.limit },
		search: translated.search,
		identity: 'collection',
	});
	const output = useBindingOutput(query);
	const logsTotalQuery = useLogsTotalQuery({
		collection,
		params: { selector: translated.selector, sort: translated.sort },
		search: translated.search,
	});
	const logsTotal$ = React.useMemo(
		() =>
			logsTotalQuery?.result$.pipe(
				map((result) => result.count ?? 0),
				distinctUntilChanged()
			),
		[logsTotalQuery]
	);
	return logsTotalQuery
		? { ...output, total$: logsTotal$!, totalSource$: LOCAL_TOTAL_SOURCE$ }
		: output;
}

export function useRelationalCollectionBinding(state: QueryStateOf<'products'>) {
	const manager = useQueryManager();
	const epoch = useEngineEpoch(manager);
	const translated = translateQueryState('products', state);
	const key = JSON.stringify(translated);
	const queries = React.useMemo(() => {
		void epoch; // Re-register all three stable query keys against the new residents.
		const stable = JSON.parse(key) as typeof translated;
		const child = manager.registerQuery({
			queryKeys: ['query-binding', 'relational', 'variations', key],
			collectionName: 'variations',
			initialParams: { selector: {}, sort: [{ id: 'asc' }] },
		});
		const lookup = manager.registerQuery({
			queryKeys: ['query-binding', 'relational', 'lookup', key],
			collectionName: 'products',
			initialParams: { selector: { id: { $in: [] } } },
		});
		if (!child || !lookup) throw new Error('Unable to bind products↔variations queries');
		const parent = manager.registerRelationalQuery(
			{
				queryKeys: ['query-binding', 'relational', 'products', key],
				collectionName: 'products',
				initialParams: {
					selector: stable.selector,
					sort: stable.sort,
					limit: stable.limit,
				},
			},
			child,
			lookup
		);
		if (!parent) throw new Error('Unable to bind relational products query');
		if (stable.search) parent.search(stable.search);
		return { parent, child, lookup };
	}, [manager, epoch, key]);

	React.useEffect(() => {
		// Release every demand arm together; the manager retains shared query instances.
		return () => {
			manager.maybePauseQueryReplications(queries.parent);
			manager.maybePauseQueryReplications(queries.child);
			manager.maybePauseQueryReplications(queries.lookup);
		};
	}, [manager, queries]);
	return useBindingOutput(queries.parent);
}

export type SearchSelectCollection = 'customer' | 'category' | 'brand' | 'tag' | 'cashier';

const SEARCH_SELECT_LIMIT = 50;
const SEARCH_SELECT_LIMIT_MAX = 100;

export function useSearchSelect(
	collection: SearchSelectCollection,
	options: { debounceMs?: number; maxResults?: number } = {}
) {
	const [search, setSearch] = React.useState('');
	const [committedSearch, setCommittedSearch] = React.useState('');
	const debounceMs = options.debounceMs ?? 150;
	React.useEffect(() => {
		// Input text is intentionally the only debounced state; query state remains committed.
		const timer = setTimeout(() => setCommittedSearch(search.trim()), debounceMs);
		return () => clearTimeout(timer);
	}, [debounceMs, search]);

	const isCustomer = collection === 'customer' || collection === 'cashier';
	const names = {
		customer: 'customers',
		cashier: 'customers',
		category: 'products/categories',
		brand: 'products/brands',
		tag: 'products/tags',
	} as const;
	const limit = Math.max(
		1,
		Math.min(options.maxResults ?? SEARCH_SELECT_LIMIT, SEARCH_SELECT_LIMIT_MAX)
	);
	const query = useRegisteredQuery({
		collectionName: names[collection],
		params: {
			selector:
				collection === 'cashier'
					? { role: { $in: ['administrator', 'shop_manager', 'cashier'] } }
					: {},
			sort: [{ [isCustomer ? 'last_name' : 'name']: 'asc' }],
			limit,
		},
		search: committedSearch,
		identity: `search-select:${collection}`,
	});
	return { ...useBindingOutput(query), search, setSearch, committedSearch };
}
