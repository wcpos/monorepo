import * as Crypto from 'expo-crypto';

import { createStoreDB, createUserDB, sanitizeWPCredentialsData } from '@wcpos/database';
import { bareAuthParamSupported, formatAuthorizationParam } from '@wcpos/utils/auth-param';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { Platform } from '@wcpos/utils/platform';
import type {
	SiteDocument,
	StoreDatabase,
	StoreDocument,
	UserDatabase,
	UserDocument,
	WPCredentialsDocument,
} from '@wcpos/database';

import {
	mergeServerOwnedStoreFields,
	normalizeStorePayload,
	type ServerStorePayload,
} from '../../utils/merge-stores';
import { upsertSiteData } from '../../utils/site-writes';
import { initialProps } from './initial-props';

import type { RxState } from 'rxdb';
import type { InitialProps } from './initial-props.types';

const appLogger = getLogger(['wcpos', 'app', 'hydration']);
const AUTH_TEST_TIMEOUT_MS = 10000;
const AUTH_PROBE_TIMEOUT_MS = 3000;

/**
 * Fetch JSON with the abort timer spanning BOTH the request and the body
 * read: a host that returns headers and then stalls the body would otherwise
 * hang hydration forever (the #1155 infinite-spinner class). Returns null on
 * abort/network failure; otherwise the response plus its parsed body (`data`
 * is null for a non-OK response or a non-JSON body).
 */
async function fetchJsonWithTimeout(
	input: Parameters<typeof fetch>[0],
	init: Parameters<typeof fetch>[1] = {},
	timeoutMs = AUTH_TEST_TIMEOUT_MS
): Promise<{ response: Response; data: unknown } | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	try {
		const response = await fetch(input, {
			...init,
			signal: controller.signal,
		});
		if (!response.ok) {
			return { response, data: null };
		}
		const data: unknown = await response.json().catch(() => null);
		return { response, data };
	} catch {
		return null;
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
		const result = await fetchJsonWithTimeout(`${wcposApiUrl}auth/test`, {
			method: 'GET',
			headers: {
				'X-WCPOS': '1',
				Authorization: `Bearer ${token}`,
			},
		});

		const data = result?.data as { status?: string } | null | undefined;
		return data?.status === 'success';
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

		const result = await fetchJsonWithTimeout(url.toString(), {
			method: 'GET',
			headers: {
				'X-WCPOS': '1',
			},
		});

		const data = result?.data as { status?: string } | null | undefined;
		return data?.status === 'success';
	} catch {
		return false;
	}
}

/**
 * The echo probe's response: which of the client's request headers and
 * fallback query params actually reached the server's REST stack.
 */
interface HeaderEchoResult {
	headers: Record<string, { received?: boolean; length?: number }>;
	params: Record<string, boolean>;
}

/**
 * Probe which request headers survive to the server (B8, wcpos-infra#72).
 *
 * ONE request carrying all eight client headers AND every fallback query
 * param; the public `/wcpos/v2/echo` route (free plugin >= 1.10) reports what
 * arrived, so both credential channels are measured in a single round trip.
 * Returns null when the endpoint is unavailable (older server, network
 * failure, or a host that answers with something other than the probe body) —
 * the caller then falls back to the legacy two-request auth test.
 */
async function probeHeaderEcho(
	wcposApiUrl: string,
	accessToken: string,
	wcposVersion?: string
): Promise<HeaderEchoResult | null> {
	try {
		const url = new URL(`${wcposApiUrl}echo`);
		// The URL must never carry the real token — query strings persist in
		// server/proxy/telemetry logs, and this probe runs every boot even when
		// header auth is healthy. Masking char-for-char keeps what a WAF keys
		// on: the value's SHAPE (Bearer prefix decision, JWT charset and dots)
		// and its LENGTH (P17-class size ceilings). The Authorization HEADER
		// keeps the real token: headers do not land in URL logs, and header
		// arrival is the channel being measured.
		const probeToken = accessToken.replace(/[A-Za-z0-9]/g, 'x');
		url.searchParams.set(
			'authorization',
			formatAuthorizationParam(probeToken, bareAuthParamSupported(wcposVersion))
		);
		url.searchParams.set('wcpos', '1');
		url.searchParams.set('store_id', '1');

		const result = await fetchJsonWithTimeout(
			url.toString(),
			{
				method: 'GET',
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
					'X-WCPOS': '1',
					'X-WCPOS-Store': '1',
					'Idempotency-Key': 'wcpos-echo-probe',
					'If-Match': '"wcpos-echo-probe"',
					'If-None-Match': '"wcpos-echo-probe"',
					'X-WCPOS-Idempotency-Key': 'wcpos-echo-probe',
				},
			},
			AUTH_PROBE_TIMEOUT_MS
		);

		if (!result || !result.response.ok) {
			return null;
		}

		const data = result.data as
			(HeaderEchoResult & { v?: unknown; headers: Record<string, { received?: unknown }> }) | null;
		// The guard must reject not just non-probe bodies but INCOMPLETE probe
		// bodies: `{ v: 1, headers: {}, params: {} }` would otherwise read as
		// "both channels blocked" and skip the legacy fallback. Both
		// channel-deciding fields must be present as booleans, or the probe is
		// treated as unavailable.
		if (
			!data ||
			data.v !== 1 ||
			typeof data.headers !== 'object' ||
			data.headers === null ||
			typeof data.params !== 'object' ||
			data.params === null ||
			typeof data.headers.authorization?.received !== 'boolean' ||
			typeof data.params.authorization !== 'boolean'
		) {
			return null;
		}

		return data as HeaderEchoResult;
	} catch {
		return null;
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
		// Echo probe first (B8): one request measures every header and both
		// credential channels at once, and names exactly which headers a
		// hostile host eats. Falls through to the legacy two-request test when
		// the endpoint is unavailable (servers < 1.10).
		const echo = await probeHeaderEcho(wcposApiUrl, accessToken, wcposVersion);
		if (echo) {
			const deadHeaders = Object.entries(echo.headers)
				.filter(([, state]) => state?.received !== true)
				.map(([name]) => name);
			if (deadHeaders.length > 0) {
				appLogger.warn('Some POS request headers do not reach this server', {
					context: { wcposApiUrl, deadHeaders, params: echo.params },
				});
			}
			const headerAuthArrives = echo.headers.authorization?.received === true;
			const paramAuthArrives = echo.params.authorization === true;
			appLogger.debug('Header echo probe results', {
				context: { wcposApiUrl, headerAuthArrives, paramAuthArrives, deadHeaders },
			});
			if (headerAuthArrives) {
				return { useJwtAsParam: false };
			}
			if (paramAuthArrives) {
				return { useJwtAsParam: true };
			}
			// Both credential channels are blocked — the probe measured this
			// authoritatively, so the legacy test would only fail slower.
			// Naming this condition for the cashier is Package C's first error.
			appLogger.warn('Server blocks the login token on both channels', {
				context: { wcposApiUrl, deadHeaders },
			});
			return null;
		}

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
	appState: SessionAppState,
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
 * The session pointer persisted in the user DB's `v2` RxState under `current`.
 */
export interface CurrentSessionIDs {
	siteID?: string;
	wpCredentialsID?: string;
	storeID?: string;
}

/** RxState from `userDB.addState('v2')`. */
export type SessionAppState = RxState<{ current: CurrentSessionIDs | null }>;

/** RxState from `userDB.addState('translations_v2')` — locale resource cache. */
export type TranslationsState = RxState<Record<string, unknown>>;

/** RxState from `storeDB.addState('data_v2')` — server-derived extras (tax classes, order statuses…). */
export type ExtraDataState = RxState<Record<string, unknown>>;

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
export interface HydrationContext {
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
	extraData?: ExtraDataState;
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
		const siteDoc = await upsertSiteData(userDB.sites, initialSite);
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
				await mergeServerOwnedStoreFields(existingStore, initialStores[index]);
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
		const initialSite = initialProps.site;
		const wcposApiUrl = initialSite?.wcpos_api_url;
		const accessToken = initialProps.wp_credentials?.access_token;

		// The uuid guard also keeps the write below off `findOne(undefined)`,
		// which RxDB resolves to an arbitrary document — a payload without a
		// site uuid would otherwise patch `use_jwt_as_param` onto the wrong site.
		if (!initialSite?.uuid || !wcposApiUrl || !accessToken) {
			appLogger.debug(
				'Skipping authorization test - missing site uuid, wcpos_api_url or access_token'
			);
			return {};
		}

		const result = await testAuthorizationMethod(
			wcposApiUrl,
			accessToken,
			initialSite.wcpos_version
		);

		if (result) {
			/**
			 * Write the outcome both ways. The embedded payload never carries
			 * `use_jwt_as_param`, and the site write above merges rather than
			 * overwrites (#902), so a stale `true` from an earlier session would
			 * otherwise keep JWTs in the query string forever.
			 */
			const siteDoc = await userDB.sites.findOne(initialSite.uuid).exec();
			if (siteDoc) {
				await siteDoc.getLatest().incrementalPatch({
					use_jwt_as_param: !!result.useJwtAsParam,
				});
				if (result.useJwtAsParam) {
					appLogger.info('Site configured to use JWT as query parameter', {
						context: { siteId: initialSite.uuid },
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
