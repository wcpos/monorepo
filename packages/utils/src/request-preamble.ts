import { bareAuthParamSupported, formatAuthorizationParam } from './auth-param';
import { deriveSyntheticPathRoot, resolveRestTransport, toRestRouteUrl } from './rest-transport';
import {
	CLIENT_HEADER,
	CLIENT_QUERY_PARAM,
	formatClientSignal,
	PROTOCOL_HEADER,
	PROTOCOL_QUERY_PARAM,
	sendsProtocolHeaders,
	sendsProtocolQueryTwins,
	SYNC_PROTOCOL_VERSION,
} from './sync-protocol';

export type RequestPurpose =
	| 'sync'
	| 'rest'
	| 'cashier'
	| 'refresh'
	| 'probe-header'
	| 'probe-param'
	| 'probe-echo'
	| 'probe-cache'
	| 'probe-bare';
export interface PreambleSite {
	wp_api_url?: string;
	use_rest_route_param?: boolean;
	use_jwt_as_param?: boolean;
	use_protocol_headers?: boolean;
	wcpos_version?: string;
}
export function toPreambleSite(site: PreambleSite): PreambleSite {
	const {
		wp_api_url,
		use_rest_route_param,
		use_jwt_as_param,
		use_protocol_headers,
		wcpos_version,
	} = site;
	return {
		wp_api_url,
		use_rest_route_param,
		use_jwt_as_param,
		use_protocol_headers,
		wcpos_version,
	};
}
// Probes measure individual channels, never persisted transport/protocol preferences.
const PROBE_POLICY = {
	clientHeaders: 'none',
	markerParam: false,
	overwriteAuth: true,
	scope: 'none',
	rewriteUrl: false,
} as const;
const POLICY: Record<
	RequestPurpose,
	{
		clientHeaders: 'always' | 'unless-head-or-opted-out' | 'marker' | 'none';
		auth: 'site' | 'none' | 'header' | 'param' | 'echo';
		markerParam: boolean;
		overwriteAuth: boolean;
		scope: 'sync' | 'rest' | 'none' | 'fixture';
		rewriteUrl: boolean;
	}
> = {
	sync: {
		auth: 'site',
		clientHeaders: 'always',
		markerParam: true,
		overwriteAuth: true,
		scope: 'sync',
		rewriteUrl: true,
	},
	rest: {
		auth: 'site',
		clientHeaders: 'unless-head-or-opted-out',
		markerParam: false,
		overwriteAuth: false,
		scope: 'rest',
		rewriteUrl: true,
	},
	refresh: {
		auth: 'none',
		clientHeaders: 'always',
		// out-R4 finding 6: adding wcpos=1 to refresh is a separate behavior change.
		markerParam: false,
		overwriteAuth: false,
		scope: 'none',
		rewriteUrl: true,
	},
	cashier: {
		auth: 'site',
		clientHeaders: 'unless-head-or-opted-out',
		markerParam: true,
		overwriteAuth: false,
		scope: 'none',
		rewriteUrl: true,
	},
	'probe-header': { ...PROBE_POLICY, clientHeaders: 'marker', auth: 'header' },
	'probe-param': { ...PROBE_POLICY, clientHeaders: 'marker', auth: 'param' },
	'probe-echo': {
		...PROBE_POLICY,
		clientHeaders: 'marker',
		auth: 'echo',
		markerParam: true,
		scope: 'fixture',
	},
	'probe-cache': { ...PROBE_POLICY, auth: 'header', markerParam: true, scope: 'fixture' },
	'probe-bare': { ...PROBE_POLICY, auth: 'none', markerParam: true },
};
export interface RequestPreambleContext {
	purpose: RequestPurpose;
	site?: PreambleSite;
	client: {
		platform: string;
		version: string;
		userAgentHeader: Readonly<Record<string, string>>;
	};
	accessToken?: string;
	refreshedAccessToken?: string;
	storeId?: number | string | null;
	wpJsonRoot?: string;
	bareAuthParam?: boolean;
}
export interface PreambleRequest {
	url: string;
	method?: string;
	headers?: HeadersInit;
	wcposHeaders?: boolean;
}
export interface PreparedRequest {
	url: string;
	headers: Headers;
}

// Store 0 is the free plugin's "no store" sentinel, as in the order lane.
// Absence protects store-scoped prices from overwrite; a bogus 0 reads as a real scope.
function normalizeStoreScope(storeId: number | string | null | undefined): string | null {
	if (storeId === null || storeId === undefined) return null;
	if (typeof storeId === 'number') {
		return Number.isFinite(storeId) && storeId > 0 ? String(storeId) : null;
	}
	const trimmed = storeId.trim();
	if (trimmed === '' || trimmed === '0') return null;
	return trimmed;
}

export function buildClientHeaders(
	client: RequestPreambleContext['client'],
	site: PreambleSite,
	request: PreambleRequest
): Headers {
	const headers = new Headers(request.headers);
	const clientSignal = formatClientSignal(client.platform, client.version);
	if (request.method?.toLowerCase() !== 'head' && request.wcposHeaders !== false) {
		// POS-only namespaces otherwise answer rest_no_route, leaving sync degraded-empty.
		headers.set('X-WCPOS', '1');
		if (sendsProtocolHeaders(client.platform, site.use_protocol_headers)) {
			headers.set(PROTOCOL_HEADER, String(SYNC_PROTOCOL_VERSION));
			headers.set(CLIENT_HEADER, clientSignal);
		}
		// Native/Electron need a product UA: blank/library POST UAs earn permanent AIOS
		// IP bans (B10). EMPTY on web: Firefox honours overrides; product UAs look like bots.
		for (const [name, value] of Object.entries(client.userAgentHeader)) {
			headers.set(name, value);
		}
	}
	return headers;
}

/** Prepare only the wire preamble; callers own credentials, endpoints and response policy. */
export function buildRequestPreamble(
	context: RequestPreambleContext,
	request: PreambleRequest
): PreparedRequest {
	const { purpose, site = {}, client } = context;
	const policy = POLICY[purpose];
	const clientSignals =
		policy.clientHeaders === 'always' || policy.clientHeaders === 'unless-head-or-opted-out';
	const headers = clientSignals
		? buildClientHeaders(
				client,
				site,
				policy.clientHeaders === 'always'
					? { ...request, method: undefined, wcposHeaders: true }
					: request
			)
		: new Headers(request.headers);
	if (policy.clientHeaders === 'marker') headers.set('X-WCPOS', '1');
	const clientSignal = formatClientSignal(client.platform, client.version);

	// Refresh may rewrite only with a WordPress root, never a namespace-derived root.
	const root = context.wpJsonRoot ?? deriveSyntheticPathRoot(site.wp_api_url ?? '');
	const url = new URL(
		policy.rewriteUrl &&
			(purpose !== 'refresh' || !!site.wp_api_url) &&
			resolveRestTransport(site) === 'query'
			? toRestRouteUrl(request.url, root)
			: request.url
	);
	// Mutating searchParams re-encodes the whole query ([ → %5B, , → %2C); PHP decodes both forms identically.
	const setParam = (name: string, value: string) => {
		if (policy.overwriteAuth || !url.searchParams.has(name)) url.searchParams.set(name, value);
	};
	// Explicit retry credentials replace the selected channel; ordinary REST caller overrides survive.
	const token = context.refreshedAccessToken ?? context.accessToken;
	const overwriteAuth = policy.overwriteAuth || context.refreshedAccessToken !== undefined;
	if (policy.auth !== 'none' && token) {
		const queryAuth =
			policy.auth === 'param' ||
			policy.auth === 'echo' ||
			(policy.auth === 'site' && site.use_jwt_as_param);
		if (queryAuth) {
			if (overwriteAuth || !url.searchParams.has('authorization')) {
				// The echo probe's URL must never carry the real token: query strings persist in
				// server/proxy/telemetry logs and this probe runs every boot. Masking char-for-char
				// keeps what a WAF keys on (Bearer prefix decision, JWT charset and dots, LENGTH);
				// the Authorization HEADER below keeps the real token, since header arrival is the
				// channel being measured.
				const paramToken = policy.auth === 'echo' ? token.replace(/[A-Za-z0-9]/g, 'x') : token;
				url.searchParams.set(
					'authorization',
					formatAuthorizationParam(
						paramToken,
						context.bareAuthParam ?? bareAuthParamSupported(site.wcpos_version)
					)
				);
			}
		}
		if (
			(!queryAuth || policy.auth === 'echo') &&
			(overwriteAuth || !headers.has('Authorization'))
		) {
			headers.set('Authorization', `Bearer ${token}`);
		}
		// A refreshed credential replaces the OTHER channel too: the server reads the header
		// first, so a stale header beside a fresh query token would 401 the retry (and the
		// reverse leaves a stale token in URL logs). The echo probe deliberately sends both.
		if (context.refreshedAccessToken !== undefined && policy.auth !== 'echo') {
			if (queryAuth) headers.delete('Authorization');
			else url.searchParams.delete('authorization');
		}
	}
	// wcpos=1 is the marker twin that survives header-stripping proxies (B7, wcpos-infra#72).
	if (policy.markerParam) setParam('wcpos', '1');
	if (clientSignals && sendsProtocolQueryTwins(client.platform, site.use_protocol_headers)) {
		setParam(PROTOCOL_QUERY_PARAM, String(SYNC_PROTOCOL_VERSION));
		setParam(CLIENT_QUERY_PARAM, clientSignal);
	}
	if (policy.scope === 'fixture') {
		setParam('store_id', '1');
		if (policy.auth === 'echo') headers.set('X-WCPOS-Store', '1');
	} else if (policy.scope === 'sync') {
		const scope = normalizeStoreScope(context.storeId);
		if (scope !== null) {
			headers.set('X-WCPOS-Store', scope);
			// Strip-proof twin: the server honours it only if NO header arrived (free#1646, B6).
			url.searchParams.set('store_id', scope);
		} else {
			// An unscoped engine must remove stale caller scope from BOTH channels.
			headers.delete('X-WCPOS-Store');
			url.searchParams.delete('store_id');
		}
	} else if (
		policy.scope === 'rest' &&
		context.storeId !== undefined &&
		context.storeId !== null &&
		context.storeId !== 0
	) {
		setParam('store_id', String(context.storeId));
	}
	return { url: url.toString(), headers };
}
