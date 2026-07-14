import * as React from 'react';

import type {
	CollectionKey,
	FiltersOf,
	QueryStateActions,
	QueryStateOf,
} from './query-state-types';

const DEFAULT_FILTERS = {
	products: { categories: [], tags: [], brands: [] },
	orders: {},
	coupons: {},
	variations: { attributeMatches: [] },
	customers: {},
	'tax-rates': {},
	logs: {},
} satisfies { [C in CollectionKey]: FiltersOf<C> };

type Store<C extends CollectionKey> = {
	getState(): QueryStateOf<C>;
	subscribe(listener: () => void): () => void;
	actions: QueryStateActions<C>;
};

const QueryStateContext = React.createContext<Store<CollectionKey> | null>(null);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function createStore<C extends CollectionKey>(
	initial: QueryStateOf<C>,
	initialFilters: FiltersOf<C>,
	pageSize: number
): Store<C> {
	let state = initial;
	const listeners = new Set<() => void>();
	const publish = (next: QueryStateOf<C>) => {
		if (same(state, next)) return;
		state = next;
		listeners.forEach((listener) => listener());
	};
	const resultChange = (patch: Partial<QueryStateOf<C>>) => {
		if (same(state, { ...state, ...patch })) return;
		publish({ ...state, ...patch, limit: pageSize });
	};
	return {
		getState: () => state,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		actions: {
			setSearch: (search) => resultChange({ search }),
			clearSearch: () => resultChange({ search: '' }),
			setFilter: (field, value) => resultChange({ filters: { ...state.filters, [field]: value } }),
			clearFilter: (field) => {
				const filters = { ...state.filters };
				if (field in initialFilters) filters[field] = initialFilters[field];
				else delete filters[field];
				resultChange({ filters });
			},
			resetFilters: () => resultChange({ filters: clone(initialFilters) }),
			setSort: (field, direction) => resultChange({ sort: { field, direction } }),
			extendLimit: () => publish({ ...state, limit: state.limit + pageSize }),
		},
	};
}

export function QueryStateProvider<C extends CollectionKey>({
	collection,
	initialPageSize,
	initialSort,
	initialFilters,
	children,
}: {
	collection: C;
	initialPageSize: number;
	initialSort: QueryStateOf<C>['sort'];
	initialFilters?: Partial<FiltersOf<C>>;
	children: React.ReactNode;
}) {
	if (!Number.isInteger(initialPageSize) || initialPageSize <= 0) {
		throw new Error('QueryStateProvider initialPageSize must be a positive integer');
	}
	const [store] = React.useState<Store<C>>(() => {
		const filters = { ...clone(DEFAULT_FILTERS[collection]), ...initialFilters } as FiltersOf<C>;
		return createStore(
			{ search: '', filters, sort: initialSort, limit: initialPageSize },
			filters,
			initialPageSize
		);
	});
	return (
		<QueryStateContext.Provider value={store as Store<CollectionKey>}>
			{children}
		</QueryStateContext.Provider>
	);
}

function useStore<C extends CollectionKey>(): Store<C> {
	const store = React.useContext(QueryStateContext);
	if (!store) throw new Error('Query state hooks must be used within QueryStateProvider');
	return store as Store<C>;
}

export function useQueryState<C extends CollectionKey, S = QueryStateOf<C>>(
	selector: (state: QueryStateOf<C>) => S = (state) => state as unknown as S
): S {
	const store = useStore<C>();
	return React.useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

export function useQueryStateActions<C extends CollectionKey>(): QueryStateActions<C> {
	return useStore<C>().actions;
}
