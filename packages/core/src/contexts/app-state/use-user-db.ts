import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from, shareReplay } from 'rxjs';
import { distinctUntilChanged, tap, filter, switchMap } from 'rxjs/operators';

import { createUserDB, createStoreDB, createFastStoreDB } from '@wcpos/database/src';

/**
 * NOTE: The userDB promise will be called before the app is rendered
 * - current state for logged in user, site, store, etc.
 * - translations state for language translations
 */
const userDBPromise = createUserDB().then(async (userDB) => {
	const appState = await userDB.addState('v2');
	const translationsState = await userDB.addState('translations_v2');
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
				let site, wpCredentials, store, storeDB, fastStoreDB, extraData;
				/**
				 * Becareful! RxDB will return a value if primary ID is empty, it sucks, I hate it.
				 */
				if (current?.siteID) {
					site = await userDB.sites.findOne(current.siteID).exec();
				}
				if (current?.wpCredentialsID) {
					wpCredentials = await userDB.wp_credentials.findOne(current.wpCredentialsID).exec();
				}
				if (current?.storeID) {
					store = await userDB.stores.findOne(current.storeID).exec();
				}
				if (isRxDocument(store)) {
					storeDB = await createStoreDB(store.localID);
					fastStoreDB = await createFastStoreDB(store.localID);
					extraData = await storeDB.addState('data_v2');
				}
				return { site, wpCredentials, store, storeDB, fastStoreDB, extraData };
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
	const { site, wpCredentials, store, storeDB, fastStoreDB, extraData } =
		useObservableSuspense(resource);

	/**
	 *
	 */
	return {
		userDB,
		appState,
		translationsState,
		user,
		site,
		wpCredentials,
		store,
		storeDB,
		fastStoreDB,
		extraData,
	};
};
