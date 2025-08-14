import * as Crypto from 'expo-crypto';

import { createFastStoreDB, createStoreDB, createUserDB, isRxDocument } from '@wcpos/database';
import type { UserDatabase } from '@wcpos/database';
import Platform from '@wcpos/utils/platform';

import { initialProps } from './initial-props';

/**
 * Generate a unique id for stores
 */
async function generateHashId(dataObject: any): Promise<string> {
	// Convert the object to a JSON string
	const dataString = JSON.stringify(dataObject);

	// Create a SHA-256 hash of the string
	const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, dataString, {
		encoding: Crypto.CryptoEncoding.HEX,
	});

	// Return the first 10 characters of the hash
	return hash.substring(0, 10);
}

/**
 * Reusable function to hydrate user session from database IDs
 * Used by both hydration steps and runtime actions (login, store switch, etc.)
 */
export const hydrateUserSession = async (
	userDB: UserDatabase,
	sessionIds: { siteID?: string; wpCredentialsID?: string; storeID?: string }
) => {
	let site, wpCredentials, store, storeDB, fastStoreDB, extraData;

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
	if (isRxDocument(store)) {
		storeDB = await createStoreDB(store.localID);
		fastStoreDB = await createFastStoreDB(store.localID);
		extraData = await storeDB.addState('data_v2');
	}

	return { site, wpCredentials, store, storeDB, fastStoreDB, extraData };
};

/**
 * Context that accumulates data as hydration steps complete
 */
export interface HydrationContext {
	userDB?: UserDatabase;
	appState?: any;
	translationsState?: any;
	user?: any;
	initialProps?: any;
	site?: any;
	wpCredentials?: any;
	store?: any;
	storeDB?: any;
	fastStoreDB?: any;
	extraData?: any;
	stores?: any[];
	storeLocalIDs?: string[];
}

/**
 * Definition of a hydration step
 */
export interface HydrationStep {
	name: string;
	message: string;
	progressIncrement: number;
	execute: (context: HydrationContext) => Promise<Partial<HydrationContext>>;
	shouldExecute?: (context: HydrationContext) => boolean;
}

/**
 * Step 1:
 */
const initializeUserDBStep: HydrationStep = {
	name: 'INITIALIZE_USER_DB',
	message: 'Setting up user database...',
	progressIncrement: 20,
	execute: async (context) => {
		const userDB = await createUserDB();
		const appState = await userDB.addState('v2');
		const translationsState = await userDB.addState('translations_v2');
		let user = await userDB.users.findOne().exec();
		if (!user) {
			user = await userDB.users.insert({ first_name: 'Global', last_name: 'User' });
		}

		const result = {
			userDB,
			appState,
			translationsState,
			user,
			initialProps, // we just pass this through for now
			// @TODO - start setting locale data here
			timestamp: new Date().toISOString(),
		};

		return result;
	},
};

/**
 * Step 2: Process initial props (web only)
 */
const processInitialPropsStep: HydrationStep = {
	name: 'PROCESS_INITIAL_PROPS',
	message: 'Processing initial props...',
	progressIncrement: 20,
	shouldExecute: (context) => Platform.isWeb && !!context.initialProps,
	execute: async (context) => {
		if (!context.initialProps || !context.userDB || !context.appState || !context.user) {
			throw new Error('Missing required context for initial props processing');
		}

		const { initialProps, userDB, appState, user } = context;
		const oldState = await appState.get('current');

		// Upsert site and credentials
		const siteDoc = await userDB.sites.upsert(initialProps.site);
		const wpCredentialsDoc = await userDB.wp_credentials.upsert(initialProps.wp_credentials);

		// Handle URL store parameter
		let urlStoreID: number | null = null;
		if (typeof window !== 'undefined') {
			const urlParams = new URLSearchParams(window.location.search);
			const storeParam = urlParams.get('store');
			if (storeParam) {
				urlStoreID = parseInt(storeParam, 10);
				// Remove from URL so it doesn't get used again
				urlParams.delete('store');
				window.history.replaceState({}, '', `${window.location.pathname}?${urlParams}`);
			}
		}

		// Process stores and generate local IDs
		let selectedStoreID: string | undefined;
		const stores = await Promise.all(
			initialProps.stores.map(async (store: any) => {
				const localID = await generateHashId({
					user: user.uuid,
					siteID: siteDoc.uuid,
					wpCredentialsID: wpCredentialsDoc.uuid,
					storeID: store.id,
				});

				// Check if this is the URL-selected store
				if (urlStoreID === store.id) {
					selectedStoreID = localID;
				}

				return {
					...store,
					localID,
				};
			})
		);

		const storeLocalIDs = stores.map((store) => store.localID);

		// Determine final store ID
		let storeID: string;
		if (selectedStoreID) {
			// Use URL-selected store
			storeID = selectedStoreID;
		} else if (oldState?.storeID && storeLocalIDs.includes(oldState.storeID)) {
			// Use existing state if valid
			storeID = oldState.storeID;
		} else {
			// Default to first store
			storeID = stores[0].localID;
		}

		// Insert stores and update credentials
		await userDB.stores.bulkInsert(stores); // will not overwrite existing data
		await wpCredentialsDoc.patch({
			stores: storeLocalIDs,
		});

		// Update app state if changed
		const newState = {
			siteID: siteDoc.uuid,
			wpCredentialsID: wpCredentialsDoc.uuid,
			storeID,
		};

		if (JSON.stringify(oldState) !== JSON.stringify(newState)) {
			await appState.set('current', () => newState);
		}

		return {
			// Store processed data for potential use in later steps
			stores,
			storeLocalIDs,
		};
	},
};

/**
 * Step 3: Hydrate user session from current app state
 */
const hydrateUserSessionStep: HydrationStep = {
	name: 'HYDRATE_USER_SESSION',
	message: 'Loading user session...',
	progressIncrement: 60,
	execute: async (context) => {
		const current = await context.appState.get('current');
		return await hydrateUserSession(context.userDB, current || {});
	},
};

/**
 * All hydration steps in execution order - DUMMY VERSION FOR TESTING
 */
export const hydrationSteps: HydrationStep[] = [
	initializeUserDBStep,
	processInitialPropsStep,
	hydrateUserSessionStep,
];
