import * as React from 'react';
import set from 'lodash/set';

type SortDirection = import('@wcpos/components/src/table/types').SortDirection;

export interface QueryState {
	search?: Record<string, unknown>;
	sortBy: string;
	sortDirection: SortDirection;
	filters?: Record<string, unknown>;
}

export interface QueryProviderProps {
	initialQuery: QueryState;
	children: React.ReactNode;
}

export interface QueryProps {
	query: QueryState;
	setQuery: (path: string | string[], value: any) => void;
}

export const QueryContext = React.createContext<unknown>(null) as React.Context<QueryProps>;

/**
 * Query Provider
 */
export const QueryProvider = ({ children, initialQuery }: QueryProviderProps) => {
	const [queryState, setQueryState] = React.useState(initialQuery);

	const setQuery = React.useCallback(
		(path, value) => {
			setQueryState((prevState) => {
				return set({ ...prevState }, path, value);
			});
		},
		[setQueryState]
	);

	return (
		<QueryContext.Provider value={{ query: queryState, setQuery }}>
			{children}
		</QueryContext.Provider>
	);
};
