import * as React from 'react';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import type { RxDatabase } from 'rxdb';

/** Runtime dependencies shared by the direct query bindings and local-only hooks. */
export interface QueryRuntime<T extends RxDatabase = RxDatabase> {
	/** Local database containing only dedicated local collections such as logs and templates. */
	localDB: T;
	engine: RxdbSyncEngine;
	locale: string;
	/** Host HTTP client used only by the dedicated templates fetch target. */
	httpClient?: unknown;
}

const QueryContext = React.createContext<QueryRuntime | undefined>(undefined);

interface QueryProviderProps<T extends RxDatabase> {
	localDB: T;
	engine: RxdbSyncEngine;
	locale: string;
	http?: unknown;
	children: React.ReactNode;
}

export function QueryProvider<T extends RxDatabase>({
	localDB,
	engine,
	http,
	children,
	locale,
}: QueryProviderProps<T>) {
	const runtime = React.useMemo<QueryRuntime<T>>(
		() => ({ localDB, engine, locale, httpClient: http }),
		[engine, http, localDB, locale]
	);

	return <QueryContext.Provider value={runtime}>{children}</QueryContext.Provider>;
}

/**
 * Historical hook name retained as the provider-runtime seam used throughout core.
 * It no longer returns or constructs a query manager.
 */
export const useQueryManager = (): QueryRuntime => {
	const context = React.useContext(QueryContext);
	if (!context) throw new Error('useQueryManager must be used within a QueryProvider');
	return context;
};
