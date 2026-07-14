import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { Manager } from './manager';

import type { RxDatabase } from 'rxdb';

const logger = getLogger(['wcpos', 'query', 'provider']);

const QueryContext = React.createContext<Manager<RxDatabase> | undefined>(undefined);

interface QueryProviderProps<T extends RxDatabase> {
	/** Local database — ONLY the `logs` (and dedicated `templates`) collections. */
	localDB: T;
	/** The sync engine every fluent read is served from (ADR 0023 increment 1b). */
	engine: RxdbSyncEngine;
	locale: string;
	/** @deprecated increment-3 — transitional wc/v3 seam for Core mutation callers. */
	http?: any;
	children: React.ReactNode;
}

export function QueryProvider<T extends RxDatabase>({
	localDB,
	engine,
	http,
	children,
	locale,
}: QueryProviderProps<T>) {
	const manager = React.useMemo(() => {
		logger.debug('Creating/getting manager', {
			context: { localDBName: (localDB as any).name },
		});
		return Manager.getInstance<T>(localDB, engine, locale, http);
	}, [localDB, engine, locale, http]);

	return <QueryContext.Provider value={manager}>{children}</QueryContext.Provider>;
}

export const useQueryManager = (): Manager<RxDatabase> => {
	const context = React.useContext(QueryContext);
	if (!context) {
		throw new Error('useQueryManager must be used within a QueryProvider');
	}
	return context;
};
