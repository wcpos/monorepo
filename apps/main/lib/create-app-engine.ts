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

// One engine per scope, cached at module scope. The engine's factory opens an
// RxDatabase keyed by scope (multiInstance:false), so constructing a second engine
// for the SAME scope collides on the already-open database and its scope never
// becomes ready — which is exactly what happens when a boot-time remount of the
// engine-owning subtree (a compat-gate toggle, a Stack.Protected guard flip during
// hydration) runs the construction twice. Caching by scope makes construction
// idempotent: the same scope returns the identical live engine no matter how many
// times React re-invokes the factory, and a genuine scope change disposes the prior
// engine (releasing its database) before opening the next.
let cachedEngine: { key: string; engine: RxdbSyncEngine } | null = null;

function scopeCacheKey(options: CreateAppSyncEngineOptions): string {
	return [
		options.wpApiUrl,
		options.scope.storeId,
		options.scope.cashierId,
		options.multiInstance ?? false,
	].join('::');
}

export function createAppSyncEngine(options: CreateAppSyncEngineOptions): RxdbSyncEngine {
	const cacheKey = scopeCacheKey(options);
	if (cachedEngine && cachedEngine.key === cacheKey) {
		return cachedEngine.engine;
	}
	// Scope changed (or first construction): release the previous engine's database
	// before opening the next so the new scope can't collide with a lingering one.
	if (cachedEngine) {
		const previous = cachedEngine.engine;
		cachedEngine = null;
		void previous.dispose().catch(() => undefined);
	}

	const site = deriveSyncSite(options.wpApiUrl);

	const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
		const token = options.credentials.getLatest().access_token;
		const headers = new Headers(init?.headers ?? {});
		// The wcpos/v1 namespace only constructs for POS-flagged requests
		// (woocommerce_pos_request()) — without this header every sync route
		// answers rest_no_route and the engine stays degraded-empty.
		headers.set('X-WCPOS', '1');
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

	const engine = createRxdbSyncEngine(
		{
			site,
			storage: defaultConfig.storage,
			fetcher,
			multiInstance: options.multiInstance ?? false,
		},
		options.scope
	);
	cachedEngine = { key: cacheKey, engine };
	return engine;
}
