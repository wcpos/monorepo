import React from 'react';
import database from '../../database';
import { SET_USER, RESTORE_LAST_USER } from './action-types';

// type AppState = import('./app-state-provider').AppState;
type AppAction = import('./app-state-provider').AppAction;

const getLastStore = async () => {
	return database.adapter.getLocal('last_store');
};

const setLastStore = async (storeId: string) => {
	return database.adapter.setLocal('last_store', storeId);
};

export const removeLastStore = async () => {
	return database.adapter.removeLocal('last_store');
};

const useDatabase = (dispatch: React.Dispatch<AppAction>): void => {
	React.useEffect(() => {
		(async function init() {
			const appUsersCollection = database.collections.get('app_users');
			const storesCollection = database.collections.get('stores');
			const lastStore = await getLastStore();

			if (!lastStore) {
				debugger;
				const appUserCount = await appUsersCollection.query().fetchCount();

				if (appUserCount === 0) {
					// create new user
					await database.action(async () => {
						const newUser = await appUsersCollection.create((user) => {
							user.display_name = 'New User';
						});
						dispatch({ type: SET_USER, payload: { user: newUser } });
					});
				}

				if (appUserCount === 0) {
					// set only user
					const allUsers = await appUsersCollection.query().fetch();
					dispatch({ type: SET_USER, payload: { user: allUsers[0] } });
				}
			}
		})();
	}, [dispatch]);
};

export default useDatabase;
