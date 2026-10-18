import * as Crypto from 'expo-crypto';

import { createUserDB } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { Platform } from '@wcpos/utils/platform';
import type {
	SiteDocument,
	StoreDatabase,
	StoreDocument,
	UserDatabase,
	UserDocument,
	WPCredentialsDocument,
} from '@wcpos/database';
import { ensureRegister } from '@wcpos/query/register-session';
import {
	type ExtraDataSlot,
	hydrateUserSession,
	mergeServerOwnedStoreFields,
	normalizeStorePayload,
	type ServerStorePayload,
	type SessionAppState,
	type TranslationsState,
} from '@wcpos/query/user-db';
import { upsertEmbeddedCredentials, upsertSiteData } from '@wcpos/query/user-db';

import { initialProps } from './initial-props';
import { commitStoreSession, IncompleteStoreSessionError } from './store-session';
import { testAuthorizationMethod } from './connect-probes';

import type { InitialProps } from './initial-props.types';

const appLogger = getLogger(['wcpos', 'app', 'hydration']);
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

export async function switchUserSessionStore(
	userDB: UserDatabase,
	appState: SessionAppState,
	storeLocalID: string
) {
	const current = await appState.get('current');
	const newState = { ...current, storeID: storeLocalID };
	const sessionData = await hydrateUserSession(userDB, newState);
	return commitStoreSession(userDB, { ids: newState, session: sessionData });
}

/** A store payload from the embedded page, normalized and stamped with its local id. */
export type PreparedStorePayload = ServerStorePayload & { localID: string };

/**
 * Context that accumulates data as hydration steps complete.
 *
 * The document fields are nullable because hydration legitimately produces a
 * sessionless state (logged out, standalone web before connect) — consumers
 * inside the logged-in area are gated on `storeDB` (`Stack.Protected`) and
 * assert presence via `useStoreSession()`, not through these types.
 *
 * KNOWN HOLE (owner-tolerated): these RxDB members live in a React context
 * value, which wcpos/no-rx-in-context-value forbids in general — this context
 * IS the app's session carrier and predates the rule. The named aliases keep
 * the members typed without widening the exception.
 */
// U4a keeps the existing mutable core carrier until the U4b orchestration move;
// query returns the same document instances through their read-only types.
export interface HydrationContext {
	session?: Awaited<ReturnType<typeof hydrateUserSession>>;
	userDB?: UserDatabase;
	/** Session pointer (`current`). */
	appState?: SessionAppState;
	translationsState?: TranslationsState;
	user?: UserDocument | null;
	/** Embedded-mode boot payload; null in standalone web, `{}` on native/electron. */
	initialProps?: InitialProps | null;
	site?: SiteDocument | null;
	wpCredentials?: WPCredentialsDocument | null;
	store?: StoreDocument | null;
	storeDB?: StoreDatabase | null;
	extraData?: ExtraDataSlot;
	stores?: PreparedStorePayload[];
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

		await ensureRegister(userDB);

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
		const initialSite = context.initialProps?.site;
		if (
			!context.initialProps ||
			!initialSite ||
			!context.userDB ||
			!context.appState ||
			!context.user
		) {
			throw new Error('Missing required context for initial props processing');
		}

		const { initialProps, userDB, appState, user } = context;
		const initialStores = initialProps.stores ?? [];
		const oldState = await appState.get('current');

		// Upsert site and credentials.
		// `upsertSiteData` merges instead of overwriting: a plain `upsert()` is a
		// full-document write and would drop the locally-owned `wp_credentials`
		// link array, which the embedded payload never carries (#902).
		const siteDoc = await upsertSiteData(userDB, initialSite);
		// The credential merges for the same reason: its `stores` links reset to `[]` otherwise.
		const wpCredentialsDoc = await upsertEmbeddedCredentials(userDB, initialProps.wp_credentials);

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
			initialStores.map(async (store: ServerStorePayload) => {
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
				// Inline initial props come from the free plugin without Pro's store
				// filters, so they never carry `display`; letting them revoke it
				// stopped the customer display service on every reload of /pos/.
				await mergeServerOwnedStoreFields(existingStore, initialStores[index], {
					revokeDisplayOnAbsence: false,
				});
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
			try {
				const session = await hydrateUserSession(userDB, newState);
				// ?store= is already stripped, so reload cannot retry a refused selection.
				await commitStoreSession(userDB, { ids: newState, session });
				return { stores, storeLocalIDs, session };
			} catch (error) {
				if (!(error instanceof IncompleteStoreSessionError)) throw error;
				appLogger.error(error.message, {
					code: ERROR_CODES.STORE_SESSION_INCOMPLETE,
					context: { missingFields: error.missingFields, ...newState },
				});
			}
		}

		return {
			// Store processed data for potential use in later steps
			stores,
			storeLocalIDs,
		};
	},
};

/**
 * Step 3: Test authorization method (web only)
 * Some servers block Authorization headers or reject transports at CORS, so
 * the probe ladder runs every web boot and persists the per-site transport
 * flags. Embedded mode reads the boot payload; standalone mode resolves the
 * current session's site from the user DB (the same lookup
 * HYDRATE_USER_SESSION performs afterwards). Running on BOTH web modes is
 * what lets a stale verdict — including `use_protocol_headers` after a
 * plugin downgrade — self-correct at the next reload; standalone is the
 * cross-origin deployment where that matters.
 */
const testAuthorizationStep: HydrationStep = {
	name: 'TEST_AUTHORIZATION',
	message: 'Testing authorization...',
	progressIncrement: 10,
	// Fail-soft: this step only refreshes per-site transport flags — the app
	// boots fine on the previously persisted (or default, conservative)
	// values, so an optional probe must never wedge hydration into the
	// splash-retry loop. A throw skips persistence, which is the same
	// no-write outcome as an ok:false verdict.
	failSoft: true,
	shouldExecute: () => Platform.isWeb,
	execute: async (context) => {
		if (!context.userDB) {
			return {};
		}

		const { userDB } = context;
		let siteUuid: string | undefined;
		let wcposApiUrl: string | undefined;
		let wpApiUrl: string | undefined;
		let wcposVersion: string | undefined;
		let accessToken: string | undefined;

		const initialSite = context.initialProps?.site;
		if (initialSite) {
			siteUuid = initialSite.uuid;
			wcposApiUrl = initialSite.wcpos_api_url;
			wpApiUrl = typeof initialSite.wp_api_url === 'string' ? initialSite.wp_api_url : undefined;
			wcposVersion = initialSite.wcpos_version;
			accessToken = context.initialProps?.wp_credentials?.access_token;
		} else if (context.appState) {
			const current = await context.appState.get('current');
			if (current?.siteID) {
				const siteDoc = await userDB.sites.findOne(current.siteID).exec();
				const wpCredentials = current.wpCredentialsID
					? await userDB.wp_credentials.findOne(current.wpCredentialsID).exec()
					: null;
				siteUuid = siteDoc?.uuid;
				wcposApiUrl = siteDoc?.wcpos_api_url;
				wpApiUrl = typeof siteDoc?.wp_api_url === 'string' ? siteDoc.wp_api_url : undefined;
				wcposVersion = siteDoc?.wcpos_version;
				accessToken = wpCredentials?.access_token;
			}
		}

		// The uuid guard also keeps the write below off `findOne(undefined)`,
		// which RxDB resolves to an arbitrary document — a payload without a
		// site uuid would otherwise patch `use_jwt_as_param` onto the wrong site.
		if (!siteUuid || !wcposApiUrl || !accessToken) {
			appLogger.debug(
				'Skipping authorization test - missing site uuid, wcpos_api_url or access_token'
			);
			return {};
		}

		const result = await testAuthorizationMethod(wcposApiUrl, accessToken, wcposVersion, wpApiUrl);

		if (result.ok) {
			/**
			 * Write every transport outcome both ways. The embedded payload never
			 * carries these local flags, and the site write above merges rather than
			 * overwrites (#902), so a stale `true` from an earlier session would
			 * otherwise keep the prior transport forever.
			 */
			const siteDoc = await userDB.sites.findOne(siteUuid).exec();
			if (siteDoc) {
				await siteDoc.getLatest().incrementalPatch({
					use_jwt_as_param: !!result.useJwtAsParam,
					use_rest_route_param: !!result.useRestRouteParam,
					use_protocol_headers: !!result.useProtocolHeaders,
					use_instance_header: !!result.useInstanceHeader,
				});
				if (result.useJwtAsParam) {
					appLogger.info('Site configured to use JWT as query parameter', {
						context: { siteId: siteUuid },
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
		if (!context.userDB || !context.appState) {
			throw new Error('Missing userDB or appState in hydration context');
		}
		const current = await context.appState.get('current');
		const { session } = context;
		if (
			session &&
			current &&
			session.site?.uuid === current.siteID &&
			session.wpCredentials?.uuid === current.wpCredentialsID &&
			session.store?.localID === current.storeID
		) {
			return {
				...session,
				site: session.site?.getLatest?.() ?? session.site,
				wpCredentials: session.wpCredentials?.getLatest?.() ?? session.wpCredentials,
				store: session.store?.getLatest?.() ?? session.store,
			} as Partial<HydrationContext>;
		}
		return (await hydrateUserSession(context.userDB, current || {})) as Partial<HydrationContext>;
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
