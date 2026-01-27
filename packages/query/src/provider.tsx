import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { Manager } from './manager';

import type { RxDatabase } from 'rxdb';

const providerLogger = getLogger(['wcpos', 'query', 'provider']);

const QueryContext = React.createContext<Manager<RxDatabase> | undefined>(undefined);

interface QueryProviderProps<T extends RxDatabase> {
	localDB: T;
	fastLocalDB: any;
	http: any; // Replace 'any' with the actual type of your HTTP client
	locale: string;
	children: React.ReactNode;
}

/**
 * @TODO -
 */
export const QueryProvider = <T extends RxDatabase>({
	localDB,
	fastLocalDB,
	http,
	children,
	locale,
}: QueryProviderProps<T>) => {
	// Debug: Log when props change
	React.useEffect(() => {
		providerLogger.debug('QueryProvider: localDB changed', {
			context: {
				localDBName: localDB?.name,
				fastLocalDBName: fastLocalDB?.name,
			},
		});
	}, [localDB, fastLocalDB]);

	const manager = React.useMemo(() => {
		providerLogger.debug('QueryProvider: creating/getting manager (useMemo)', {
			context: {
				localDBName: localDB?.name,
			},
		});
		return Manager.getInstance<T>(localDB, fastLocalDB, http, locale);
	}, [localDB, fastLocalDB, http, locale]);

	return <QueryContext.Provider value={manager}>{children}</QueryContext.Provider>;
};

/**
 *
 */
export const useQueryManager = (): Manager<RxDatabase> => {
	const context = React.useContext(QueryContext);
	if (!context) {
		throw new Error('useQueryManager must be used within a QueryProvider');
	}
	return context;
};
