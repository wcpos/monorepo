import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { isRxDatabase } from 'rxdb';
import { of } from 'rxjs';
import { switchMap, filter } from 'rxjs/operators';

import { createStoreDB } from '@wcpos/database/src/stores-db';

import { userDB$ } from './use-user-db';

/**
 * Re-use curerntState to create a store resource
 */
const obs$ = userDB$.pipe(
	switchMap(({ currentState }) => {
		return currentState.storeID$.pipe(switchMap((id) => (id ? createStoreDB(id) : of(null))));
	})
);
const resource = new ObservableResource(obs$);

/**
 *
 */
export const useStoreDB = () => {
	const storeDB = useObservableSuspense(resource);

	return { storeDB };
};
