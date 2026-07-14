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
import { distinctUntilChanged, filter, switchMap } from 'rxjs/operators';

import { useQueryManager, useReplicationState } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { translateQueryState } from './query-state-translator';

import type { CollectionKey, QueryStateOf } from './query-state-types';
import type { RxQuery } from 'rxdb';

type Manager = ReturnType<typeof useQueryManager>;
type RegisteredQuery = NonNullable<ReturnType<Manager['registerQuery']>>;
type QueryParams = Parameters<Manager['registerQuery']>[0]['initialParams'];

const logger = getLogger(['wcpos', 'core', 'query-bindings']);

function deregisterOwnedQuery(manager: Manager, query: RegisteredQuery): void {
	// A db$ scope change can replace a query under the same id before effect cleanup runs.
	if (manager.queryStates.get(query.id) !== query) return;
	void manager.deregisterQuery(query.id).catch((error) =>
		logger.error('Failed to deregister query binding', {
			context: { queryId: query.id, collectionName: query.collectionName, error },
		})
	);
}

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
	const bindingId = React.useId();
	const epoch = useEngineEpoch(manager);
	const key = JSON.stringify(input);
	const query = React.useMemo(() => {
		void epoch; // Re-register the stable query key after each db$ scope/reset emission.
		const stable = JSON.parse(key) as typeof input;
		const registered = manager.registerQuery({
			queryKeys: ['query-binding', bindingId, stable.collectionName, stable.identity, key],
			collectionName: stable.collectionName,
			initialParams: stable.params,
		});
		if (!registered) throw new Error(`Unable to bind ${stable.collectionName}`);
		if (stable.search) registered.search(stable.search);
		return registered;
	}, [manager, bindingId, epoch, key]);

	React.useEffect(() => {
		// Registration is an external manager resource and must be released on replacement/unmount.
		return () => deregisterOwnedQuery(manager, query);
	}, [manager, query]);
	return query;
}

function useBindingOutput(query: RegisteredQuery) {
	const replication = useReplicationState(query);
	return { resource: query.resource, ...replication };
}

const LOCAL_TOTAL_SOURCE$ = of('local' as const);

function useLogsTotal(collection: CollectionKey, query: RegisteredQuery) {
	return React.useMemo(() => {
		if (collection !== 'logs') return null;
		return query.rxQuery$.pipe(
			filter((rxQuery): rxQuery is RxQuery => rxQuery !== undefined),
			switchMap((rxQuery) => query.collection.count({ selector: rxQuery.mangoQuery.selector }).$),
			distinctUntilChanged()
		);
	}, [collection, query]);
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
	const logsTotal = useLogsTotal(collection, query);
	return logsTotal ? { ...output, total$: logsTotal, totalSource$: LOCAL_TOTAL_SOURCE$ } : output;
}

export function useRelationalCollectionBinding(state: QueryStateOf<'products'>) {
	const manager = useQueryManager();
	const bindingId = React.useId();
	const epoch = useEngineEpoch(manager);
	const translated = translateQueryState('products', state);
	const key = JSON.stringify(translated);
	const queries = React.useMemo(() => {
		void epoch; // Re-register all three stable query keys against the new residents.
		const stable = JSON.parse(key) as typeof translated;
		const child = manager.registerQuery({
			queryKeys: ['query-binding', bindingId, 'relational', 'variations', key],
			collectionName: 'variations',
			initialParams: { selector: {}, sort: [{ id: 'asc' }] },
		});
		const lookup = manager.registerQuery({
			queryKeys: ['query-binding', bindingId, 'relational', 'lookup', key],
			collectionName: 'products',
			initialParams: { selector: { id: { $in: [] } } },
		});
		if (!child || !lookup) throw new Error('Unable to bind products↔variations queries');
		const parent = manager.registerRelationalQuery(
			{
				queryKeys: ['query-binding', bindingId, 'relational', 'products', key],
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
	}, [manager, bindingId, epoch, key]);

	React.useEffect(() => {
		// These registrations are private to this binding and must be released together.
		return () => {
			deregisterOwnedQuery(manager, queries.parent);
			deregisterOwnedQuery(manager, queries.child);
			deregisterOwnedQuery(manager, queries.lookup);
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
