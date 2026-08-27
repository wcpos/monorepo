/**
 * Sending this value is the client's claim that it tolerates the 1.11.0 boundary
 * wire shapes; the server gates the sync surface on it (wcpos/woocommerce-pos#1752).
 */
export const SYNC_PROTOCOL_VERSION = 2;

export const PROTOCOL_HEADER = 'X-WCPOS-Protocol';
export const CLIENT_HEADER = 'X-WCPOS-Client';
export const PROTOCOL_QUERY_PARAM = 'wcpos_protocol';
export const CLIENT_QUERY_PARAM = 'wcpos_client';

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
