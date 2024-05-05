import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { switchMap, distinctUntilChanged } from 'rxjs/operators';

import { userDB$ } from './use-user-db';

/**
 * Re-use userDB and currectState to get the wp credentials doc
 */
const wpCredentials$ = userDB$.pipe(
	switchMap(({ userDB, currentState }) => {
		return currentState.wpCredentials$.pipe(
			switchMap((id) => userDB.wp_credentials.findOne({ selector: { uuid: id } }).$)
		);
	}),
	distinctUntilChanged((prev, curr) => prev?.uuid === curr?.uuid)
);
const resource = new ObservableResource(wpCredentials$);

/**
 *
 */
export const useWpCredentials = () => {
	const wpCredentials = useObservableSuspense(resource);

	return { wpCredentials };
};
