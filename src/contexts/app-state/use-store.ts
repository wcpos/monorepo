import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { switchMap, distinctUntilChanged } from 'rxjs/operators';

import { userDB$ } from './use-user-db';

/**
 * Re-use userDB and currentState to get the store doc
 */
const obs$ = userDB$.pipe(
	switchMap(({ userDB, currentState }) => {
		return currentState.storeID$.pipe(
			switchMap((id) => userDB.stores.findOne({ selector: { localID: id } }).$)
		);
	}),
	distinctUntilChanged((prev, curr) => prev?.uuid === curr?.uuid)
);
const resource = new ObservableResource(obs$);

/**
 *
 */
export const useStore = () => {
	const store = useObservableSuspense(resource);

	return { store };
};
