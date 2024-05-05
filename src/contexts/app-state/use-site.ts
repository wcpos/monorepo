import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { switchMap, distinctUntilChanged } from 'rxjs/operators';

import { userDB$ } from './use-user-db';

/**
 * Re-use userDB and currentState to get the site doc
 */
const obs$ = userDB$.pipe(
	switchMap(({ userDB, currentState }) => {
		return currentState.siteID$.pipe(
			switchMap((id) => userDB.sites.findOne({ selector: { uuid: id } }).$)
		);
	}),
	distinctUntilChanged((prev, curr) => prev?.uuid === curr?.uuid)
);
const resource = new ObservableResource(obs$);

/**
 *
 */
export const useSite = () => {
	const site = useObservableSuspense(resource);

	return { site };
};
