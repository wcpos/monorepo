/**
 * Construct the app's `RxdbSyncEngine` (ADR 0023 increment 1b).
 *
 * The engine is what `@wcpos/query` serves every fluent read from now. It is
 * bound to a single site; store/cashier are scopes within it. This helper wires
 * the engine's ports to the host:
 *  - `site`     — derived through the single {@link deriveSyncSite} function,
 *  - `storage`  — the app's platform storage (the same one `createStoreDB` uses),
 *  - `fetcher`  — a fetch wrapper carrying the site's JWT the way the wc/v3 http
 *                 client does (Bearer header, or `authorization` param when the
 *                 site is configured for JWT-as-param).
 *
 * NOT LIVE-VERIFIED: this construction typechecks and follows the engine's ports
 * shape, but the store-swap → `scope.switch()` lifecycle and headed auth behavior
 * still need a live pass on the device/web hosts.
 */

import { defaultConfig } from '@wcpos/database/adapters/default';
import { createRxdbSyncEngine } from '@wcpos/sync-engine';
import type { RxdbSyncEngine, StoreScopeIdentity } from '@wcpos/sync-engine';

import { deriveSyncSite } from './sync-site';

export interface CreateAppSyncEngineOptions {
	/** The site's wp-json root (`site.wp_api_url`). */
	wpApiUrl: string;
	/**
	 * The credentials document; the JWT is read FRESH at request time via
	 * getLatest() (never captured — mirrors the http client). Reading here, in
	 * a plain module at fetch time, keeps ref/latest access out of React render
	 * scope (react-compiler forbids it in components).
	 */
	credentials: { getLatest: () => { access_token?: string } };
	/** When the site authenticates via a query param instead of a header. */
	useJwtAsParam?: boolean;
	/** The initial store/cashier scope. */
	scope: StoreScopeIdentity;
	/** Multi-tab hosts (web) pass true for cross-tab change propagation. */
	multiInstance?: boolean;
}

export function createAppSyncEngine(options: CreateAppSyncEngineOptions): RxdbSyncEngine {
	const site = deriveSyncSite(options.wpApiUrl);

	const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
		const token = options.credentials.getLatest().access_token;
		const headers = new Headers(init?.headers ?? {});
		let finalUrl = url;
		if (token) {
			if (options.useJwtAsParam) {
				const parsed = new URL(url);
				parsed.searchParams.set('authorization', `Bearer ${token}`);
				finalUrl = parsed.toString();
			} else {
				headers.set('Authorization', `Bearer ${token}`);
			}
		}
		return globalThis.fetch(finalUrl, { ...init, headers });
	};

	return createRxdbSyncEngine(
		{
			site,
			storage: defaultConfig.storage,
			fetcher,
			multiInstance: options.multiInstance ?? false,
		},
		options.scope
	);
}
