import * as React from 'react';
import { isRxDatabase } from 'rxdb/plugins/core';
import isString from 'lodash/isString';
import DatabaseService from '@wcpos/common/src/database';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

/**
 *
 * @param id
 * @returns
 */
async function getStoreDBById(id: string) {
	return DatabaseService.getStoreDB(`store_${id.replace(':', '_')}`);
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

			if (lastStore?.get('id')) {
				const db = await getStoreDBById(lastStore.get('id'));
				if (db) {
					_setStoreDB(db);
				}
			}
		})();
	}, []);

	/**
	 * when user enters a Store
	 */
	async function setStoreDB(id?: string) {
		const userDB = await DatabaseService.getUserDB();
		if (id) {
			const db = await getStoreDBById(id);
			await userDB.users.upsertLocal('lastStore', { id });
			_setStoreDB(db);
		} else {
			await userDB.users.upsertLocal('lastStore', { id: undefined });
			_setStoreDB(undefined);
		}
	}

	/**
	 * @TODO - store last store in local storage
	 */

	return { storeDB, setStoreDB };
}
