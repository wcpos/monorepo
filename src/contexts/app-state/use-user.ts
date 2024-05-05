import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { distinctUntilChanged, tap, filter, switchMap } from 'rxjs/operators';

import { userDB$ } from './use-user-db';

/**
 * Re-use userDB to get the user
 */
const user$ = userDB$.pipe(
	switchMap(({ userDB }) =>
		userDB.users.findOne().$.pipe(
			tap((user) => {
				if (!isRxDocument(user)) {
					userDB.users.insert({ first_name: 'Global', last_name: 'User' });
				}
			})
		)
	),
	filter((user) => isRxDocument(user)),
	distinctUntilChanged((prev, curr) => prev?.uuid === curr?.uuid)
);
const userResource = new ObservableResource(user$);

/**
 *
 */
export const useUser = () => {
	const user = useObservableSuspense(userResource);

	if (!user) {
		throw new Error(`Error creating global user`);
	}

	return { user };
};
