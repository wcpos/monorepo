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
	/** Refresh an expired access token after an unauthorized response. */
	refreshAuth?: () => Promise<string | null>;
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
// engine. Reopening a recently-used scope waits for that scope's close to settle.
type MutableFetcherOptions = Pick<
	CreateAppSyncEngineOptions,
	'credentials' | 'refreshAuth' | 'useJwtAsParam'
>;

type CachedEngine = {
	key: string;
	engine: RxdbSyncEngine;
	fetcherOptions: MutableFetcherOptions;
};

let cachedEngine: CachedEngine | null = null;
const pendingDisposals = new Map<string, Promise<void>>();

function canonicalSite(site: string): string {
	let canonical = site.trim().toLowerCase();
	if (canonical.startsWith('https://')) canonical = canonical.slice('https://'.length);
	else if (canonical.startsWith('http://')) canonical = canonical.slice('http://'.length);
	while (canonical.endsWith('/')) canonical = canonical.slice(0, -1);
	return canonical;
}

function canonicalScopeComponent(value: number | string): string {
	return typeof value === 'number' ? String(value) : value.trim().toLowerCase();
}

function scopeCacheKey(options: CreateAppSyncEngineOptions): string {
	return JSON.stringify([
		canonicalSite(options.scope.site),
		canonicalScopeComponent(options.scope.storeId),
		canonicalScopeComponent(options.scope.cashierId),
	]);
}

function disposeCachedEngine(entry: CachedEngine): void {
	const priorDisposal = pendingDisposals.get(entry.key);
	let disposal: Promise<void>;
	try {
		disposal = priorDisposal
			? priorDisposal.then(() => entry.engine.dispose())
			: entry.engine.dispose();
	} catch {
		disposal = Promise.resolve();
	}
	const settledDisposal = disposal.catch(() => undefined);
	pendingDisposals.set(entry.key, settledDisposal);
	void settledDisposal.then(() => {
		if (pendingDisposals.get(entry.key) === settledDisposal) {
			pendingDisposals.delete(entry.key);
		}
	});
}

export function createAppSyncEngine(options: CreateAppSyncEngineOptions): RxdbSyncEngine {
	const cacheKey = scopeCacheKey(options);
	if (cachedEngine && cachedEngine.key === cacheKey) {
		cachedEngine.fetcherOptions.credentials = options.credentials;
		cachedEngine.fetcherOptions.refreshAuth = options.refreshAuth;
		cachedEngine.fetcherOptions.useJwtAsParam = options.useJwtAsParam;
		return cachedEngine.engine;
	}
	// A genuine scope change has a different database name, so its construction can
	// overlap the old scope's close. A later return to the old scope receives the
	// disposal promise below as its engine-level database-open barrier.
	if (cachedEngine) {
		const previous = cachedEngine;
		cachedEngine = null;
		disposeCachedEngine(previous);
	}

	const site = deriveSyncSite(options.wpApiUrl);
	const databaseOpenBarrier = pendingDisposals.get(cacheKey);
	const fetcherOptions: MutableFetcherOptions = {
		credentials: options.credentials,
		refreshAuth: options.refreshAuth,
		useJwtAsParam: options.useJwtAsParam,
	};

	const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
		let tokenUsed: string | undefined;
		const fetchWithLatestToken = async (): Promise<Response> => {
			const token = fetcherOptions.credentials.getLatest().access_token;
			tokenUsed = token;
			const headers = new Headers(init?.headers ?? {});
			// The WCPOS REST namespaces only construct for POS-flagged requests
			// (woocommerce_pos_request()) — without this header every sync route
			// answers rest_no_route and the engine stays degraded-empty.
			headers.set('X-WCPOS', '1');
			let finalUrl = url;
			if (token) {
				if (fetcherOptions.useJwtAsParam) {
					const parsed = new URL(url);
					parsed.searchParams.set('authorization', `Bearer ${token}`);
					finalUrl = parsed.toString();
				} else {
					headers.set('Authorization', `Bearer ${token}`);
				}
			}
			return globalThis.fetch(finalUrl, { ...init, headers });
		};

		const response = await fetchWithLatestToken();
		const requestPath = url.split(/[?#]/, 1)[0]?.replace(/\/+$/, '');
		const isRefreshRequest = requestPath?.endsWith('/auth/refresh') ?? false;
		if (response.status === 401 && fetcherOptions.refreshAuth && !isRefreshRequest) {
			// A concurrent request may have already refreshed the JWT while this one was in
			// flight. If the current token differs from the one this request used, retry with it
			// before starting another refresh — avoids redundant refreshes on staggered 401s.
			const currentToken = fetcherOptions.credentials.getLatest().access_token;
			if (currentToken && currentToken !== tokenUsed) {
				return fetchWithLatestToken();
			}
			const refreshedToken = await fetcherOptions.refreshAuth();
			if (refreshedToken) {
				return fetchWithLatestToken();
			}
		}

		return response;
	};

	const engine = createRxdbSyncEngine(
		{
			site,
			storage: defaultConfig.storage,
			fetcher,
			multiInstance: options.multiInstance ?? false,
			...(databaseOpenBarrier ? { databaseOpenBarrier } : {}),
		},
		options.scope
	);
	cachedEngine = { key: cacheKey, engine, fetcherOptions };
	return engine;
}
