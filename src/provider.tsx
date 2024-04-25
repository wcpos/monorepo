import * as React from 'react';

import { Manager } from './manager';

import type { RxDatabase } from 'rxdb';

const QueryContext = React.createContext<Manager<RxDatabase> | undefined>(undefined);

interface QueryProviderProps<T extends RxDatabase> {
	localDB: T;
	http: any; // Replace 'any' with the actual type of your HTTP client
	locale: string;
	children: React.ReactNode;
}

/**
 *
 */
export const QueryProvider = <T extends RxDatabase>({
	localDB,
	http,
	children,
	locale,
}: QueryProviderProps<T>) => {
	const manager = React.useMemo(
		() => Manager.getInstance<T>(localDB, http, locale),
		[localDB, http, locale]
	);

	/**
	 * Clean up the manager when the dependency changes
	 */
	React.useEffect(() => {
		return () => {
			manager.cancel();
		};
	}, [manager]);

	return <QueryContext.Provider value={manager}>{children}</QueryContext.Provider>;
};

export const useQueryManager = (): Manager<RxDatabase> => {
	const context = React.useContext(QueryContext);
	if (!context) {
		throw new Error('useQueryManager must be used within a QueryProvider');
	}
	return context;
};
