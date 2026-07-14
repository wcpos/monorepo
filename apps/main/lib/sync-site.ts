/**
 * The ONE place the engine's sync base URL is derived (ADR 0023 increment 1b).
 *
 * For now the engine talks to the site's `wc-rxdb-sync/v1` root. The flip to
 * `wcpos/v1/sync` at server port increment 3 is a one-line constant change here
 * — every caller derives its base URL through this function.
 */

/** @todo increment-3 — flip to `wcpos/v1/sync` when the server port lands. */
export const SYNC_NAMESPACE = 'wc-rxdb-sync/v1';

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
