import * as Crypto from 'expo-crypto';

import { createStoreDB, createUserDB, sanitizeWPCredentialsData } from '@wcpos/database';
import type { UserDatabase } from '@wcpos/database';
import { bareAuthParamSupported, formatAuthorizationParam } from '@wcpos/utils/auth-param';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { Platform } from '@wcpos/utils/platform';

import {
	mergeServerOwnedStoreFields,
	normalizeStorePayload,
	type ServerStorePayload,
} from '../../utils/merge-stores';
import { upsertSiteData } from '../../utils/site-writes';
import { initialProps } from './initial-props';

const appLogger = getLogger(['wcpos', 'app', 'hydration']);
const AUTH_TEST_TIMEOUT_MS = 10000;

async function fetchWithTimeout(
	input: Parameters<typeof fetch>[0],
	init: Parameters<typeof fetch>[1] = {}
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, AUTH_TEST_TIMEOUT_MS);

	try {
		return await fetch(input, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
}

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
 * Test authorization with Bearer token in header
 */
async function testHeaderAuth(wcposApiUrl: string, token: string): Promise<boolean> {
	try {
		const response = await fetchWithTimeout(`${wcposApiUrl}auth/test`, {
			method: 'GET',
			headers: {
				'X-WCPOS': '1',
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			return false;
		}

		const data = await response.json();
		return data && data.status === 'success';
	} catch {
		return false;
	}
}

/**
 * Test authorization with token as query parameter
 */
async function testParamAuth(wcposApiUrl: string, token: string, bareSupported: boolean) {
	try {
		const url = new URL(`${wcposApiUrl}auth/test`);
		url.searchParams.set('authorization', formatAuthorizationParam(token, bareSupported));

		const response = await fetchWithTimeout(url.toString(), {
			method: 'GET',
			headers: {
				'X-WCPOS': '1',
			},
		});

		if (!response.ok) {
			return false;
		}

		const data = await response.json();
		return data && data.status === 'success';
	} catch {
		return false;
	}
}

/**
 * Test authorization methods for a site
 * This is important because some servers block Authorization headers for security reasons
 */
export async function testAuthorizationMethod(
	wcposApiUrl: string,
	accessToken: string,
	wcposVersion?: string
): Promise<{ useJwtAsParam: boolean } | null> {
	try {
		// Test the Authorization header first. Only send the JWT in the query string if the
		// safer header path fails.
		const headerSupported = await testHeaderAuth(wcposApiUrl, accessToken);
		if (headerSupported) {
			appLogger.debug('Authorization method test results', {
				context: {
					headerSupported,
					paramSupported: false,
					wcposApiUrl,
				},
			});

			return { useJwtAsParam: false };
		}

		const paramSupported = await testParamAuth(
			wcposApiUrl,
			accessToken,
			bareAuthParamSupported(wcposVersion)
		);

		appLogger.debug('Authorization method test results', {
			context: {
				headerSupported,
				paramSupported,
				wcposApiUrl,
			},
		});

		if (paramSupported) {
			// Only params work - this usually means server is blocking Authorization headers.
			appLogger.warn('Server does not support Authorization headers, using query parameters', {
				context: { wcposApiUrl },
			});
			return { useJwtAsParam: true };
		}

		// Neither work - log but don't fail hydration.
		appLogger.warn('Authorization test failed for both methods', {
			context: { wcposApiUrl },
		});
		return null;
	} catch (err) {
		appLogger.warn('Authorization method test error', {
			context: {
				wcposApiUrl,
				error: getErrorMessage(err),
			},
		});
		return null;
	}
}

/**
 * Reusable function to hydrate user session from database IDs
 * Used by both hydration steps and runtime actions (login, store switch, etc.)
 */
export const hydrateUserSession = async (
	userDB: UserDatabase,
	sessionIds: { siteID?: string; wpCredentialsID?: string; storeID?: string }
) => {
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

export async function switchUserSessionStore(
	userDB: UserDatabase,
	appState: any,
	storeLocalID: string,
	opts?: {
		switchEngineScope?: (
			sessionData: Awaited<ReturnType<typeof hydrateUserSession>>
		) => Promise<void>;
	}
) {
	const current = await appState.get('current');
	const newState = { ...current, storeID: storeLocalID };
	const sessionData = await hydrateUserSession(userDB, newState);

	// The engine must reach the new scope BEFORE the session is committed — a
	// failed engine transition aborts the switch with durable state untouched.
	await opts?.switchEngineScope?.(sessionData);

	await appState.set('current', () => newState);
	return sessionData;
}

/**
 * Context that accumulates data as hydration steps complete
 */
// NOTE: the loose `any` fields are deliberate for now — typing them to the real database
// documents surfaces ~270 consumer errors (census 2026-08-19) and needs its own pass.
export interface HydrationContext {
	userDB?: UserDatabase;
	/** RxState from `userDB.addState('v2')` — session pointer (`current`). */
	appState?: any;
	translationsState?: any;
	user?: any;
	initialProps?: any;
	site?: any;
	wpCredentials?: any;
	store?: any;
	storeDB?: any;
	/** RxState from `storeDB.addState('data_v2')`. */
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
	/**
	 * A fail-soft step logs its error and lets hydration continue instead of
	 * rejecting the whole boot. Only for steps that *enrich* durable state — a
	 * failure must leave the app bootable from whatever state already exists.
	 */
	failSoft?: boolean;
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
		if (!userDB) {
			throw new Error('Failed to create user database');
		}
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
			initialProps, // null in standalone mode, populated in WordPress embedded mode
			// @TODO - start setting locale data here
			timestamp: new Date().toISOString(),
		};

		return result;
	},
};

/**
 * Step 2: Process initial props (web only, WordPress embedded mode)
 * This step is skipped in standalone mode where initialProps is null
 */
const processInitialPropsStep: HydrationStep = {
	name: 'PROCESS_INITIAL_PROPS',
	message: 'Processing initial props...',
	progressIncrement: 20,
	shouldExecute: (context) => Platform.isWeb && !!context.initialProps?.site,
	/**
	 * A poisoned embedded payload must not brick boot: a hard failure here
	 * rejects the hydration promise, the module cache is cleared, and the next
	 * render retries the identical failing work forever — the app never leaves
	 * the splash screen (the server adding `site.locale` did exactly this,
	 * 2026-08). Failing soft boots the previous session, or the connect screen
	 * when there is none, with the error logged.
	 */
	failSoft: true,
	execute: async (context) => {
		if (!context.initialProps || !context.userDB || !context.appState || !context.user) {
			throw new Error('Missing required context for initial props processing');
		}

		const { initialProps, userDB, appState, user } = context;
		const oldState = await appState.get('current');

		// Upsert site and credentials.
		// `upsertSiteData` merges instead of overwriting: a plain `upsert()` is a
		// full-document write and would drop the locally-owned `wp_credentials`
		// link array, which the embedded payload never carries (#902).
		const siteDoc = await upsertSiteData(userDB.sites, initialProps.site);
		const wpCredentialsDoc = await userDB.wp_credentials.upsert(
			sanitizeWPCredentialsData(initialProps.wp_credentials)
		);

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
			initialProps.stores.map(async (store: ServerStorePayload) => {
				const normalizedStore = normalizeStorePayload(store);
				const localID = await generateHashId({
					user: user.uuid,
					siteID: siteDoc.uuid,
					wpCredentialsID: wpCredentialsDoc.uuid,
					storeID: normalizedStore.id,
				});

				// Check if this is the URL-selected store
				if (urlStoreID === store.id) {
					selectedStoreID = localID;
				}

				return {
					...normalizedStore,
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

		// Patch existing documents without touching local preferences; insert new stores.
		const newStores = [];
		for (let index = 0; index < stores.length; index++) {
			const preparedStore = stores[index];
			const existingStore = await userDB.stores.findOne(preparedStore.localID).exec();
			if (existingStore) {
				await mergeServerOwnedStoreFields(
					existingStore,
					initialProps.stores[index] as ServerStorePayload
				);
			} else {
				newStores.push(preparedStore);
			}
		}
		if (newStores.length > 0) {
			await userDB.stores.bulkInsert(newStores);
		}
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
 * Step 3: Test authorization method (web only, WordPress embedded mode)
 * Some servers block Authorization headers, so we need to test if query parameters work instead
 * This step is skipped in standalone mode where initialProps is null
 */
const testAuthorizationStep: HydrationStep = {
	name: 'TEST_AUTHORIZATION',
	message: 'Testing authorization...',
	progressIncrement: 10,
	shouldExecute: (context) => Platform.isWeb && !!context.initialProps?.site,
	execute: async (context) => {
		if (!context.initialProps || !context.userDB) {
			return {};
		}

		const { initialProps, userDB } = context;
		const wcposApiUrl = initialProps.site?.wcpos_api_url;
		const accessToken = initialProps.wp_credentials?.access_token;

		if (!wcposApiUrl || !accessToken) {
			appLogger.debug('Skipping authorization test - missing wcpos_api_url or access_token');
			return {};
		}

		const result = await testAuthorizationMethod(
			wcposApiUrl,
			accessToken,
			initialProps.site?.wcpos_version
		);

		if (result) {
			/**
			 * Write the outcome both ways. The embedded payload never carries
			 * `use_jwt_as_param`, and the site write above merges rather than
			 * overwrites (#902), so a stale `true` from an earlier session would
			 * otherwise keep JWTs in the query string forever.
			 */
			const siteDoc = await userDB.sites.findOne(initialProps.site.uuid).exec();
			if (siteDoc) {
				await siteDoc.getLatest().incrementalPatch({
					use_jwt_as_param: !!result.useJwtAsParam,
				});
				if (result.useJwtAsParam) {
					appLogger.info('Site configured to use JWT as query parameter', {
						context: { siteId: initialProps.site.uuid },
					});
				}
			}
		}

		return {};
	},
};

/**
 * Step 4: Hydrate user session from current app state
 */
const hydrateUserSessionStep: HydrationStep = {
	name: 'HYDRATE_USER_SESSION',
	message: 'Loading user session...',
	progressIncrement: 50,
	execute: async (context) => {
		if (!context.userDB) {
			throw new Error('Missing userDB in hydration context');
		}
		const current = await context.appState.get('current');
		return await hydrateUserSession(context.userDB, current || {});
	},
};

/**
 * All hydration steps in execution order
 */
export const hydrationSteps: HydrationStep[] = [
	initializeUserDBStep,
	processInitialPropsStep,
	testAuthorizationStep,
	hydrateUserSessionStep,
];
