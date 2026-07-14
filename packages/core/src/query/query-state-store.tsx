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

function shallowEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
		return false;
	}
	const leftRecord = left as Record<string, unknown>;
	const rightRecord = right as Record<string, unknown>;
	const leftKeys = Object.keys(leftRecord);
	const rightKeys = Object.keys(rightRecord);
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(
			(key) =>
				Object.prototype.hasOwnProperty.call(rightRecord, key) &&
				Object.is(leftRecord[key], rightRecord[key])
		)
	);
}

function createStore<C extends CollectionKey>(
	initial: QueryStateOf<C>,
	clearFilters: FiltersOf<C>,
	resetFilters: FiltersOf<C>,
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
				if (field in clearFilters) filters[field] = clearFilters[field];
				else delete filters[field];
				resultChange({ filters });
			},
			resetFilters: () => resultChange({ filters: clone(resetFilters) }),
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
		const clearFilters = clone(DEFAULT_FILTERS[collection]);
		const filters = { ...clearFilters, ...initialFilters } as FiltersOf<C>;
		return createStore(
			{ search: '', filters, sort: initialSort, limit: initialPageSize },
			clearFilters,
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
	const cache = React.useRef<
		| {
				state: QueryStateOf<C>;
				selector: (state: QueryStateOf<C>) => S;
				selected: S;
		  }
		| undefined
	>(undefined);
	const getSnapshot = React.useCallback(() => {
		const state = store.getState();
		if (cache.current?.state === state && cache.current.selector === selector) {
			return cache.current.selected;
		}
		const selected = selector(state);
		if (cache.current && shallowEqual(cache.current.selected, selected)) {
			cache.current = { state, selector, selected: cache.current.selected };
			return cache.current.selected;
		}
		cache.current = { state, selector, selected };
		return selected;
	}, [selector, store]);
	return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useQueryStateActions<C extends CollectionKey>(): QueryStateActions<C> {
	return useStore<C>().actions;
}
