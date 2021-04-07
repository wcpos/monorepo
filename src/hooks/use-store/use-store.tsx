import * as React from 'react';
import { isRxDatabase } from 'rxdb/plugins/core';
import isString from 'lodash/isString';
import DatabaseService from '@wcpos/common/src/database';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type WPCredentialsDocument = import('@wcpos/common/src/database/wp-credentials').WPCredentialsDocument;

function sanitizeStoreName(id: string) {
	return `store_${id.replace(':', '_')}`;
}

/**
 *
 * @returns
 */
export function useStore() {
	const [storeDB, _setStoreDB] = React.useState<StoreDatabase>();

	/**
	 * run effect once to get the stored Store ID
	 */
	React.useEffect(() => {
		(async function init() {
			const userDB = await DatabaseService.getUserDB();
			const lastStore = await userDB.users.getLocal('lastStore');

			// we need to get the wp credentials here as well

			if (lastStore?.get('id')) {
				debugger;
				// @ts-ignore
				const db = await DatabaseService.getStoreDB(sanitizeStoreName(lastStore.get('id')));
				if (db) {
					_setStoreDB(db);
				}
			}
		})();
	}, []);

	/**
	 * when user enters a Store
	 */
	async function setStoreDB(id: string, wpUser: WPCredentialsDocument) {
		const userDB = await DatabaseService.getUserDB();
		if (id) {
			const db = await DatabaseService.getStoreDB(sanitizeStoreName(id), wpUser);
			await userDB.users.upsertLocal('lastStore', { id });
			_setStoreDB(db);
		} else {
			await userDB.users.upsertLocal('lastStore', { id: undefined });
			_setStoreDB(undefined);
		}
	}

	/**
	 * when user enters a Store
	 */
	async function unsetStoreDB() {
		const userDB = await DatabaseService.getUserDB();
		await userDB.users.upsertLocal('lastStore', { id: undefined });
		_setStoreDB(undefined);
	}

	/**
	 * @TODO - store last store in local storage
	 */

	return { storeDB, setStoreDB, unsetStoreDB };
}
