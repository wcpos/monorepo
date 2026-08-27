/**
 * Sending this value is the client's claim that it tolerates the 1.11.0 boundary
 * wire shapes; the server gates the sync surface on it (wcpos/woocommerce-pos#1752).
 */
export const SYNC_PROTOCOL_VERSION = 2;

export const PROTOCOL_HEADER = 'X-WCPOS-Protocol';
export const CLIENT_HEADER = 'X-WCPOS-Client';
export const PROTOCOL_QUERY_PARAM = 'wcpos_protocol';
export const CLIENT_QUERY_PARAM = 'wcpos_client';

export interface EchoCorsCapability {
	headers?: Record<string, unknown> | null;
	cors?: { reflects_request_headers?: unknown } | null;
}

/** Every named header appears as a key of the echo `headers` map — the server
 * builds that map from its own CORS allow-list floor, so key presence proves
 * floor membership. Null-safe: malformed input is evidence of nothing. */
function echoFloorHas(echo: EchoCorsCapability | null | undefined, names: string[]): boolean {
	const headers = echo?.headers;
	if (typeof headers !== 'object' || headers === null) {
		return false;
	}
	return names.every((name) => Object.prototype.hasOwnProperty.call(headers, name.toLowerCase()));
}

/**
 * Whether the echo proves the protocol signal headers are safe at CORS
 * preflight: both names are in the server's allow-list floor, or the server
 * reflects announced `x-wcpos-*` names (`cors.reflects_request_headers`).
 * Any real server that reflects also carries both of THESE names in its
 * floor, so here the reflection branch corroborates rather than decides.
 *
 * Unknown, missing, or partial evidence returns false and keeps the query
 * twins — the same conservative default as `bareAuthParamSupported` (which
 * derives from the server version; this derives from the echo — the
 * parallel is the conservatism, not the mechanism).
 *
 * Standing pattern for the NEXT `X-WCPOS-*` request header on web: add a
 * sibling predicate here naming its header constants, thread the verdict
 * through a per-site flag (sites schema), and gate every send site with the
 * `sendsProtocolHeaders` / `sendsProtocolQueryTwins` pair below. A future
 * header that is NOT in the frozen floor cannot lean on `echoFloorHas`, and
 * the plugin documents that `reflects_request_headers` proves the SERVER
 * reflects — not that this store's preflights reach PHP — so that header
 * must confirm the path with one throwaway cross-origin request carrying it
 * before trusting reflection alone.
 */
export function protocolHeadersSupported(echo: EchoCorsCapability | null | undefined): boolean {
	return (
		echoFloorHas(echo, [PROTOCOL_HEADER, CLIENT_HEADER]) ||
		echo?.cors?.reflects_request_headers === true
	);
}

/** Native always sends the signal headers (no CORS preflight exists there);
 * web sends them only with a proven per-site verdict. */
export function sendsProtocolHeaders(
	platform: string,
	useProtocolHeaders: boolean | undefined
): boolean {
	return platform !== 'web' || useProtocolHeaders === true;
}

/**
 * Native keeps the query twins beside the headers (the strip-proof channel);
 * web sends them only while headers are unproven. Retiring the twins is a
 * later fleet-telemetry decision — make it by changing this predicate, not
 * by editing the send sites.
 */
export function sendsProtocolQueryTwins(
	platform: string,
	useProtocolHeaders: boolean | undefined
): boolean {
	return platform !== 'web' || useProtocolHeaders !== true;
}

export function formatClientSignal(platform: string, version: string): string {
	return `${platform}/${version.trim() || 'unknown'}`;
}

/**
 * The server's deliberate upgrade-refusal code. Detection keys on the BODY, not
 * the HTTP status: hostile hosts strip response headers and middleboxes rewrite
 * statuses, so the JSON `code` is the only channel that survives every edge
 * (the server pairs it with 426, which stays advisory).
 */
export const UPDATE_REQUIRED_SERVER_CODE = 'wcpos_update_required';

export interface UpdateRequiredDetails {
	minProtocol?: number;
	serverProtocol?: number;
	pluginVersion?: string;
}

/**
 * Recognize the update-required refusal envelope in an error body. Returns the
 * advisory details when the body is the refusal, null for anything else.
 */
export function parseUpdateRequiredBody(body: unknown): UpdateRequiredDetails | null {
	if (typeof body !== 'object' || body === null) return null;
	if ((body as { code?: unknown }).code !== UPDATE_REQUIRED_SERVER_CODE) return null;
	const data = (body as { data?: unknown }).data;
	const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
	const details: UpdateRequiredDetails = {};
	if (typeof record.min_protocol === 'number') details.minProtocol = record.min_protocol;
	if (typeof record.server_protocol === 'number') details.serverProtocol = record.server_protocol;
	if (typeof record.plugin_version === 'string') details.pluginVersion = record.plugin_version;
	return details;
}
