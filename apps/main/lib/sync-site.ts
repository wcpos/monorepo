/**
 * The ONE place the engine's sync base URL is derived (ADR 0023 increment 1b).
 *
 * The engine talks to the production plugin's merged namespace: the sync
 * surface lives at `wcpos/v1/sync/*` on woocommerce-pos@next (server port
 * increments 1–2b), which is what the next-train server (dev-next.wcpos.com)
 * runs. The lab's `wc-rxdb-sync/v1` namespace never ships to production.
 */
export const SYNC_NAMESPACE = 'wcpos/v1/sync';

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
