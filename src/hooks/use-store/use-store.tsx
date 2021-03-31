import * as React from 'react';
import { isRxDatabase } from 'rxdb/plugins/core';
import isString from 'lodash/isString';
import DatabaseService from '@wcpos/common/src/database';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

export function useStore() {
	const [storeDB, _setStoreDB] = React.useState<StoreDatabase>();

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
			const parsedId = `store_${id.replace(':', '_')}`;
			const db = await DatabaseService.getStoreDB(parsedId);
			if (db) {
				_setStoreDB(db);
			}
		}
	}

	/**
	 * @TODO - store last store in local storage
	 */

	return { storeDB, setStoreDB };
}
