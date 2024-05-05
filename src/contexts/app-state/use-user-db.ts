import * as React from 'react';

import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from, shareReplay } from 'rxjs';
import { distinctUntilChanged, tap, filter, switchMap } from 'rxjs/operators';

import { createStoreDB } from '@wcpos/database/src/stores-db';
import { createUserDB } from '@wcpos/database/src/users-db';

/**
 * NOTE: The userDB promise will be called before the app is rendered
 * - current state for logged in user, site, store, etc.
 * - translations state for language translations
 */
const userDBPromise = createUserDB().then(async (userDB) => {
	const appState = await userDB.addState();
	const translationsState = await userDB.addState('translations');
	return { userDB, appState, translationsState };
});
export const userDB$ = from(userDBPromise).pipe(shareReplay(1));
const userDBResource = new ObservableResource(userDB$);

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
 * Re-use userDB and currentState to get the other resources
 */
const obs$ = userDB$.pipe(
	switchMap(({ userDB, appState }) => {
		return appState.current$.pipe(
			switchMap(async (current) => {
				const site = await userDB.sites.findOne({ selector: { uuid: current?.siteID } }).exec();
				const wpCredentials = await userDB.wp_credentials
					.findOne({ selector: { uuid: current?.wpCredentialsID } })
					.exec();
				const store = await userDB.stores
					.findOne({ selector: { localID: current?.storeID } })
					.exec();
				const storeDB = store ? await createStoreDB(store.localID) : null;
				return { site, wpCredentials, store, storeDB };
			})
		);
	})
);
const resource = new ObservableResource(obs$);

/**
 *
 */
export const useUserDB = () => {
	const { userDB, appState, translationsState } = useObservableSuspense(userDBResource);

	if (!userDB) {
		throw new Error(`Error creating userDB`);
	}

	const user = useObservableSuspense(userResource);
	const { site, wpCredentials, store, storeDB } = useObservableSuspense(resource);

	/**
	 *
	 */
	return { userDB, appState, translationsState, user, site, wpCredentials, store, storeDB };
};
