import * as React from 'react';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import type { RxDatabase } from 'rxdb';

/** Runtime dependencies shared by the direct query bindings and local-only hooks. */
export interface QueryRuntime<T extends RxDatabase = RxDatabase> {
	/** Local database containing only dedicated local collections such as logs and templates. */
	localDB: T;
	engine: RxdbSyncEngine;
	locale: string;
}

const QueryContext = React.createContext<QueryRuntime | undefined>(undefined);

interface QueryProviderProps<T extends RxDatabase> {
	localDB: T;
	engine: RxdbSyncEngine;
	locale: string;
	children: React.ReactNode;
}

export function QueryProvider<T extends RxDatabase>({
	localDB,
	engine,
	children,
	locale,
}: QueryProviderProps<T>) {
	const runtime = React.useMemo<QueryRuntime<T>>(
		() => ({ localDB, engine, locale }),
		[engine, localDB, locale]
	);

	return <QueryContext.Provider value={runtime}>{children}</QueryContext.Provider>;
}

export const useQueryRuntime = (): QueryRuntime => {
	const context = React.useContext(QueryContext);
	if (!context) throw new Error('useQueryRuntime must be used within a QueryProvider');
	return context;
};
