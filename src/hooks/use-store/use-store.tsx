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

	React.useEffect(() => {
		(async function init() {
			const userDB = await DatabaseService.getUserDB();
			const lastStore = await userDB.users.getLocal('lastStore');

			if (lastStore) {
				// restore the last storeDB
				const db = await getStoreDBById(lastStore.get('id'));
				if (db) {
					_setStoreDB(db);
				}
			}
		})();
	}, []);

	async function setStoreDB(id: string | StoreDatabase) {
		/**
		 * if store database has been passed as arg
		 */
		if (isRxDatabase(id)) {
			_setStoreDB(id as StoreDatabase);
		}

		/**
		 * else if store id has been passed
		 */
		if (isString(id)) {
			const db = await getStoreDBById(id);
			if (db) {
				const userDB = await DatabaseService.getUserDB();
				await userDB.users.upsertLocal('lastStore', { id });
				_setStoreDB(db);
			}
		}
	}

	/**
	 * @TODO - store last store in local storage
	 */

	return { storeDB, setStoreDB };
}
