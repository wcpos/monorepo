/**
 * The ONE place the engine's sync base URL is derived (ADR 0023 increment 1b).
 *
 * The sync surface is the successor client/server contract and owns its own
 * REST version: `wcpos/v2/*` on woocommerce-pos@next — the version replaced
 * the old `sync/` prefix (`wcpos/v2/orders/pull`, never
 * `wcpos/v1/sync/orders/pull`). The frozen `wcpos/v1` namespace is the old
 * client's contract; client and server ship lockstep (cold-resync cutover),
 * so there is no dual-target window. The lab's `wc-rxdb-sync/v1` namespace
 * never ships to production.
 */
export const SYNC_NAMESPACE = 'wcpos/v2';

export interface SyncSite {
	syncBaseUrl: string;
	wpJsonRoot: string;
}

/**
 * Derive the engine's `{ syncBaseUrl, wpJsonRoot }` from a site's wp-json root
 * (`site.wp_api_url`, e.g. `https://example.com/wp-json/`).
 */
export function deriveSyncSite(wpApiUrl: string): SyncSite {
	const wpJsonRoot = wpApiUrl.endsWith('/') ? wpApiUrl : `${wpApiUrl}/`;
	return {
		syncBaseUrl: `${wpJsonRoot}${SYNC_NAMESPACE}`,
		wpJsonRoot,
	};
}
