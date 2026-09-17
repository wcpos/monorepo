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

export type RequestPurpose = 'sync' | 'rest' | 'cashier' | 'http';
export interface PreambleSite {
	wp_api_url?: string;
	use_rest_route_param?: boolean;
	use_jwt_as_param?: boolean;
	use_protocol_headers?: boolean;
	wcpos_version?: string;
}
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

function normalizeStoreScope(storeId: number | string | null | undefined): string | null {
	if (storeId === null || storeId === undefined) return null;
	if (typeof storeId === 'number') {
		return Number.isFinite(storeId) && storeId > 0 ? String(storeId) : null;
	}
	const trimmed = storeId.trim();
	if (trimmed === '' || trimmed === '0') return null;
	return trimmed;
}

/** Prepare only the wire preamble; callers own credentials, endpoints and response policy. */
export function buildRequestPreamble(
	context: RequestPreambleContext,
	request: PreambleRequest
): PreparedRequest {
	const { purpose, site = {}, client } = context;
	const headers = new Headers(request.headers);
	const sync = purpose === 'sync';
	const clientSignal = formatClientSignal(client.platform, client.version);
	if (sync || (request.method?.toLowerCase() !== 'head' && request.wcposHeaders !== false)) {
		headers.set('X-WCPOS', '1');
		if (sendsProtocolHeaders(client.platform, site.use_protocol_headers)) {
			headers.set(PROTOCOL_HEADER, String(SYNC_PROTOCOL_VERSION));
			headers.set(CLIENT_HEADER, clientSignal);
		}
		for (const [name, value] of Object.entries(client.userAgentHeader)) {
			headers.set(name, value);
		}
	}
	if (purpose === 'http') return { url: request.url, headers };

	const root = context.wpJsonRoot ?? deriveSyntheticPathRoot(site.wp_api_url ?? '');
	const url = new URL(
		resolveRestTransport(site) === 'query' ? toRestRouteUrl(request.url, root) : request.url
	);
	const setParam = (name: string, value: string) => {
		if (sync || !url.searchParams.has(name)) url.searchParams.set(name, value);
	};
	const token = context.refreshedAccessToken ?? context.accessToken;
	if (token || !sync) {
		const replace = sync || context.refreshedAccessToken !== undefined;
		if (site.use_jwt_as_param) {
			if (replace || !url.searchParams.has('authorization')) {
				url.searchParams.set(
					'authorization',
					formatAuthorizationParam(
						token!,
						context.bareAuthParam ?? bareAuthParamSupported(site.wcpos_version)
					)
				);
			}
		} else if (replace || !headers.has('Authorization')) {
			headers.set('Authorization', `Bearer ${token}`);
		}
	}
	if (sync || purpose === 'cashier') setParam('wcpos', '1');
	if (sendsProtocolQueryTwins(client.platform, site.use_protocol_headers)) {
		setParam(PROTOCOL_QUERY_PARAM, String(SYNC_PROTOCOL_VERSION));
		setParam(CLIENT_QUERY_PARAM, clientSignal);
	}
	if (sync) {
		const scope = normalizeStoreScope(context.storeId);
		if (scope !== null) {
			headers.set('X-WCPOS-Store', scope);
			url.searchParams.set('store_id', scope);
		} else {
			headers.delete('X-WCPOS-Store');
			url.searchParams.delete('store_id');
		}
	} else if (
		purpose === 'rest' &&
		context.storeId !== undefined &&
		context.storeId !== null &&
		context.storeId !== 0
	) {
		setParam('store_id', String(context.storeId));
	}
	return { url: url.toString(), headers };
}
