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
