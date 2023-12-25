import * as React from 'react';

import { of } from 'rxjs';

import { useQueryManager } from './provider';

import type { Query } from './query-state';

export const useReplicationState = (query: Query<any>) => {
	const queryManager = useQueryManager();
	const replicationStates = queryManager.getReplicationStatesByQueryID(query.id);

	/**
	 * Collection replication is the first, but need a better way to handle this
	 */
	const collectionReplication = replicationStates[0];

	const active$ = of(false);

	const sync = React.useCallback(() => {}, []);

	return { active$, sync, total$: collectionReplication.total$ };
};
