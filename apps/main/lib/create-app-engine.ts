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
import { markStorageTerminallyFailed } from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { composeObservers, scopeDatabaseName, type SyncEvent } from '@wcpos/sync-core';
import { createRxdbSyncEngine } from '@wcpos/sync-engine';
import type { QueryTotalWooRequest, RxdbSyncEngine, StoreScopeIdentity } from '@wcpos/sync-engine';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';
import { lastUserActivityMs } from '@wcpos/utils/user-activity';

import { getEngineConnectivity } from './connectivity';
import {
	appMetricsObserver,
	collectionFromSyncUrl,
	getMetricsEpoch,
	recordServerLoad,
	recordTransport,
} from './metrics';
import { createSyncLogObserver } from './sync-log-observer';
import { deriveSyncSite } from './sync-site';
import { markSyncStatusStale, syncStatusObserver } from './sync-status';

const engineLogger = getLogger(['wcpos', 'sync', 'engine']);
// Below the successor's 15s readiness-watchdog first report; orders of magnitude above a healthy close.
const ENGINE_DISPOSAL_DEADLINE_MS = 10_000;

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
	databaseName: string;
	engine: RxdbSyncEngine;
	fetcherOptions: MutableFetcherOptions;
};

let cachedEngine: CachedEngine | null = null;
const pendingDisposals = new Map<string, Promise<void>>();

const CENSUS_WC_ROUTES: Record<string, string | null> = {
	orders: 'wc/v3/orders',
	products: 'wc/v3/products',
	// Woo exposes variations only beneath a specific product, so there is no
	// honest cheap collection-wide census request. The engine leaves it unknown.
	variations: null,
	customers: 'wcpos/v2/customers',
	// Raw wc/v3/taxes requires `manage_woocommerce`, which cashier-tier POS users
	// (e.g. the demo role) don't have — every census probe 403s and spams the error
	// log. The POS proxy serves the same rows + X-WP-Total under the POS grant.
	taxRates: 'wcpos/v2/taxes',
	categories: 'wc/v3/products/categories',
	brands: 'wc/v3/products/brands',
	tags: 'wc/v3/products/tags',
	coupons: 'wc/v3/coupons',
};

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
	const settled = disposal.catch(() => undefined);
	const bounded = new Promise<void>((resolve) => {
		const timer = setTimeout(() => {
			markStorageTerminallyFailed(
				entry.databaseName,
				`Engine disposal exceeded ${ENGINE_DISPOSAL_DEADLINE_MS}ms`
			);
			engineLogger.error('ENGINE DISPOSAL TIMED OUT; force-releasing the database-open barrier', {
				context: {
					errorCode: ERROR_CODES.DISPOSAL_TIMEOUT,
					scopeKey: entry.key,
					databaseName: entry.databaseName,
				},
			});
			resolve();
		}, ENGINE_DISPOSAL_DEADLINE_MS);
		void settled.then(() => {
			// A late deadline could mark storage instances already opened by the successor.
			clearTimeout(timer);
			resolve();
		});
	});
	pendingDisposals.set(entry.key, bounded);
	void bounded.then(() => {
		if (pendingDisposals.get(entry.key) === bounded) {
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
	const supersedesCachedEngine = cachedEngine !== null;
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

	// Host-side transport events must reach BOTH sinks. The engine's own diagnostics
	// port is composed of the metrics collector and the guarded log observer, but
	// this fetcher lives OUTSIDE the engine, so an event sent only to
	// appMetricsObserver never reaches the log at all — it would land in the charts
	// and vanish from the ledger. Declared before `guardedDiagnostics` in source
	// order but only ever CALLED from the fetcher, which runs long after this
	// function returns.
	//
	// Telemetry is best-effort and must NEVER throw into the caller. That is a
	// spec-level invariant, and the engine enforces it for its own fan-out by
	// isolating every sink in composeObservers. This call site sits outside the
	// engine and so has to repeat the discipline itself: it is invoked from the
	// fetcher's SUCCESS path, where an escaping exception would propagate out of
	// fetcher() and present to the caller as a failed HTTP request — silently
	// converting a request that actually succeeded into a failure. Each sink is
	// isolated separately so a broken one cannot starve the other.
	const emitTransport = (event: SyncEvent, durable = true): void => {
		try {
			appMetricsObserver(event);
		} catch (error) {
			console.error('Metrics observer threw on a transport event', error);
		}
		if (!durable) return;
		try {
			guardedDiagnostics(event);
		} catch (error) {
			console.error('Log observer threw on a transport event', error);
		}
	};

	const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
		let tokenUsed: string | undefined;
		const method = (init?.method ?? 'GET').toUpperCase();
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
			const path = new URL(finalUrl).pathname;
			const startedAtMs = Date.now();
			// Captured at start: a completion after a store switch (epoch bump) is the
			// outgoing store's traffic and must not land in the new store's buckets.
			const epochAtStart = getMetricsEpoch();
			let response: Response;
			try {
				response = await globalThis.fetch(finalUrl, { ...init, headers });
			} catch (error) {
				const atMs = Date.now();
				const durationMs = atMs - startedAtMs;
				emitTransport(
					{
						type: 'transport.request',
						level: 'warn',
						collection: collectionFromSyncUrl(finalUrl),
						fields: {
							durationMs,
							bytes: 0,
							status: 0,
							method,
							path,
						},
					},
					(error as { name?: unknown } | null)?.name !== 'AbortError'
				);
				recordTransport({ atMs, durationMs, bytes: 0, ok: false, epoch: epochAtStart });
				throw error;
			}

			const atMs = Date.now();
			const durationMs = atMs - startedAtMs;
			const contentLengthRaw = Number(response.headers.get('content-length'));
			// A malformed/negative content-length (broken server or proxy) must not
			// poison the hourly byte totals — clamp to a finite non-negative count.
			const bytes =
				Number.isFinite(contentLengthRaw) && contentLengthRaw >= 0 ? contentLengthRaw : 0;
			// 304 is the conditional-GET success path (idle sequence-log polls answer
			// If-None-Match with Not Modified every tick) — Response.ok is false for it,
			// but logging it as a failure would record ~360 phantom errors/hour per idle
			// terminal and corrupt the transport health counters.
			const accepted = response.ok || response.status === 304;
			emitTransport({
				type: 'transport.request',
				level: accepted ? 'info' : 'warn',
				collection: collectionFromSyncUrl(finalUrl),
				fields: {
					durationMs,
					bytes,
					status: response.status,
					method,
					path,
				},
			});
			recordTransport({ atMs, durationMs, bytes, ok: accepted, epoch: epochAtStart });

			const serverLoad = response.headers.get('X-Server-Load');
			if (serverLoad !== null) {
				try {
					const parsed: unknown = JSON.parse(serverLoad);
					if (
						Array.isArray(parsed) &&
						typeof parsed[0] === 'number' &&
						Number.isFinite(parsed[0])
					) {
						recordServerLoad(parsed[0], epochAtStart);
					}
				} catch {
					// Malformed server diagnostics must not affect the sync request.
				}
			}

			return response;
		};

		let response = await fetchWithLatestToken();
		const requestPath = url.split(/[?#]/, 1)[0]?.replace(/\/+$/, '');
		const isRefreshRequest = requestPath?.endsWith('/auth/refresh') ?? false;
		if (response.status === 401 && fetcherOptions.refreshAuth && !isRefreshRequest) {
			// A concurrent request may have already refreshed the JWT while this one was in
			// flight. If the current token differs from the one this request used, retry with it
			// before starting another refresh — avoids redundant refreshes on staggered 401s.
			const currentToken = fetcherOptions.credentials.getLatest().access_token;
			const retryToken =
				currentToken && currentToken !== tokenUsed
					? currentToken
					: await fetcherOptions.refreshAuth();
			if (retryToken) response = await fetchWithLatestToken();
		}
		return response;
	};

	const fetchWooQueryTotal = async (input: {
		request: QueryTotalWooRequest;
		signal?: AbortSignal;
	}): Promise<number | null> => {
		const mappedRoute = CENSUS_WC_ROUTES[input.request.endpoint];
		if (mappedRoute === null) return null;
		const url = new URL(mappedRoute ?? input.request.endpoint, site.wpJsonRoot);
		for (const [key, value] of Object.entries(input.request.params)) {
			url.searchParams.set(key, String(value));
		}
		url.searchParams.set('page', '1');
		url.searchParams.set('per_page', '1');
		const response = await fetcher(
			url.toString(),
			input.signal !== undefined ? { signal: input.signal } : undefined
		);
		if (!response.ok) {
			throw new Error(`Query total request failed: ${response.status}`);
		}
		const rawTotal = response.headers.get(input.request.totalHeader);
		const total = rawTotal === null || rawTotal.trim() === '' ? Number.NaN : Number(rawTotal);
		if (!Number.isSafeInteger(total) || total < 0) {
			throw new Error(`Invalid ${input.request.totalHeader} response header`);
		}
		return total;
	};

	// Per-engine so late events from a superseded engine can be dropped: a scope
	// change disposes the previous engine, but its initial-open chain can settle
	// afterward, and a late `engine.ready-failed` must not be saved into the
	// INCOMING store's health log. Guarded by cache identity rather than a
	// captured database epoch — the engine is constructed during render, before
	// the effect that rebinds the logger database runs, so an epoch captured
	// here could be permanently stale.
	const syncLogObserver = createSyncLogObserver({
		persist: (level, message, context, terminal) => {
			engineLogger[level](message, { context, terminal });
		},
	});

	let engineSelf: RxdbSyncEngine | null = null;
	const guardedDiagnostics = (event: SyncEvent): void => {
		if (engineSelf !== null && cachedEngine?.engine !== engineSelf) return;
		syncLogObserver.observe(event);
		syncStatusObserver(event);
	};

	if (supersedesCachedEngine) {
		// Defer the sync-status wipe instead of doing it now: this construction runs
		// during render, but the outgoing store's persistence bridge flushes its final
		// snapshot on effect cleanup — AFTER this render. An eager reset would make that
		// flush persist an empty snapshot into the outgoing store's doc, destroying its
		// history. Marking stale defers the wipe to the new engine's first observed
		// event, which is always after commit (engine I/O is async). On a genuine store
		// switch the incoming bridge's own reset-before-hydrate clears the flag first, so
		// the lazy reset can never wipe freshly hydrated history.
		markSyncStatusStale();
	}

	const engine = createRxdbSyncEngine(
		{
			site,
			storage: defaultConfig.storage,
			fetcher,
			queryTotal: { fetchWooQueryTotal },
			connectivity: getEngineConnectivity,
			lastUserActivityMs,
			diagnostics: composeObservers(appMetricsObserver, guardedDiagnostics),
			multiInstance: options.multiInstance ?? false,
			...(databaseOpenBarrier ? { databaseOpenBarrier } : {}),
		},
		options.scope
	);
	engineSelf = engine;
	cachedEngine = {
		key: cacheKey,
		databaseName: scopeDatabaseName(options.scope),
		engine,
		fetcherOptions,
	};
	return engine;
}
