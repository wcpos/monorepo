// Copied from `@wcpos/utils/sync-protocol` so the published engine does not depend
// on @wcpos/utils. update-required.test.ts keeps this identical to the original.

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
