import { platformFetch } from '@wcpos/hooks/platform-fetch';
import { AppInfo } from '@wcpos/utils/app-info';
import { buildRequestPreamble } from '@wcpos/utils/request-preamble';
import { bareAuthParamSupported } from '@wcpos/utils/auth-param';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import {
	ERROR_CATALOGUE,
	ERROR_CODES,
	type ErrorCode,
} from '@wcpos/utils/logger/generated/error-codes.generated';
import { Platform } from '@wcpos/utils/platform';
import {
	INSTANCE_HEADER,
	instanceHeaderSupported,
	protocolHeadersSupported,
} from '@wcpos/utils/sync-protocol';
import {
	deriveSyntheticPathBase,
	deriveSyntheticPathRoot,
	isRestRouteBase,
	toRestRouteUrl,
} from '@wcpos/utils/rest-transport';

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
	timeoutMs = AUTH_TEST_TIMEOUT_MS,
	timeoutState?: { timedOut: boolean }
): Promise<{ response: Response; data: unknown; text: string } | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	try {
		// platformFetch, never the global: on Electron the renderer's fetch is
		// CORS-constrained against a `wcpos://-` origin, and these probes then fail
		// on healthy stores whose host echoes Origin back (the 1.10.2 outage).
		const response = await platformFetch(input, {
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
		if (timeoutState) timeoutState.timedOut = controller.signal.aborted;
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
		return (
			(await platformFetch(input, { cache: 'no-store', ...init, signal: controller.signal })) ??
			null
		);
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Test authorization with Bearer token in header
 */
type AuthProbeResult = { verdict: 'success' | 'auth-failed' | 'transport-dead'; status?: number };

async function testHeaderAuth(authTestUrl: string, token: string): Promise<AuthProbeResult> {
	try {
		const prepared = buildRequestPreamble(
			{ purpose: 'probe-header', client: AppInfo, accessToken: token },
			{ url: authTestUrl }
		);
		const result = await fetchJsonWithTimeout(prepared.url, {
			method: 'GET',
			headers: Object.fromEntries(prepared.headers),
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
		const prepared = buildRequestPreamble(
			{ purpose: 'probe-param', client: AppInfo, accessToken: token, bareAuthParam: bareSupported },
			{ url: authTestUrl }
		);
		const result = await fetchJsonWithTimeout(prepared.url, {
			method: 'GET',
			headers: Object.fromEntries(prepared.headers),
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
	cors?: { reflects_request_headers?: boolean };
}

function parseHeaderEcho(data: unknown): HeaderEchoResult | null {
	const candidate = data as
		| (Omit<HeaderEchoResult, 'cors'> & {
				v?: unknown;
				headers: Record<string, { received?: unknown }>;
				cors?: unknown;
		  })
		| null;
	const parsed =
		candidate &&
		candidate.v === 1 &&
		typeof candidate.headers === 'object' &&
		candidate.headers !== null &&
		typeof candidate.params === 'object' &&
		candidate.params !== null &&
		typeof candidate.headers.authorization?.received === 'boolean' &&
		typeof candidate.params.authorization === 'boolean'
			? (candidate as HeaderEchoResult)
			: null;
	if (!parsed) return null;

	const result: HeaderEchoResult = { headers: parsed.headers, params: parsed.params };
	const cors = (candidate as { cors?: unknown }).cors;
	if (
		typeof cors === 'object' &&
		cors !== null &&
		typeof (cors as { reflects_request_headers?: unknown }).reflects_request_headers === 'boolean'
	) {
		result.cors = {
			reflects_request_headers: (cors as { reflects_request_headers: boolean })
				.reflects_request_headers,
		};
	}
	return result;
}

interface EchoAnsweredVerdict {
	kind: 'answered';
	status: number;
	isHtml: boolean;
	challenge: boolean;
}

type EchoProbeVerdict = HeaderEchoResult | EchoAnsweredVerdict | null;

export type AuthTransportResolution =
	| {
			ok: true;
			useJwtAsParam: boolean;
			useRestRouteParam: boolean;
			useProtocolHeaders: boolean;
			useInstanceHeader: boolean;
	  }
	| { ok: false; code: ErrorCode | null; timedOut?: true };

/**
 * Probe which request headers survive to the server (B8, wcpos-infra#72).
 *
 * ONE request carrying all eight client headers AND every fallback query
 * param; the public `/wcpos/v2/echo` route (free plugin >= 1.10) reports what
 * arrived, so both credential channels are measured in a single round trip.
 * Classifies valid echo replies, HTTP answers, and transport-dead responses so
 * the caller can distinguish an old server from a blocked REST spelling.
 */
/**
 * The lowercase names of every header probeHeaderEcho SENDS (keep in step with
 * the fetch call below). The echo reports the server's whole allow-list floor,
 * which can include names the probe never sent (e.g. the protocol signal
 * headers) — those report `received: false` on a perfectly healthy store, so
 * dead-header reasoning must only ever consider names in this set.
 */
const ECHO_PROBE_SENT_HEADERS: readonly string[] = [
	'authorization',
	'content-type',
	'x-wcpos',
	'x-wcpos-store',
	'idempotency-key',
	'if-match',
	'if-none-match',
	'x-wcpos-idempotency-key',
];

async function probeHeaderEcho(
	echoUrl: string,
	accessToken: string,
	wcposVersion?: string,
	timeoutState?: { timedOut: boolean }
): Promise<EchoProbeVerdict> {
	try {
		const prepared = buildRequestPreamble(
			{
				purpose: 'probe-echo',
				client: AppInfo,
				accessToken,
				site: { wcpos_version: wcposVersion },
			},
			{
				url: echoUrl,
				// Adding a header here? Add its lowercase name to ECHO_PROBE_SENT_HEADERS.
				headers: {
					'Content-Type': 'application/json',
					'Idempotency-Key': 'wcpos-echo-probe',
					'If-Match': '"wcpos-echo-probe"',
					'If-None-Match': '"wcpos-echo-probe"',
					'X-WCPOS-Idempotency-Key': 'wcpos-echo-probe',
				},
			}
		);
		const result = await fetchJsonWithTimeout(
			prepared.url,
			{ method: 'GET', headers: Object.fromEntries(prepared.headers) },
			AUTH_PROBE_TIMEOUT_MS,
			timeoutState
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

		const echo = parseHeaderEcho(result.data);
		// The guard must reject not just non-probe bodies but INCOMPLETE probe
		// bodies: `{ v: 1, headers: {}, params: {} }` would otherwise read as
		// "both channels blocked" and skip the legacy fallback. Both
		// channel-deciding fields must be present as booleans, or the probe is
		// treated as unavailable.
		if (!echo) {
			// Answered, but not by the echo route (cache garbage, WP Hide homepage,
			// an answered verdict keeps this distinct from
			// network-dead (null) so the caller still reaches the legacy ladder.
			return answered;
		}

		return echo;
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
	echoesTimedOut?: boolean;
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
 * Our own echo timeouts on web also mean "not provably hostile" (#2328).
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
	if (echoHasStatus(evidence.pathEcho, 503) && echoHasStatus(evidence.queryEcho, 503)) {
		// The header-limit diagnosis needs the MINIMAL-header lane to succeed
		// while heavy responses 503. A 5xx ping is the same outage answering
		// everywhere — not evidence of a header ceiling.
		if (evidence.pingHealthy) return ERROR_CODES.RESPONSE_HEADERS_REJECTED;
		return null;
	}
	if (evidence.platform === 'web' && echoesNetworkDead(evidence)) {
		if (evidence.echoesTimedOut) return null;
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

export async function runConnectCompatibilityProbes(input: {
	pathBase: string;
	pathRoot: string;
	useRestRouteParam: boolean;
}): Promise<{ blocking: ErrorCode | null; warnings: ErrorCode[]; useCacheBuster: boolean }> {
	const resolvedUrl = (pathUrl: string) =>
		input.useRestRouteParam ? toRestRouteUrl(pathUrl, input.pathRoot) : pathUrl;
	const ping = buildRequestPreamble(
		{ purpose: 'probe-bare', client: AppInfo },
		{ url: `${input.pathBase}ping` }
	);
	const barePingUrl = resolvedUrl(ping.url);
	const nastyPing = new URL(barePingUrl);
	nastyPing.searchParams.set('s', 'Ünion select café');
	const bare = await fetchWithProbeTimeout(barePingUrl, { method: 'GET' });
	const nasty = await fetchWithProbeTimeout(nastyPing.toString(), { method: 'GET' });
	const warnings: ErrorCode[] = [];
	if (bare !== null && bare.status !== 403 && nasty?.status === 403) {
		const code = ERROR_CODES.SEARCH_BLOCKED_BY_WAF;
		warnings.push(code);
		appLogger.warn('Host security filter blocks ordinary search terms', {
			code,
			showToast: true,
			context: { classification: ERROR_CATALOGUE[code].symbol },
		});
	}

	const requestEcho = async (token: string, bustCache: boolean) => {
		const prepared = buildRequestPreamble(
			{
				purpose: 'probe-cache',
				client: AppInfo,
				accessToken: token,
				site: bustCache ? { use_cache_buster: true } : undefined,
			},
			{ url: `${input.pathBase}echo` }
		);
		const result = await fetchJsonWithTimeout(
			resolvedUrl(prepared.url),
			{ method: 'GET', headers: Object.fromEntries(prepared.headers) },
			AUTH_PROBE_TIMEOUT_MS
		);
		return result ? parseHeaderEcho(result.data) : null;
	};
	// Two DIFFERENT lengths by construction: a replaying cache answers the
	// second probe with the first probe's reported length.
	const FIRST_PROBE_TOKEN = 'cache.probe.12345';
	const SECOND_PROBE_TOKEN = 'cache.probe.second.token.1234';
	// The echo reports the whole header value, prefix included (verified live:
	// a 17-char token reports 24). Derived, never hardcoded — a changed literal
	// must not silently turn this comparison into a constant.
	const secondSentLength = `Bearer ${SECOND_PROBE_TOKEN}`.length;
	const isReplay = (first: HeaderEchoResult | null, second: HeaderEchoResult | null) => {
		const firstReported = first?.headers.authorization?.length;
		const secondReported = second?.headers.authorization?.length;
		return (
			first &&
			second &&
			// Load-bearing: a host that STRIPS Authorization reports {received:false,
			// length:0} on both probes — identical, and unequal to what was sent.
			// A stripped header is AUTH421's condition, not evidence of replay.
			first.headers.authorization?.received === true &&
			typeof firstReported === 'number' &&
			secondReported === firstReported &&
			secondReported !== secondSentLength
		);
	};
	const first = await requestEcho(FIRST_PROBE_TOKEN, false);
	const second = await requestEcho(SECOND_PROBE_TOKEN, false);
	if (isReplay(first, second)) {
		const code = ERROR_CODES.CACHE_SHARED_REPLAY;
		const bustedFirst = await requestEcho(FIRST_PROBE_TOKEN, true);
		const bustedSecond = await requestEcho(SECOND_PROBE_TOKEN, true);
		// Both busted echoes must report exactly what was sent: a cache that
		// ignores the key would answer the first probe's stored copy, and a probe
		// that never answered proves nothing. Anything less stays blocked.
		const arrivedIntact = (echo: HeaderEchoResult | null, sentLength: number) =>
			echo?.headers.authorization?.received === true &&
			echo.headers.authorization.length === sentLength;
		if (
			arrivedIntact(bustedFirst, `Bearer ${FIRST_PROBE_TOKEN}`.length) &&
			arrivedIntact(bustedSecond, secondSentLength)
		) {
			appLogger.warn(
				'Shared cache replay detected; routing around it with a unique cache key on every request',
				{
					code,
					context: { classification: ERROR_CATALOGUE[code].symbol, mitigated: true },
				}
			);
			warnings.push(code);
			return { blocking: null, warnings, useCacheBuster: true };
		}
		appLogger.error('Shared cache replay detected', { code, showToast: true });
		return { blocking: code, warnings, useCacheBuster: false };
	}

	return { blocking: null, warnings, useCacheBuster: false };
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
		evidence.simpleEchoSucceeded = simpleEcho !== null && simpleEcho.ok;
		if (!evidence.simpleEchoSucceeded && evidence.pingResolved === false) {
			evidence.noCorsPingResolved =
				(await fetchWithProbeTimeout(pingUrl, { mode: 'no-cors' })) !== null;
		}
	}
	const code = classifyHostBlock(evidence);
	if (code === null) {
		if (evidence.echoesTimedOut) {
			appLogger.warn('Authorization probes timed out — store too slow to answer', {
				context: { wcposApiUrl },
			});
			return { ok: false, code: null, timedOut: true };
		}
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
		const pathTimeout = { timedOut: false };
		const queryTimeout = { timedOut: false };
		let pathEcho: EchoProbeVerdict | undefined;
		if (!queryOnly) {
			pathEcho = await probeHeaderEcho(pathEchoUrl, accessToken, wcposVersion, pathTimeout);
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
			queryEcho = await probeHeaderEcho(queryEchoUrl, accessToken, wcposVersion, queryTimeout);
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
			echoesTimedOut:
				(pathEcho === null || queryEcho === null) &&
				(pathEcho !== null || pathTimeout.timedOut) &&
				(queryEcho !== null || queryTimeout.timedOut),
		};
		const pingUrl = pingProbeUrl(pathRoot);
		const simpleEchoUrl = queryOnly ? queryEchoUrl : pathEchoUrl;
		if (echo) {
			const useProtocolHeaders = protocolHeadersSupported(echo);
			// One harmless request per site negotiation proves this header's actual CORS path.
			let instanceProbe: HeaderEchoResult | null = null;
			if (Platform.isWeb && echo.cors?.reflects_request_headers === true) {
				const prepared = buildRequestPreamble(
					{
						purpose: 'probe-echo',
						client: AppInfo,
						accessToken,
						site: { wcpos_version: wcposVersion },
					},
					{
						url: useRestRouteParam ? queryEchoUrl : pathEchoUrl,
						headers: { [INSTANCE_HEADER]: 'wcpos-instance-probe' },
					}
				);
				const result = await fetchJsonWithTimeout(
					prepared.url,
					{ cache: 'no-store', headers: Object.fromEntries(prepared.headers) },
					AUTH_PROBE_TIMEOUT_MS
				);
				instanceProbe = result?.response.ok ? parseHeaderEcho(result.data) : null;
			}
			const useInstanceHeader = instanceHeaderSupported(
				echo,
				instanceProbe?.headers[INSTANCE_HEADER.toLowerCase()]?.received === true
			);
			// Only names the probe actually sent can be dead — the map also
			// carries the rest of the server's floor, which arrives
			// `received: false` on every healthy store.
			const deadHeaders = Object.entries(echo.headers)
				.filter(
					([name, state]) => ECHO_PROBE_SENT_HEADERS.includes(name) && state?.received !== true
				)
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
				return {
					ok: true,
					useJwtAsParam: false,
					useRestRouteParam,
					useProtocolHeaders,
					useInstanceHeader,
				};
			}
			if (paramAuthArrives) {
				return {
					ok: true,
					useJwtAsParam: true,
					useRestRouteParam,
					useProtocolHeaders,
					useInstanceHeader,
				};
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

			return {
				ok: true,
				useJwtAsParam: false,
				useRestRouteParam,
				useProtocolHeaders: false,
				useInstanceHeader: false,
			};
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
			return {
				ok: true,
				useJwtAsParam: true,
				useRestRouteParam,
				useProtocolHeaders: false,
				useInstanceHeader: false,
			};
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
