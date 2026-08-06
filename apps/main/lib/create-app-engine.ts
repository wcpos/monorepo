/**
 * Construct the app's `RxdbSyncEngine` (ADR 0023 increment 1b).
 *
 * The engine serves core's reads through `@wcpos/query`'s adapter. It is bound
 * to a single site; store/cashier are scopes within it. This helper wires
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
import { forceFreeDatabaseRegistration } from '@wcpos/database/plugins/rx-database-registry';
import { markStorageTerminallyFailed } from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { composeObservers, scopeDatabaseName, type SyncEvent } from '@wcpos/sync-core';
import { createRxdbSyncEngine } from '@wcpos/sync-engine';
import type { RxdbSyncEngine, StoreScopeIdentity } from '@wcpos/sync-engine';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';
import { Platform } from '@wcpos/utils/platform';
import { lastUserActivityMs, onUserActivity } from '@wcpos/utils/user-activity';

import { getEngineConnectivity } from './connectivity';
import { createEngineFetcher, fetchWooQueryTotal } from './engine-fetcher';
import { appMetricsObserver } from './metrics';
import { createSyncLogObserver } from './sync-log-observer';
import { deriveSyncSite } from './sync-site';
import { markSyncStatusStale, syncStatusObserver } from './sync-status';
import { electWriteLeader } from './web-write-leader';

const engineLogger = getLogger(['wcpos', 'sync', 'engine']);
const isWeb = Platform.isWeb;
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
	/**
	 * Refresh an expired access token after an unauthorized response. The driving
	 * request's arc id is passed so the refresh layer's "Session renewed
	 * automatically" breadcrumb chains to the absorbed 401 attempt (#899).
	 */
	refreshAuth?: (context?: { operationId?: string }) => Promise<string | null>;
	/** The initial store/cashier scope. */
	scope: StoreScopeIdentity;
	/** Non-web RxDB override. Web selects this from Web Locks support. */
	multiInstance?: boolean;
}

// One engine per scope, cached at module scope. The engine's factory opens an
// RxDatabase keyed by scope, so constructing a second engine in the same runtime
// for the SAME scope collides on the already-open database and its scope never
// becomes ready — which is exactly what happens when a boot-time remount of the
// engine-owning subtree (a compat-gate toggle, a Stack.Protected guard flip during
// hydration) runs the construction twice. Caching by scope makes construction
// idempotent: the same scope returns the identical live engine no matter how many
// times React re-invokes the factory. Same-site scope changes reuse the live engine;
// cross-site changes dispose it. Reopening a recently-used scope waits for that
// scope's close to settle.
type MutableFetcherOptions = Pick<
	CreateAppSyncEngineOptions,
	'credentials' | 'refreshAuth' | 'useJwtAsParam'
>;
type WriteLeaderState = { current: ReturnType<typeof electWriteLeader> };

type CachedEngine = {
	key: string;
	site: string;
	databaseName: string;
	/** Every scope database this engine opened (same-site switches retain the
	 * prior scope's database) — a timed-out disposal must terminally fail ALL
	 * of them, not just the last active one. */
	databaseNames: Set<string>;
	engine: RxdbSyncEngine;
	fetcherOptions: MutableFetcherOptions;
	/** Shared with the fetcher so a response can prove it belongs to the active scope activation. */
	clockSkew: { generation: number; evaluated: boolean };
	writeLeader?: WriteLeaderState;
};

let cachedEngine: CachedEngine | null = null;
const pendingDisposals = new Map<string, Promise<void>>();

function moveWriteLeader(entry: CachedEngine, databaseName: string): void {
	if (!entry.writeLeader) return;
	const previous = entry.writeLeader.current;
	entry.writeLeader.current = electWriteLeader(`wcpos-write-leader:${databaseName}`);
	previous.dispose();
}

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

function scopeCacheKey(scope: StoreScopeIdentity): string {
	return JSON.stringify([
		canonicalSite(scope.site),
		canonicalScopeComponent(scope.storeId),
		canonicalScopeComponent(scope.cashierId),
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
			// The engine retains every scope database it opened across same-site
			// switches; a wedged close can be in flight on ANY of them, so all must
			// be terminally failed before the barrier releases successors.
			for (const databaseName of entry.databaseNames) {
				markStorageTerminallyFailed(
					databaseName,
					`Engine disposal exceeded ${ENGINE_DISPOSAL_DEADLINE_MS}ms`
				);
			}
			// A close wedged before rxdb's onClosed ran leaves the database name
			// registered, so releasing the barrier alone would fail the successor's
			// open with rxdb DB8 ("already open"). Freeing the registration is safe:
			// every predecessor storage instance was terminally failed above, before
			// the successor can exist.
			for (const databaseName of entry.databaseNames) {
				forceFreeDatabaseRegistration(databaseName);
			}
			engineLogger.error('ENGINE DISPOSAL TIMED OUT; force-releasing the database-open barrier', {
				context: {
					errorCode: ERROR_CODES.DISPOSAL_TIMEOUT,
					scopeKey: entry.key,
					databaseNames: [...entry.databaseNames],
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
		entry.writeLeader?.current.dispose();
		if (pendingDisposals.get(entry.key) === bounded) {
			pendingDisposals.delete(entry.key);
		}
	});
}

/**
 * Awaited scope transition for the store-switch flow (issue #876). Called by
 * the app-state layer (via the core engine-scope port) AFTER the new store's
 * session hydrated and BEFORE the session is committed: a rejection here
 * aborts the switch with durable state untouched. Cache identity is committed
 * only on success, so there is nothing to revert and the fetcher auth options
 * are never swapped early (renders refresh those on every cache hit).
 *
 * Cross-site sessions and sessions without a full scope identity resolve as
 * no-ops — engine creation/disposal for those is owned by the render path in
 * createAppSyncEngine. Relies on the AppStack invariant that the engine's
 * scope.site IS the site's wp_api_url.
 */
export async function switchAppEngineScope(session: {
	site?: { wp_api_url?: string } | null;
	wpCredentials?: { id?: number | string } | null;
	store?: { id?: number | string } | null;
}): Promise<void> {
	const entry = cachedEngine;
	if (!entry) return;
	const site = session.site?.wp_api_url;
	const storeId = session.store?.id;
	const cashierId = session.wpCredentials?.id;
	if (!site || storeId == null || cashierId == null) return;
	if (canonicalSite(site) !== entry.site) return;
	const scope: StoreScopeIdentity = { site, storeId, cashierId };
	const targetKey = scopeCacheKey(scope);
	if (entry.key === targetKey) return;

	// Record the target scope database BEFORE awaiting, matching the render
	// path's superset semantics: a cross-site disposal racing this switch must
	// terminally fail the database the switch may be opening, and a name
	// recorded only on success escapes the deadline's mark/free loops exactly
	// when the switch itself is what wedged. Marking a database the engine
	// never opened is a no-op, so the early add is safe on rejection too.
	entry.databaseNames.add(scopeDatabaseName(scope));

	await entry.engine.scope.switch(scope);

	entry.key = targetKey;
	entry.databaseName = scopeDatabaseName(scope);
	moveWriteLeader(entry, entry.databaseName);
	entry.clockSkew.generation += 1;
	entry.clockSkew.evaluated = false;
}

export function createAppSyncEngine(options: CreateAppSyncEngineOptions): RxdbSyncEngine {
	const cacheKey = scopeCacheKey(options.scope);
	const siteKey = canonicalSite(options.scope.site);
	if (cachedEngine && cachedEngine.key === cacheKey) {
		cachedEngine.fetcherOptions.credentials = options.credentials;
		cachedEngine.fetcherOptions.refreshAuth = options.refreshAuth;
		cachedEngine.fetcherOptions.useJwtAsParam = options.useJwtAsParam;
		return cachedEngine.engine;
	}
	if (cachedEngine && cachedEngine.site === siteKey) {
		// Same-site scope change arriving via render (e.g. a cashier swap without
		// the store-switch flow). The awaited path is switchAppEngineScope below;
		// render cannot await, so this branch fires the transition detached and
		// reverts the cache identity — INCLUDING the fetcher auth options, which
		// must not keep authenticating as the new identity when the engine never
		// left the old scope — if it rejects.
		const entry = cachedEngine;
		const previousKey = entry.key;
		const previousDatabaseName = entry.databaseName;
		const previousFetcherOptions: MutableFetcherOptions = { ...entry.fetcherOptions };
		const previousClockSkewEvaluated = entry.clockSkew.evaluated;
		const switching = entry.engine.scope.switch(options.scope);
		entry.key = cacheKey;
		entry.databaseName = scopeDatabaseName(options.scope);
		entry.databaseNames.add(entry.databaseName);
		entry.fetcherOptions.credentials = options.credentials;
		entry.fetcherOptions.refreshAuth = options.refreshAuth;
		entry.fetcherOptions.useJwtAsParam = options.useJwtAsParam;
		entry.clockSkew.generation += 1;
		entry.clockSkew.evaluated = false;
		void switching.then(
			() => {
				if (cachedEngine === entry && entry.key === cacheKey) {
					moveWriteLeader(entry, entry.databaseName);
				}
			},
			(error) => {
				engineLogger.error('ENGINE SCOPE SWITCH FAILED', {
					context: {
						errorCode: ERROR_CODES.SCOPE_SWITCH_FAILED,
						scopeKey: cacheKey,
						error: error instanceof Error ? error.message : String(error),
					},
				});
				if (cachedEngine === entry && entry.key === cacheKey) {
					entry.key = previousKey;
					entry.databaseName = previousDatabaseName;
					entry.fetcherOptions.credentials = previousFetcherOptions.credentials;
					entry.fetcherOptions.refreshAuth = previousFetcherOptions.refreshAuth;
					entry.fetcherOptions.useJwtAsParam = previousFetcherOptions.useJwtAsParam;
					entry.clockSkew.generation += 1;
					entry.clockSkew.evaluated = previousClockSkewEvaluated;
				}
			}
		);
		return entry.engine;
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
	const clockSkew = { generation: 0, evaluated: false };
	const webLocksAvailable =
		isWeb && typeof navigator !== 'undefined' && navigator.locks !== undefined;
	const writeLeader = isWeb
		? { current: electWriteLeader(`wcpos-write-leader:${scopeDatabaseName(options.scope)}`) }
		: undefined;

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

	const fetcher = createEngineFetcher({
		auth: fetcherOptions,
		clockSkew,
		emitTransport,
	});

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
			queryTotal: {
				fetchWooQueryTotal: (input) => fetchWooQueryTotal(input, fetcher, site.wpJsonRoot),
			},
			connectivity: getEngineConnectivity,
			lastUserActivityMs,
			onUserActivity,
			diagnostics: composeObservers(appMetricsObserver, guardedDiagnostics),
			multiInstance: isWeb ? webLocksAvailable : (options.multiInstance ?? false),
			...(writeLeader ? { writePlaneOwner: () => writeLeader.current.isLeader() } : {}),
			...(databaseOpenBarrier ? { databaseOpenBarrier } : {}),
		},
		options.scope
	);
	engineSelf = engine;
	cachedEngine = {
		key: cacheKey,
		site: siteKey,
		databaseName: scopeDatabaseName(options.scope),
		databaseNames: new Set([scopeDatabaseName(options.scope)]),
		engine,
		fetcherOptions,
		clockSkew,
		...(writeLeader ? { writeLeader } : {}),
	};
	if (isWeb && !webLocksAvailable) {
		composeObservers(
			appMetricsObserver,
			guardedDiagnostics
		)({
			type: 'engine.write-leader.degraded',
			level: 'warn',
			message: 'Web Locks unavailable; multi-tab sync is disabled for this browser',
		});
	}
	return engine;
}
