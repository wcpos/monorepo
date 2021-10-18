import * as React from 'react';
import DatabaseService from '@wcpos/common/src/database';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type SiteDocument = import('@wcpos/common/src/database').SiteDocument;
type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

function sanitizeStoreName(id: string) {
	return `store_${id.replace(':', '_')}`;
}

export interface LastUser {
	site?: SiteDocument;
	wpUser?: WPCredentialsDocument;
	storeDB?: StoreDatabase;
	storeID?: string;
}

/**
 *
 * @TODO - change lastStore key
 */
export function useLastUser() {
	const [lastUser, _setLastUser] = React.useState<LastUser>();
	const [ready, setReady] = React.useState(false);

	/**
	 * run effect once to get the last user from local storage
	 */
	React.useEffect(() => {
		(async function init() {
			const userDB = await DatabaseService.getUserDB();
			const lastStore = await userDB.users.getLocal('lastStore');
			const storeID = lastStore?.get('storeID');
			const site = await userDB.sites.findOne(lastStore?.get('siteID')).exec();
			const wpUser = await userDB.wp_credentials.findOne(lastStore?.get('wpUserID')).exec();

			if (storeID && site && wpUser) {
				const storeDB = await DatabaseService.getStoreDB(
					sanitizeStoreName(storeID)
					// site.getWcApiUrl(),
					// wpUser.jwt as string
				);
				if (storeDB) {
					_setLastUser({
						site,
						wpUser,
						storeDB,
						storeID,
					});
				}
			}

			setReady(true);
		})();
	}, []);

	/**
	 * when user enters a Store
	 */
	async function setLastUser(id: string, site: any, wpUser: any) {
		const userDB = await DatabaseService.getUserDB();
		const storeDB = await DatabaseService.getStoreDB(
			sanitizeStoreName(id)
			// site.getWcApiUrl(),
			// wpUser.jwt
		);
		await userDB.users.upsertLocal('lastStore', {
			storeID: id,
			siteID: site.localId,
			wpUserID: wpUser.localId,
		});
		_setLastUser({
			site,
			wpUser,
			storeDB,
			storeID: id,
		});
	}

	/**
	 * when user logs out
	 */
	async function unsetLastUser() {
		const userDB = await DatabaseService.getUserDB();
		const lastStore = await userDB.users.getLocal('lastStore');
		lastStore.remove();
		_setLastUser(undefined);
	}

	return {
		site: lastUser?.site,
		wpUser: lastUser?.wpUser,
		storeDB: lastUser?.storeDB,
		storeID: lastUser?.storeID,
		setLastUser,
		unsetLastUser,
		ready,
	};
}
