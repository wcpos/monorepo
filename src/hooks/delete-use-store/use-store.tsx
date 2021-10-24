import * as React from 'react';
import { isRxDatabase } from 'rxdb/plugins/core';
import isString from 'lodash/isString';
import DatabaseService from '@wcpos/common/src/database';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

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
			const storeID = lastStore?.get('storeID');
			const site = await userDB.sites.findOne(lastStore?.get('siteID')).exec();
			const wpUser = await userDB.wp_credentials.findOne(lastStore?.get('wpUserID')).exec();

			if (storeID && site && wpUser) {
				const db = await DatabaseService.getStoreDB(
					sanitizeStoreName(storeID),
					site.getWcApiUrl(),
					wpUser.jwt as string
				);
				if (db) {
					_setStoreDB(db);
				}
			}
		})();
	}, []);

	/**
	 * when user enters a Store
	 */
	async function setStoreDB(id: string, site: any, wpUser: any) {
		const userDB = await DatabaseService.getUserDB();
		const db = await DatabaseService.getStoreDB(
			sanitizeStoreName(id),
			site.getWcApiUrl(),
			wpUser.jwt
		);
		await userDB.users.upsertLocal('lastStore', {
			storeID: id,
			siteID: site.localID,
			wpUserID: wpUser.localID,
		});
		_setStoreDB(db);
	}

	/**
	 * when user logs out
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
