import * as Crypto from 'expo-crypto';

import { createStoreDB, createUserDB, sanitizeWPCredentialsData } from '@wcpos/database';
import { bareAuthParamSupported, formatAuthorizationParam } from '@wcpos/utils/auth-param';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import {
	ERROR_CATALOGUE,
	ERROR_CODES,
	type ErrorCode,
} from '@wcpos/utils/logger/generated/error-codes.generated';
import { Platform } from '@wcpos/utils/platform';
import {
	deriveSyntheticPathBase,
	deriveSyntheticPathRoot,
	isRestRouteBase,
	toRestRouteUrl,
} from '@wcpos/utils/rest-transport';
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
const PROBE_BODY_SNIPPET_LENGTH = 2048;

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
): Promise<{ response: Response; data: unknown; text: string } | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	try {
		const response = await fetch(input, {
			...init,
			signal: controller.signal,
		});
		const readText = async (target: Response) =>
			typeof target.text === 'function'
				? (await target.text().catch(() => '')).slice(0, PROBE_BODY_SNIPPET_LENGTH)
				: '';
		if (!response.ok) return { response, data: null, text: await readText(response) };
		const bodyCopy = typeof response.clone === 'function' ? response.clone() : null;
		const data: unknown = await response.json().catch(() => null);
		const text =
			typeof data === 'string'
				? data.slice(0, PROBE_BODY_SNIPPET_LENGTH)
				: data === null && bodyCopy
					? await readText(bodyCopy)
					: '';
		return { response, data, text };
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchWithProbeTimeout(
	input: Parameters<typeof fetch>[0],
	init: Parameters<typeof fetch>[1] = {}
): Promise<Response | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), AUTH_PROBE_TIMEOUT_MS);
	try {
		return (await fetch(input, { cache: 'no-store', ...init, signal: controller.signal })) ?? null;
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
type AuthProbeResult = { verdict: 'success' | 'auth-failed' | 'transport-dead'; status?: number };

async function testHeaderAuth(authTestUrl: string, token: string): Promise<AuthProbeResult> {
	try {
		const result = await fetchJsonWithTimeout(authTestUrl, {
			method: 'GET',
			headers: {
				'X-WCPOS': '1',
				Authorization: `Bearer ${token}`,
			},
		});

		if (!result || result.response.status === 403 || result.response.status === 404) {
			return { verdict: 'transport-dead', status: result?.response.status };
		}
		const data = result.data as { status?: string } | null;
		return {
			verdict: data?.status === 'success' ? 'success' : 'auth-failed',
			status: result.response.status,
		};
	} catch {
		return { verdict: 'transport-dead' };
	}
}

/**
 * Test authorization with token as query parameter
 */
async function testParamAuth(
	authTestUrl: string,
	token: string,
	bareSupported: boolean
): Promise<AuthProbeResult> {
	try {
		const url = new URL(authTestUrl);
		url.searchParams.set('authorization', formatAuthorizationParam(token, bareSupported));

		const result = await fetchJsonWithTimeout(url.toString(), {
			method: 'GET',
			headers: {
				'X-WCPOS': '1',
			},
		});

		if (!result || result.response.status === 403 || result.response.status === 404) {
			return { verdict: 'transport-dead', status: result?.response.status };
		}
		const data = result.data as { status?: string } | null;
		return {
			verdict: data?.status === 'success' ? 'success' : 'auth-failed',
			status: result.response.status,
		};
	} catch {
		return { verdict: 'transport-dead' };
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

interface EchoAnsweredVerdict {
	kind: 'answered';
	status: number;
	isHtml: boolean;
	challenge: boolean;
}

type EchoProbeVerdict = HeaderEchoResult | EchoAnsweredVerdict | null;

export type AuthTransportResolution =
	| { ok: true; useJwtAsParam: boolean; useRestRouteParam: boolean }
	| { ok: false; code: ErrorCode | null };

/**
 * Probe which request headers survive to the server (B8, wcpos-infra#72).
 *
 * ONE request carrying all eight client headers AND every fallback query
 * param; the public `/wcpos/v2/echo` route (free plugin >= 1.10) reports what
 * arrived, so both credential channels are measured in a single round trip.
 * Classifies valid echo replies, HTTP answers, and transport-dead responses so
 * the caller can distinguish an old server from a blocked REST spelling.
 */
async function probeHeaderEcho(
	echoUrl: string,
	accessToken: string,
	wcposVersion?: string
): Promise<EchoProbeVerdict> {
	try {
		const url = new URL(echoUrl);
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

		if (!result) return null;
		const bodyText = result.text.slice(0, PROBE_BODY_SNIPPET_LENGTH);
		const answered: EchoAnsweredVerdict = {
			kind: 'answered',
			status: result.response.status || (result.response.ok ? 200 : 401),
			isHtml:
				result.response.headers?.get('content-type')?.includes('text/html') === true ||
				bodyText.trimStart().startsWith('<'),
			challenge:
				(result.response.headers?.get('content-type')?.includes('text/html') === true ||
					bodyText.trimStart().startsWith('<')) &&
				/cf-chl|cf_chl|challenge-platform|captcha|turnstile|checking your browser|just a moment|attention required|enable javascript and cookies/i.test(
					bodyText
				),
		};
		if (!result.response.ok) return answered;

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
			// Answered, but not by the echo route (cache garbage, WP Hide homepage,
			// an answered verdict keeps this distinct from
			// network-dead (null) so the caller still reaches the legacy ladder.
			return answered;
		}

		return data as HeaderEchoResult;
	} catch {
		return null;
	}
}

async function probeLegacyAuth(
	authTestUrl: string,
	accessToken: string,
	wcposVersion?: string
): Promise<
	| { headerSupported: boolean; paramSupported: boolean; statuses?: [number?, number?] }
	| 'transport-dead'
> {
	const header = await testHeaderAuth(authTestUrl, accessToken);
	if (header.verdict === 'success')
		return { headerSupported: true, paramSupported: false, statuses: [header.status] };
	if (header.verdict === 'transport-dead') return 'transport-dead';
	const param = await testParamAuth(authTestUrl, accessToken, bareAuthParamSupported(wcposVersion));
	return param.verdict === 'transport-dead'
		? 'transport-dead'
		: {
				headerSupported: false,
				paramSupported: param.verdict === 'success',
				statuses: [header.status, param.status],
			};
}

interface HostBlockEvidence {
	platform: 'web' | 'native';
	queryOnly: boolean;
	pathEcho?: EchoProbeVerdict;
	queryEcho?: EchoProbeVerdict;
	legacyHeaderStatus?: number;
	legacyParamStatus?: number;
	credentialChannels?: boolean;
	/** The cors-mode ping fetch resolved (any readable status — server alive). */
	pingResolved?: boolean;
	/** The ping answered with a non-5xx — the minimal-header lane is healthy. */
	pingHealthy?: boolean;
	simpleEchoSucceeded?: boolean;
	noCorsPingResolved?: boolean;
}

const isAnsweredEcho = (verdict: EchoProbeVerdict | undefined): verdict is EchoAnsweredVerdict =>
	verdict !== null && verdict !== undefined && 'kind' in verdict && verdict.kind === 'answered';
const echoHasStatus = (verdict: EchoProbeVerdict | undefined, status: number) =>
	isAnsweredEcho(verdict) && verdict.status === status;
const echoesNetworkDead = (evidence: HostBlockEvidence) =>
	evidence.queryOnly
		? evidence.queryEcho === null
		: evidence.pathEcho === null && evidence.queryEcho === null;

/**
 * Null means "not provably hostile": every spelling network-died AND the ping
 * discriminator (research finding d9 — reachable-vs-hostile) found nothing
 * alive. That is a store-offline shape, owned by the online-status UX — a
 * host-blocked toast there would mislabel every outage as a hosting problem.
 */
function classifyHostBlock(evidence: HostBlockEvidence): ErrorCode | null {
	const answered = [evidence.pathEcho, evidence.queryEcho].filter(isAnsweredEcho);
	if (answered.some(({ challenge }) => challenge)) return ERROR_CODES.BOT_CHALLENGE_BLOCKING_API;
	if (
		(evidence.legacyHeaderStatus === 400 && evidence.legacyParamStatus === 414) ||
		(echoHasStatus(evidence.pathEcho, 400) && echoHasStatus(evidence.queryEcho, 414))
	) {
		return ERROR_CODES.AUTH_TOKEN_TOO_LARGE;
	}
	if (
		echoHasStatus(evidence.pathEcho, 503) &&
		echoHasStatus(evidence.queryEcho, 503)
	) {
		// The header-limit diagnosis needs the MINIMAL-header lane to succeed
		// while heavy responses 503. A 5xx ping is the same outage answering
		// everywhere — not evidence of a header ceiling.
		if (evidence.pingHealthy) return ERROR_CODES.RESPONSE_HEADERS_REJECTED;
		return null;
	}
	if (evidence.platform === 'web' && echoesNetworkDead(evidence)) {
		if (evidence.simpleEchoSucceeded) return ERROR_CODES.CORS_PREFLIGHT_BLOCKED;
		if (evidence.pingResolved === false && evidence.noCorsPingResolved) {
			return ERROR_CODES.CORS_MISCONFIGURED;
		}
	}
	if (evidence.credentialChannels) return ERROR_CODES.AUTH_TOKEN_BLOCKED_BY_HOST;
	if (echoesNetworkDead(evidence) && evidence.pingResolved !== true) return null;
	return ERROR_CODES.REST_TRANSPORT_BLOCKED;
}

/** Mirrors @wcpos/hooks/src/reachability-url without importing package internals. */
function pingProbeUrl(wpApiRoot: string): string {
	const base = wpApiRoot.endsWith('/') ? wpApiRoot : `${wpApiRoot}/`;
	const querySeparator = wpApiRoot.includes('rest_route=') ? '&' : '?';
	return `${base}wcpos/v2/ping${querySeparator}wcpos=1`;
}

async function finishHostBlock(
	wcposApiUrl: string,
	pingUrl: string,
	simpleEchoUrl: string,
	evidence: HostBlockEvidence
): Promise<AuthTransportResolution> {
	const bothEchoes503 =
		echoHasStatus(evidence.pathEcho, 503) && echoHasStatus(evidence.queryEcho, 503);
	const networkDeadEchoes = echoesNetworkDead(evidence);
	if (bothEchoes503 || networkDeadEchoes) {
		const ping = await fetchWithProbeTimeout(pingUrl);
		evidence.pingResolved = ping !== null;
		evidence.pingHealthy = ping !== null && ping.status < 500;
	}
	if (evidence.platform === 'web' && networkDeadEchoes) {
		const simpleEcho = await fetchWithProbeTimeout(simpleEchoUrl);
		evidence.simpleEchoSucceeded = simpleEcho !== null && typeof simpleEcho.status === 'number';
		if (!evidence.simpleEchoSucceeded && evidence.pingResolved === false) {
			evidence.noCorsPingResolved =
				(await fetchWithProbeTimeout(pingUrl, { mode: 'no-cors' })) !== null;
		}
	}
	const code = classifyHostBlock(evidence);
	if (code === null) {
		appLogger.warn('Authorization probes unreachable — store appears offline', {
			context: { wcposApiUrl },
		});
		return { ok: false, code: null };
	}
	appLogger.error('Store host blocked authorization probes', {
		code,
		showToast: true,
		context: { wcposApiUrl, classification: ERROR_CATALOGUE[code].symbol },
	});
	return { ok: false, code };
}

/**
 * Test authorization methods for a site
 * This is important because some servers block Authorization headers for security reasons
 */
export async function testAuthorizationMethod(
	wcposApiUrl: string,
	accessToken: string,
	wcposVersion?: string,
	wpApiUrl?: string
): Promise<AuthTransportResolution> {
	try {
		const pathBase = deriveSyntheticPathBase(wcposApiUrl);
		const pathRoot = wpApiUrl
			? deriveSyntheticPathRoot(wpApiUrl)
			: pathBase.replace(/wcpos\/v2\/?$/, '');
		const queryOnly = isRestRouteBase(wcposApiUrl);
		const pathEchoUrl = `${pathBase}echo`;
		const queryEchoUrl = toRestRouteUrl(pathEchoUrl, pathRoot);
		let echo: HeaderEchoResult | null = null;
		let useRestRouteParam = queryOnly;
		let pathEcho: EchoProbeVerdict | undefined;
		if (!queryOnly) {
			pathEcho = await probeHeaderEcho(pathEchoUrl, accessToken, wcposVersion);
			if (pathEcho && !isAnsweredEcho(pathEcho)) {
				echo = pathEcho;
			}
		}

		const pathStatus = isAnsweredEcho(pathEcho) ? pathEcho.status : undefined;
		// A 2xx that failed the echo shape guard is a host answering the path with
		// something other than WordPress REST (WP Hide's homepage-200 profile) —
		// that is the path-blocked shape, same as 403/404/network.
		const pathAnswerNotEcho = pathStatus !== undefined && pathStatus >= 200 && pathStatus < 300;
		const pathTriggersQuery =
			!echo &&
			(queryOnly ||
				pathStatus === 403 ||
				pathStatus === 404 ||
				pathStatus === 400 ||
				pathStatus === 503 ||
				pathAnswerNotEcho ||
				pathEcho === null);
		let queryEcho: EchoProbeVerdict | undefined;
		if (pathTriggersQuery) {
			queryEcho = await probeHeaderEcho(queryEchoUrl, accessToken, wcposVersion);
			if (queryEcho && !isAnsweredEcho(queryEcho)) {
				echo = queryEcho;
				useRestRouteParam = true;
			}
		}
		const hostEvidence: HostBlockEvidence = {
			platform: Platform.isWeb ? 'web' : 'native',
			queryOnly,
			pathEcho,
			queryEcho,
		};
		const pingUrl = pingProbeUrl(pathRoot);
		const simpleEchoUrl = queryOnly ? queryEchoUrl : pathEchoUrl;
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
				return { ok: true, useJwtAsParam: false, useRestRouteParam };
			}
			if (paramAuthArrives) {
				return { ok: true, useJwtAsParam: true, useRestRouteParam };
			}
			// Both credential channels are blocked — the probe measured this
			// authoritatively, so the legacy test would only fail slower.
			// Naming this condition for the cashier is Package C's first error.
			return finishHostBlock(wcposApiUrl, pingUrl, simpleEchoUrl, {
				...hostEvidence,
				credentialChannels: true,
			});
		}

		// No transport produced a valid echo. Only network-dead on every spelling
		// ends the ladder here — any HTTP answer (404 route-absent, 401 namespace
		// gate, cache-garbage 200, WAF 403) leaves auth/test worth probing, which
		// is exactly where the pre-ladder code always fell through to.
		const networkDeadEverywhere = queryOnly
			? queryEcho === null
			: pathEcho === null && queryEcho === null;
		if (networkDeadEverywhere) {
			return finishHostBlock(wcposApiUrl, pingUrl, simpleEchoUrl, hostEvidence);
		}
		if (
			(echoHasStatus(pathEcho, 400) && echoHasStatus(queryEcho, 414)) ||
			(echoHasStatus(pathEcho, 503) && echoHasStatus(queryEcho, 503))
		) {
			return finishHostBlock(wcposApiUrl, pingUrl, simpleEchoUrl, hostEvidence);
		}

		const pathAuthUrl = `${pathBase}auth/test`;
		const queryAuthUrl = toRestRouteUrl(pathAuthUrl, pathRoot);
		let legacy: Awaited<ReturnType<typeof probeLegacyAuth>> = 'transport-dead';
		// Path-form legacy first whenever the path answered at route level (401
		// namespace gate, 404 route-absent, 5xx) — but not for 403 or a non-echo
		// 2xx, which are the path-blocked shapes.
		const tryLegacyPath =
			!queryOnly && pathStatus !== undefined && pathStatus !== 403 && !pathAnswerNotEcho;
		if (tryLegacyPath) legacy = await probeLegacyAuth(pathAuthUrl, accessToken, wcposVersion);
		if (legacy === 'transport-dead') {
			legacy = await probeLegacyAuth(queryAuthUrl, accessToken, wcposVersion);
			useRestRouteParam = true;
		}
		if (legacy === 'transport-dead') {
			return finishHostBlock(wcposApiUrl, pingUrl, simpleEchoUrl, hostEvidence);
		}
		const { headerSupported, paramSupported } = legacy;
		if (headerSupported) {
			appLogger.debug('Authorization method test results', {
				context: {
					headerSupported,
					paramSupported: false,
					wcposApiUrl,
				},
			});

			return { ok: true, useJwtAsParam: false, useRestRouteParam };
		}

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
			return { ok: true, useJwtAsParam: true, useRestRouteParam };
		}
		if (legacy.statuses?.[0] === 400 && legacy.statuses[1] === 414) {
			return finishHostBlock(wcposApiUrl, pingUrl, simpleEchoUrl, {
				...hostEvidence,
				legacyHeaderStatus: legacy.statuses[0],
				legacyParamStatus: legacy.statuses[1],
			});
		}

		// Neither work - log but don't fail hydration.
		appLogger.warn('Authorization test failed for both methods', {
			context: { wcposApiUrl },
		});
		return { ok: false, code: null };
	} catch (err) {
		appLogger.warn('Authorization method test error', {
			context: {
				wcposApiUrl,
				error: getErrorMessage(err),
			},
		});
		return { ok: false, code: null };
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
			initialSite.wcpos_version,
			typeof initialSite.wp_api_url === 'string' ? initialSite.wp_api_url : undefined
		);

		if (result.ok) {
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
					use_rest_route_param: !!result.useRestRouteParam,
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
