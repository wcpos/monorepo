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

import { createRefreshHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client/refresh-http-client';
import {
	refreshAccessToken,
	type RefreshAccessTokenConfig,
} from '@wcpos/hooks/use-http-client/refresh-access-token';
import { bareAuthParamSupported } from '@wcpos/utils/auth-param';
import { resolveRestTransport } from '@wcpos/utils/rest-transport';
import { purgeLegacyDatabases } from '@wcpos/database/purge-legacy-db';
import { scopeDatabaseFiles } from '@wcpos/database/scope-database-files';
import { defaultConfig } from '@wcpos/database/adapters/default';
import { forceFreeDatabaseRegistration } from '@wcpos/database/plugins/rx-database-registry';
import { markStorageTerminallyFailed } from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { reportNetworkResponse } from '@wcpos/hooks';
import { requestStateManager } from '@wcpos/hooks/use-http-client';
import {
	composeObservers,
	DRAINABLE_SCOPE_DATABASE_GENERATION,
	scopeDatabaseName,
	type SyncEvent,
} from '@wcpos/sync-core';
import {
	createRxdbSyncEngine,
	drainLegacyScopeDatabase,
	type LegacyScopeDrainOutcome,
	type LegacyScopeDrainPorts,
	type LegacyScopeDrainWriteEvent,
	type RxdbSyncEngine,
	setSyncEngineLogger,
	type StoreScopeIdentity,
} from '@wcpos/sync-engine';
import {
	REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE,
	WEB_STORAGE_ENGINE,
} from '@wcpos/database/adapters/storage/storage-engines';
// Deep import ON PURPOSE: the ui-settings barrel carries the React provider
// graph, which jest-expo's winter runtime refuses to require from this host
// module. The helper file itself is dependency-light (JSON + @wcpos/query).
import { defaultProductBrowseSort } from '@wcpos/core/screens/main/contexts/ui-settings/default-product-browse-sort';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { hostIsVisible, onHostVisibilityChange } from '@wcpos/utils/host-visibility';
import { Platform } from '@wcpos/utils/platform';
import { lastUserActivityMs, onUserActivity } from '@wcpos/utils/user-activity';
import { rememberLegacyUnsentChanges } from '@wcpos/utils/unsent-changes';

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

const engineLogger = getLogger(['wcpos', 'sync', 'engine']);
// The engine is published without @wcpos/utils, so it no longer imports the app
// logger itself; route its process-wide warnings to the category it used before.
setSyncEngineLogger({
	warn: (message, meta) => getLogger(['wcpos', 'sync', 'orders']).warn(message, meta),
});
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
	/** Non-web RxDB override. Web uses the storage engine’s required value. */
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
	/** Drain the scope's previous-generation database once it is this engine's active scope. */
	drainLegacyScope: (scope: StoreScopeIdentity) => Promise<void>;
};

let cachedEngine: CachedEngine | null = null;
let legacyPurgeStarted = false;

/**
 * A drain that kept SENDABLE work (offline, a refused session, a failed push, a
 * row still backing off) retries within the process — after the live engine's
 * next successful write-drain tick, which proves the store is reachable with this
 * session, and no sooner than this backoff. A minute first: long enough for a
 * reconnect or a session renewal to settle, short enough that a sale made just
 * before the upgrade reaches the store within the shift.
 */
const LEGACY_DRAIN_FIRST_RETRY_MS = 60_000;
/** Doubling stops here: a store that stays unreachable is asked four times an hour, not hammered. */
const LEGACY_DRAIN_MAX_RETRY_MS = 15 * 60_000;

/**
 * Per scope, per process: `running`, `waiting` to retry (not before
 * `notBeforeMs`, and only on a successful live write-drain tick), or `done` —
 * drained, absent, failed to open, or kept with nothing sendable left (dead
 * letters, conflicts). A `done` scope is tried again on the next app start.
 */
type LegacyDrainState =
	| { phase: 'running'; retries: number }
	| { phase: 'waiting'; retries: number; notBeforeMs: number }
	| { phase: 'done' };
const legacyDrainStates = new Map<string, LegacyDrainState>();

function legacyDrainBackoffMs(retries: number): number {
	return Math.min(LEGACY_DRAIN_FIRST_RETRY_MS * 2 ** retries, LEGACY_DRAIN_MAX_RETRY_MS);
}
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

function scopeCacheKey(scope: StoreScopeIdentity): string {
	return JSON.stringify([
		canonicalSite(scope.site),
		canonicalScopeComponent(scope.storeId),
		canonicalScopeComponent(scope.cashierId),
	]);
}

/** Shared by render and awaited session commits, including the incoming cashier's refresh. */
export function createSessionFetcherOptions(
	site: RefreshAccessTokenConfig['site'],
	wpCredentials: RefreshAccessTokenConfig['wpUser'] & CreateAppSyncEngineOptions['credentials'],
	sessionRenewedMessage: string
): MutableFetcherOptions {
	return {
		credentials: wpCredentials,
		useJwtAsParam: site.use_jwt_as_param,
		useRestRouteParam: resolveRestTransport(site) === 'query',
		bareAuthParam: bareAuthParamSupported(site.wcpos_version),
		useProtocolHeaders: site.use_protocol_headers,
		refreshAuth: (context) =>
			refreshAccessToken({
				site: {
					wcpos_api_url: site.wcpos_api_url,
					wp_api_url: site.wp_api_url,
					use_jwt_as_param: site.use_jwt_as_param,
					use_rest_route_param: site.use_rest_route_param,
					use_protocol_headers: site.use_protocol_headers,
				},
				wpUser: wpCredentials,
				getHttpClient: createRefreshHttpClient,
				sessionRenewedMessage,
				operationId: context?.operationId,
			}),
	};
}

function projectFetcherOptions(options: MutableFetcherOptions): MutableFetcherOptions {
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
	// Maintenance, not part of the switch: the awaited store-switch flow never waits on it.
	void entry.drainLegacyScope(scope);
}

function remainingCount(remaining: Record<string, number | undefined>): number {
	return Object.values(remaining).reduce<number>((total, count) => total + (count ?? 0), 0);
}

/**
 * One line per drain outcome; a quiet debug line when there was nothing to
 * drain. A kept database warns on the first attempt of a process and then only
 * when its un-sendable work is due its daily report — re-arms and restarts are
 * debug.
 */
function logLegacyDrainOutcome(outcome: LegacyScopeDrainOutcome, isRetry: boolean): void {
	if (outcome.status === 'absent') {
		engineLogger.debug('No previous-version database to drain', {
			context: { databaseName: outcome.databaseName },
		});
		return;
	}
	if (outcome.status === 'failed') {
		engineLogger.error('Could not open the previous database version to send its unsent changes', {
			code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
			context: { databaseName: outcome.databaseName, error: outcome.error },
		});
		return;
	}
	if (outcome.status === 'kept') {
		// Dead letters and parked conflicts keep it too: live work is never removed.
		const loud = outcome.retryable ? !isRetry : outcome.reportDue;
		engineLogger[loud ? 'warn' : 'debug'](
			'Unsent changes from the previous database version are kept until they can be sent',
			{
				context: {
					databaseName: outcome.databaseName,
					reason: outcome.reason,
					retryable: outcome.retryable,
					pushed: outcome.pushed,
					carried: outcome.carried,
					remaining: outcome.remaining,
				},
			}
		);
		return;
	}
	const moved = outcome.carried > 0 ? ` and moved ${outcome.carried} open carts` : '';
	engineLogger.info(
		outcome.fileRemoved
			? `Sent ${outcome.pushed} unsent changes${moved} from the previous database version and removed it`
			: `Sent ${outcome.pushed} unsent changes${moved} from the previous database version and dropped its tables (its file remains)`,
		{
			context: {
				databaseName: outcome.databaseName,
				pushed: outcome.pushed,
				carried: outcome.carried,
				fileRemoved: outcome.fileRemoved,
			},
		}
	);
}

/** A push from the drain the store refused or conflicted on — with the store's own words. */
function logLegacyDrainWriteEvent(databaseName: string, event: LegacyScopeDrainWriteEvent): void {
	engineLogger.warn(
		event.type === 'write-rejected'
			? 'The store refused a change from the previous database version'
			: 'A change from the previous database version conflicts with the store',
		{
			context: {
				databaseName,
				collection: event.collection,
				recordId: event.recordId,
				mutationId: event.mutationId,
				...(event.type === 'write-rejected'
					? {
							...(event.status !== undefined ? { status: event.status } : {}),
							...(event.reason !== undefined ? { reason: event.reason } : {}),
							...(event.serverMessage !== undefined ? { serverMessage: event.serverMessage } : {}),
						}
					: { currentRevision: event.currentRevision }),
			},
		}
	);
}

/**
 * A scope generation bump opens a fresh database; the previous one may still
 * hold unsent sales. Drain it only while it is the engine's active scope (so the
 * session's credentials are that cashier's), never while the session is refused
 * (a refused push would dead-letter them) and never offline — those wait for the
 * live engine's next successful write-drain tick. A drain that kept sendable
 * work re-arms with a bounded backoff; anything else is once per process.
 */
async function drainLegacyScopeOnce(
	engine: RxdbSyncEngine,
	scope: StoreScopeIdentity,
	ports: () => LegacyScopeDrainPorts,
	sessionRefused: () => boolean
): Promise<void> {
	const key = scopeCacheKey(scope);
	const state = legacyDrainStates.get(key);
	if (state?.phase === 'done' || state?.phase === 'running') return;
	if (state?.phase === 'waiting' && Date.now() < state.notBeforeMs) return;
	const active = engine.active();
	if (!active || scopeCacheKey(active.identity) !== key) return;
	const databaseName = scopeDatabaseName(scope, {
		generation: DRAINABLE_SCOPE_DATABASE_GENERATION,
	});
	// Until the drain reports, a previous-generation database MAY hold unsent work.
	if (state === undefined) rememberLegacyUnsentChanges(databaseName, null);
	const retries = state?.retries ?? 0;
	if (sessionRefused() || getEngineConnectivity() === 'offline') {
		// Not an attempt: the next successful live write-drain tick proves both are back.
		legacyDrainStates.set(key, { phase: 'waiting', retries, notBeforeMs: 0 });
		return;
	}
	legacyDrainStates.set(key, { phase: 'running', retries });
	let next: LegacyDrainState = { phase: 'done' };
	try {
		const outcome = await drainLegacyScopeDatabase(ports(), scope);
		logLegacyDrainOutcome(outcome, retries > 0);
		if (outcome.status === 'absent' || outcome.status === 'drained') {
			rememberLegacyUnsentChanges(databaseName, 0);
		} else if (outcome.status === 'kept') {
			rememberLegacyUnsentChanges(databaseName, remainingCount(outcome.remaining));
			if (outcome.retryable) {
				next = {
					phase: 'waiting',
					retries: retries + 1,
					notBeforeMs: Date.now() + legacyDrainBackoffMs(retries),
				};
			}
		}
	} catch (error) {
		// The drain itself never throws; this is the host failing to build its ports.
		engineLogger.error('Failed to start draining the previous database version', {
			code: ERROR_CODES.SYNC_UNEXPECTED,
			context: { scopeKey: key, error: error instanceof Error ? error.message : String(error) },
		});
	} finally {
		legacyDrainStates.set(key, next);
	}
}

function disposeCachedEngine(entry: CachedEngine): void {
	const active = entry.engine.active();
	const disposalKey = active ? scopeCacheKey(active.identity) : entry.allocationKey;
	const disposalKeys = new Set([disposalKey, ...entry.requests.map((request) => request.key)]);
	if (entry.renderKey) disposalKeys.add(entry.renderKey);
	const priorDisposals = new Set(
		[...disposalKeys]
			.map((key) => pendingDisposals.get(key))
			.filter((pending): pending is Promise<void> => pending !== undefined)
	);
	let disposal: Promise<void>;
	try {
		disposal =
			priorDisposals.size > 0
				? Promise.allSettled(priorDisposals).then(() => entry.engine.dispose())
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
		for (const key of disposalKeys) {
			if (pendingDisposals.get(key) === bounded) pendingDisposals.delete(key);
		}
	});
}

/** Reuse the existing bounded disposal before the live-tab owner closes its pool. */
export async function disposeAppSyncEngine(): Promise<void> {
	const entry = cachedEngine;
	cachedEngine = null;
	if (entry) disposeCachedEngine(entry);
	await Promise.all(pendingDisposals.values());
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
export async function switchAppEngineScope(
	session: {
		site?: { wp_api_url?: string } | null;
		wpCredentials?: { id?: number | string } | null;
		store?: { id?: number | string } | null;
	},
	options?: MutableFetcherOptions
): Promise<void> {
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
	await requestScope(entry, scope, options && projectFetcherOptions(options));
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

	const multiInstance = isWeb
		? REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE[WEB_STORAGE_ENGINE]
		: (options.multiInstance ?? false);
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
			multiInstance,
			...(databaseOpenBarrier ? { databaseOpenBarrier } : {}),
		},
		options.scope
	);
	engineSelf = engine;
	// The drain's own transport: pinned to the drained scope's store, with the
	// session as it stands when the drain starts — a later cashier swap mutates
	// `fetcherOptions` in place and must not re-sign a sale already in flight.
	const legacyDrainPorts = (scope: StoreScopeIdentity): LegacyScopeDrainPorts => {
		const databaseName = scopeDatabaseName(scope, {
			generation: DRAINABLE_SCOPE_DATABASE_GENERATION,
		});
		return {
			site,
			storage: defaultConfig.storage,
			fetcher: createEngineFetcher({
				auth: { ...fetcherOptions },
				clockSkew: { generation: 0, evaluated: false },
				scope: { storeId: scope.storeId },
				emitTransport,
				wpJsonRoot: site.wpJsonRoot,
				...(platformEngineFetch ? { fetch: platformEngineFetch } : {}),
			}),
			connectivity: getEngineConnectivity,
			multiInstance,
			// Native lists and deletes files; web and Electron cannot (null): open-to-check there.
			databaseFiles: scopeDatabaseFiles,
			// An open cart left in the old database is carried into this engine's.
			liveEngine: engine,
			// The sync log only: the drain's own queue must not move this engine's status.
			diagnostics: (event) => {
				if (engineSelf !== null && cachedEngine?.engine !== engineSelf) return;
				syncLogObserver.observe(event);
			},
			onWriteEvent: (event) => logLegacyDrainWriteEvent(databaseName, event),
		};
	};
	const drainLegacyScope = (scope: StoreScopeIdentity): Promise<void> =>
		drainLegacyScopeOnce(
			engine,
			scope,
			() => legacyDrainPorts(scope),
			() =>
				requestStateManager.isAuthFailed() ||
				(authExhaustedToken !== null &&
					authExhaustedToken === fetcherOptions.credentials.getLatest().access_token)
		);
	// A drain waiting to retry runs after a successful live write-drain tick: the store
	// answered this session, so the old database's sales can go too.
	engine.events((event) => {
		if (event.type !== 'lane-finish' || event.lane !== 'write-drain' || event.status !== 'ran')
			return;
		const active = engine.active();
		if (active) void drainLegacyScope(active.identity);
	});
	// Draining and purging are session maintenance, not part of opening a store.
	// Failed opens leave legacy data alone; neither ever rejects engine.ready.
	void engine.ready.then(
		async () => {
			await drainLegacyScope(options.scope);
			if (legacyPurgeStarted) return;
			legacyPurgeStarted = true;
			try {
				await purgeLegacyDatabases();
			} catch (error) {
				engineLogger.error('Failed to purge legacy databases', {
					code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
					context: { error: error instanceof Error ? error.message : String(error) },
				});
			}
		},
		() => undefined
	);
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
		drainLegacyScope,
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
		publishedKey = key;
	});
	return engine;
}
