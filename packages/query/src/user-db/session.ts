import { createStoreDB } from '@wcpos/database/create-db';
import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import { setDatabase } from '@wcpos/utils/logger';

import type {
	ReadonlySiteRecord,
	ReadonlyStoreRecord,
	ReadonlyWpCredentialsRecord,
} from './records';
import type { ExtraDataSlot } from './state';

export interface HydratedStoreSession {
	site: ReadonlySiteRecord | null | undefined;
	wpCredentials: ReadonlyWpCredentialsRecord | null | undefined;
	store: ReadonlyStoreRecord | null | undefined;
	storeDB: StoreDatabase | undefined;
	extraData: ExtraDataSlot | undefined;
}

/**
 * Reusable function to hydrate user session from database IDs
 * Used by both hydration steps and runtime actions (login, store switch, etc.)
 */
export const hydrateUserSession = async (
	userDB: UserDatabase,
	sessionIds: { siteID?: string; wpCredentialsID?: string; storeID?: string }
): Promise<HydratedStoreSession> => {
	let site, wpCredentials, store, storeDB, extraData;

	/**
	 * Becareful! RxDB will return a value if primary ID is empty, it sucks, I hate it.
	 */
	if (sessionIds.siteID) {
		site = await userDB.sites.findOne(sessionIds.siteID).exec();
	}
	if (sessionIds.wpCredentialsID) {
		wpCredentials = await userDB.wp_credentials.findOne(sessionIds.wpCredentialsID).exec();
	}
	if (sessionIds.storeID) {
		store = await userDB.stores.findOne(sessionIds.storeID).exec();
	}
	if (store) {
		const db = await createStoreDB(store.localID!);
		if (!db) {
			throw new Error('Failed to create store database');
		}

		storeDB = db;
		extraData = await db.addState('data_v2');
	}

	return { site, wpCredentials, store, storeDB, extraData };
};

/** Recovery never unbinds: the app layout owns the logger lifetime. */
export function bindSurvivingStoreLogs(storeDB: StoreDatabase | null | undefined): void {
	const survivingLogs = storeDB?.collections.logs;
	if (survivingLogs) setDatabase(survivingLogs);
}
