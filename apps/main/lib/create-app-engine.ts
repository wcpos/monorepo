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
import { reportNetworkResponse } from '@wcpos/hooks';
import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { composeObservers, scopeDatabaseName, type SyncEvent } from '@wcpos/sync-core';
import {
	createRxdbSyncEngine,
	createWriteOutcomeBridge,
	writeOutcomeChannelName,
} from '@wcpos/sync-engine';
import type {
	RxdbSyncEngine,
	ScopedWriteOutcomeBridge,
	StoreScopeIdentity,
} from '@wcpos/sync-engine';
// Deep import ON PURPOSE: the ui-settings barrel carries the React provider
// graph, which jest-expo's winter runtime refuses to require from this host
// module. The helper file itself is dependency-light (JSON + @wcpos/query).
import { defaultProductBrowseSort } from '@wcpos/core/screens/main/contexts/ui-settings/default-product-browse-sort';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { hostIsVisible, onHostVisibilityChange } from '@wcpos/utils/host-visibility';
import { Platform } from '@wcpos/utils/platform';
import { lastUserActivityMs, onUserActivity } from '@wcpos/utils/user-activity';

import { getEngineConnectivity } from './connectivity';
import { createE2eEngineLedgerObserver } from './e2e-engine-ledger';
import {
	createEngineFetcher,
	type EngineFetcherAuth,
	type EngineFetcherScope,
	fetchWooQueryTotal,
} from './engine-fetcher';
import { platformEngineFetch } from './engine-platform-fetch';
import { appMetricsObserver } from './metrics';
import { createSyncLogObserver } from './sync-log-observer';
import { deriveSyncSite } from './sync-site';
import { markSyncStatusStale, syncStatusObserver } from './sync-status';
import { clearUpdateRequired, reportUpdateRequired } from './update-required-gate';
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
	/**
	 * The stable site document; the plugin version is read fresh via getLatest()
	 * at request time, mirroring credentials. This keeps latest/ref access out of
	 * React render scope and lets version changes apply without recreating the engine.
	 */
	siteDocument?: { getLatest: () => { wcpos_version?: string } };
	/** Query-param auth mode and whether that server accepts a bare token. */
	useJwtAsParam?: boolean;
	useRestRouteParam: boolean;
	bareAuthParam?: boolean;
	useProtocolHeaders?: boolean;
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
	| 'credentials'
	| 'refreshAuth'
	| 'useJwtAsParam'
	| 'bareAuthParam'
	| 'useRestRouteParam'
	| 'useProtocolHeaders'
>;
type WriteLeaderState = {
	current: ReturnType<typeof electWriteLeader> | null;
	onUnavailable: () => void;
};

type CachedEngine = {
	renderKey: string | null;
	site: string;
	allocationKey: string;
	requests: { key: string; options?: MutableFetcherOptions; settled: Promise<unknown> }[];
	/** Every scope database this engine opened (same-site switches retain the
	 * prior scope's database) — a timed-out disposal must terminally fail ALL
	 * of them, not just the last active one. */
	databaseNames: Set<string>;
	engine: RxdbSyncEngine;
	fetcherOptions: MutableFetcherOptions;
	/**
	 * Shared with the fetcher so every sync request carries the till's store
	 * scope (pro#425). Mutated in place — the fetcher holds this exact object
	 * and reads it per attempt, so a scope move retargets in-flight lanes.
	 */
	fetcherScope: EngineFetcherScope;
	/** Shared with the fetcher so a response can prove it belongs to the active scope activation. */
	clockSkew: { generation: number; evaluated: boolean };
	writeLeader?: WriteLeaderState;
	/** Web multi-tab write-outcome feedback (#1209) — re-pointed at the new
	 * scope's channel on every switch, exactly like the write lock. */
	writeOutcomeBridge?: ScopedWriteOutcomeBridge;
};

let cachedEngine: CachedEngine | null = null;
const pendingDisposals = new Map<string, Promise<void>>();

function moveWriteLeader(entry: CachedEngine, databaseName: string): void {
	// The outcome bridge is namespaced by the same scope database as the lock, so
	// it moves on the same beat: a tab left listening on the previous store's
	// channel would hear outcomes for records it no longer holds.
	entry.writeOutcomeBridge?.moveTo(writeOutcomeChannelName(databaseName));
	if (!entry.writeLeader) return;
	const previous = entry.writeLeader.current;
	entry.writeLeader.current = electWriteLeader(`wcpos-write-leader:${databaseName}`, {
		onUnavailable: entry.writeLeader.onUnavailable,
	});
	previous?.dispose();
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

function projectFetcherOptions(options: CreateAppSyncEngineOptions): MutableFetcherOptions {
	return {
		credentials: options.credentials,
		refreshAuth: options.refreshAuth,
		useJwtAsParam: options.useJwtAsParam,
		bareAuthParam: options.bareAuthParam,
		useRestRouteParam: options.useRestRouteParam,
		useProtocolHeaders: options.useProtocolHeaders,
	};
}

async function requestScope(
	entry: CachedEngine,
	scope: StoreScopeIdentity,
	options?: MutableFetcherOptions
): Promise<void> {
	entry.databaseNames.add(scopeDatabaseName(scope));
	// Registered BEFORE the engine is asked: activation can be published synchronously inside
	// scope.switch, and the subscriber must find the request (and its staged auth) already there.
	const request: CachedEngine['requests'][number] = {
		key: scopeCacheKey(scope),
		options,
		settled: Promise.resolve(),
	};
	entry.requests.push(request);
	request.settled = entry.engine.scope.switch(scope);
	try {
		await request.settled;
	} finally {
		const latest = entry.requests.at(-1) === request;
		const index = entry.requests.indexOf(request);
		if (index >= 0) entry.requests.splice(index, 1);
		if (latest) {
			const active = entry.engine.active();
			entry.renderKey = active ? scopeCacheKey(active.identity) : null;
		}
	}
}

function disposeCachedEngine(entry: CachedEngine): void {
	const active = entry.engine.active();
	const disposalKey = active ? scopeCacheKey(active.identity) : entry.allocationKey;
	const disposalKeys = new Set([disposalKey, ...entry.requests.map((request) => request.key)]);
	if (entry.renderKey) disposalKeys.add(entry.renderKey);
	const priorDisposal = [...disposalKeys]
		.map((key) => pendingDisposals.get(key))
		.find((pending) => pending !== undefined);
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
				code: ERROR_CODES.SYNC_UNEXPECTED,
				context: {
					scopeKey: disposalKey,
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
	for (const key of disposalKeys) pendingDisposals.set(key, bounded);
	void bounded.then(() => {
		entry.writeLeader?.current?.dispose();
		entry.writeOutcomeBridge?.close();
		for (const key of disposalKeys) {
			if (pendingDisposals.get(key) === bounded) pendingDisposals.delete(key);
		}
	});
}

/**
 * Awaited scope transition for the store-switch flow (issue #876). Called by
 * the app-state layer (via the core engine-scope port) AFTER the new store's
 * session hydrated and BEFORE the session is committed: a rejection here
 * aborts the switch with durable state untouched. Active scope is published by
 * the activation subscriber, not by this promise settling.
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
	const active = entry.engine.active();
	const key = scopeCacheKey(scope);
	const latest = entry.requests.at(-1);
	if (latest?.key === key) {
		await latest.settled;
		return;
	}
	if (!latest && (active ? scopeCacheKey(active.identity) : entry.allocationKey) === key) return;
	await requestScope(entry, scope);
}

/** Create or reuse the app sync engine for the requested store scope. */
export function createAppSyncEngine(options: CreateAppSyncEngineOptions): RxdbSyncEngine {
	const cacheKey = scopeCacheKey(options.scope);
	const siteKey = canonicalSite(options.scope.site);
	if (cachedEngine && cachedEngine.site === siteKey) {
		const entry = cachedEngine;
		const active = entry.engine.active();
		const activeKey = active ? scopeCacheKey(active.identity) : null;
		const latest = entry.requests.at(-1);
		const pending = entry.requests.filter((request) => request.key === cacheKey).at(-1);
		const projected = projectFetcherOptions(options);
		if (pending) pending.options = projected;
		if (
			activeKey === cacheKey ||
			(activeKey === null && cacheKey === entry.allocationKey && !latest)
		) {
			Object.assign(entry.fetcherOptions, projected);
		}
		// Unchanged render intent stays inert during an awaited switch or initial open.
		// B → C → B still enqueues the return because renderKey has moved to C.
		if (
			latest?.key === cacheKey ||
			entry.renderKey === cacheKey ||
			(!latest && activeKey === cacheKey)
		) {
			return entry.engine;
		}
		entry.renderKey = cacheKey;
		void requestScope(entry, options.scope, projected).catch((error) => {
			engineLogger.error('ENGINE SCOPE SWITCH FAILED', {
				code: ERROR_CODES.SYNC_UNEXPECTED,
				context: {
					scopeKey: cacheKey,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		});
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
	let authExhaustedToken: string | null = null;
	const fetcherOptions: MutableFetcherOptions & Pick<EngineFetcherAuth, 'onAuthExhausted'> = {
		...projectFetcherOptions(options),
		onAuthExhausted: (token) => {
			if (authExhaustedToken === token) return;
			// The latch is this engine's own state and stays unguarded: a superseded
			// engine must still hold its lanes. The TOAST is global, so it takes the
			// same cache-identity guard as guardedDiagnostics — a late 401 from a
			// disposed engine must not tell the cashier to sign in to the store they
			// just switched TO.
			authExhaustedToken = token;
			if (engineSelf !== null && cachedEngine?.engine !== engineSelf) return;
			engineLogger.error(
				'Sync paused: the store rejected the renewed session — sign in again to resume',
				{
					code: ERROR_CODES.SESSION_EXPIRED,
					showToast: true,
				}
			);
		},
	};
	const fetcherScope: EngineFetcherScope = { storeId: options.scope.storeId };
	const clockSkew = { generation: 0, evaluated: false };
	const e2eEngineLedgerObserver = createE2eEngineLedgerObserver();
	const webLocksAvailable =
		isWeb && typeof navigator !== 'undefined' && navigator.locks !== undefined;

	const emitTransport = (event: SyncEvent, durable = true): void => {
		if (event.type === 'transport.request') {
			const status = event.fields?.status;
			if (status !== undefined && status >= 1 && status < 500) {
				reportNetworkResponse(site.wpJsonRoot, event.at);
			}
		}
		try {
			appMetricsObserver(event);
		} catch (error) {
			console.error('Metrics observer threw on a transport event', error);
		}
		e2eEngineLedgerObserver?.(event);
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
		scope: fetcherScope,
		emitTransport,
		wpJsonRoot: site.wpJsonRoot,
		...(platformEngineFetch ? { fetch: platformEngineFetch } : {}),
	});

	// Per-engine so late events from a superseded engine can be dropped: a scope
	// change disposes the previous engine, but its initial-open chain can settle
	// afterward, and a late `engine.ready-failed` must not be saved into the
	// INCOMING store's health log. Guarded by cache identity rather than a
	// captured database epoch — the engine is constructed during render, before
	// the effect that rebinds the logger database runs, so an epoch captured
	// here could be permanently stale.
	const syncLogObserver = createSyncLogObserver({
		persist: (level, message, context, terminal, toast, code) => {
			const options = {
				context,
				terminal,
				...(toast
					? {
							showToast: true,
							toast: {
								// The persisted message is forensic (record id, HTTP code); the
								// snackbar gets the cashier-readable sentence instead.
								title: toast.title,
								...(toast.description !== undefined ? { text2: toast.description } : {}),
							},
						}
					: {}),
			};
			if (level === 'error') {
				engineLogger.error(message, {
					...options,
					code: code ?? ERROR_CODES.SYNC_UNEXPECTED,
				});
			} else {
				engineLogger[level](message, { ...options, ...(code ? { code } : {}) });
			}
		},
	});

	let engineSelf: RxdbSyncEngine | null = null;
	const guardedDiagnostics = (event: SyncEvent): void => {
		if (engineSelf !== null && cachedEngine?.engine !== engineSelf) return;
		syncLogObserver.observe(event);
		syncStatusObserver(event);
	};

	// When Web Locks cannot arbitrate leadership (absent, or a rejected request in
	// a sandboxed/opaque/WebView context) the tab degrades to single-writer so it
	// never becomes a follower that enqueues sales it can never drain. Surface it
	// so a genuinely wedged multi-tab context is visible rather than silent.
	const onWriteLeaderUnavailable = () =>
		composeObservers(
			appMetricsObserver,
			guardedDiagnostics,
			e2eEngineLedgerObserver
		)({
			type: 'engine.write-leader.degraded',
			level: 'warn',
			message:
				'Web Locks unavailable; falling back to single-writer (multi-tab coherence disabled for this browser context)',
		});
	// #1209: web-only, for the same reason the write lock is — a single-window
	// host (native, Electron) has no peer to tell, and its engine events already
	// reach every consumer in-process.
	const writeOutcomeBridge: ScopedWriteOutcomeBridge | undefined = isWeb
		? createWriteOutcomeBridge()
		: undefined;
	writeOutcomeBridge?.moveTo(writeOutcomeChannelName(scopeDatabaseName(options.scope)));
	const writeLeader: WriteLeaderState | undefined = isWeb
		? {
				current: electWriteLeader(`wcpos-write-leader:${scopeDatabaseName(options.scope)}`, {
					onUnavailable: onWriteLeaderUnavailable,
				}),
				onUnavailable: onWriteLeaderUnavailable,
			}
		: undefined;

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

	const hostDefaultProductBrowseSort = defaultProductBrowseSort();
	// A fresh engine re-probes the store, so its construction clears any
	// standing update-required gate for the site (the latch itself lives on the
	// engine instance and died with the previous one).
	clearUpdateRequired(options.scope.site);
	const engine = createRxdbSyncEngine(
		{
			site: {
				...site,
				wcposVersion: () => options.siteDocument?.getLatest().wcpos_version,
			},
			storage: defaultConfig.storage,
			fetcher,
			onUpdateRequired: (details) => {
				reportUpdateRequired(options.scope.site, details);
				// Row + docs page; no toast — the blocking UpdateRequired screen is
				// the cashier-facing surface.
				engineLogger.error('Server refused sync: this app is older than the store requires', {
					code: ERROR_CODES.APP_UPDATE_REQUIRED,
					context: { ...details },
				});
			},
			queryTotal: {
				fetchWooQueryTotal: (input) => fetchWooQueryTotal(input, fetcher, site.wpJsonRoot),
			},
			connectivity: getEngineConnectivity,
			holdAutomaticTicks: () =>
				requestStateManager.isAuthFailed() ||
				(authExhaustedToken !== null &&
					authExhaustedToken === fetcherOptions.credentials.getLatest().access_token),
			// The one authored product default (initial-settings) — the engine's
			// boot seed and trickle fallback derive from it, never restate it.
			...(hostDefaultProductBrowseSort
				? { defaultProductBrowseSort: hostDefaultProductBrowseSort }
				: {}),
			lastUserActivityMs,
			onUserActivity,
			hostVisible: hostIsVisible,
			onHostVisibilityChange,
			diagnostics: composeObservers(
				appMetricsObserver,
				guardedDiagnostics,
				e2eEngineLedgerObserver
			),
			multiInstance: isWeb ? webLocksAvailable : (options.multiInstance ?? false),
			...(writeLeader ? { writePlaneOwner: () => writeLeader.current?.isLeader() ?? false } : {}),
			...(writeOutcomeBridge ? { writeOutcomeBridge } : {}),
			...(databaseOpenBarrier ? { databaseOpenBarrier } : {}),
		},
		options.scope
	);
	engineSelf = engine;
	// The store header follows the ENGINE's active scope, never the app's
	// intent. The engine flips scopes after it has aborted the outgoing scope's
	// ticket and before the incoming open's barcode hydrate, bootstrap seed and
	// change-signal prime run, so this is the one point at which neither an
	// outgoing lane nor an incoming open can fetch under the other store's
	// header. Committing it before an awaited switch mis-scoped outgoing ticks
	// during a slow open; committing it after mis-scoped the open itself.
	const entry: CachedEngine = {
		renderKey: cacheKey,
		site: siteKey,
		allocationKey: cacheKey,
		requests: [],
		databaseNames: new Set([scopeDatabaseName(options.scope)]),
		engine,
		fetcherOptions,
		fetcherScope,
		clockSkew,
		...(writeLeader ? { writeLeader } : {}),
		...(writeOutcomeBridge ? { writeOutcomeBridge } : {}),
	};
	cachedEngine = entry;
	let publishedKey: string | null = cacheKey;
	let hasActivated = false;
	engine.db$(() => {
		if (cachedEngine !== entry) return;
		const active = engine.active();
		// db$ immediately emits null during boot; retain the allocation's seed.
		if (!active && !hasActivated) return;
		hasActivated = true;
		const key = active ? scopeCacheKey(active.identity) : null;
		const pending = entry.requests.find((request) => request.key === key);
		if (pending?.options) Object.assign(fetcherOptions, pending.options);
		if (key === publishedKey) return;
		fetcherScope.storeId = active?.identity.storeId ?? null;
		clockSkew.generation += 1;
		clockSkew.evaluated = false;
		if (active) moveWriteLeader(entry, scopeDatabaseName(active.identity));
		publishedKey = key;
	});
	return engine;
}
