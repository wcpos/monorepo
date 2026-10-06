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
	containsDrainableScopeDatabaseName,
	DRAINABLE_SCOPE_DATABASE_GENERATION,
	isScopeDatabaseName,
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
import {
	legacyDrainMarked,
	markLegacyDrainPending,
	rememberLegacyUnsentChanges,
} from '@wcpos/utils/unsent-changes';

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

import type { LegacyScopeHistory } from './legacy-scope-history';

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
 * row still backing off) retries within the process — on the live engine's next
 * write-drain tick that finished `ran` (the lane ran; not proof the store
 * answered), and no sooner than this backoff. A minute first: long enough for a
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

/**
 * Previous-generation databases the till may hold, besides the ones it visits. "Clear all local
 * data" deletes every one of them, so the reset count stays UNKNOWN until each has reported
 * (drained, absent, or kept with a count). How they are found differs by platform:
 *  - NATIVE lists `Documents/wcpos-sqlite` (`scopeDatabaseFiles.list()`): every drainable
 *    `pos_v5_…` file there is marked pending at boot, and only a visit (its drain) reports it.
 *  - WEB and ELECTRON cannot list their files (the sahpool worker / the main process own them).
 *    They read the till's SCOPE HISTORY (`legacy-scope-history.ts`, in the user database's local
 *    documents): every scope database name opened from this build on, plus the store registry.
 *    Removing a site keeps its scope databases (and its history entry), so the registry alone
 *    would miss them. Every name not yet CLEARED (reported nothing kept on an earlier boot) is
 *    marked pending at boot; the history is SETTLED (later boots count exactly) while it is
 *    complete and every name is cleared — opening a new scope un-settles it until that name reports.
 *    A history is complete only when it began with the app database — an install whose app
 *    database already existed at this build's first boot started its history late, may hold a
 *    pos_v5 nothing names, and so is never settled: its reset count reads unknown for the life
 *    of that install (`LEGACY_HISTORY_INCOMPLETE`).
 */
const LEGACY_HISTORY_INCOMPLETE = 'previous-version databases from before this build';
/**
 * The store registry holds a reference with no document behind it (a credential still naming a
 * store reconciliation removed): a scope the inventory cannot name, so — like an incomplete
 * history — the count is unknown while one exists.
 */
const LEGACY_REGISTRY_UNRESOLVED = 'previous-version databases behind unresolved store references';
let legacyRegistryUnresolvedWarned = false;
/**
 * The OVERALL inventory: pending from engine construction until discovery completes (the reset
 * count is unknown meanwhile — a confirm opened before discovery would otherwise state an exact
 * count from the active scope alone), and failed for the process when discovery cannot read.
 */
const LEGACY_INVENTORY_PENDING = 'previous-version database inventory (not yet run)';
const LEGACY_INVENTORY_FAILED = 'previous-version database inventory (failed)';
let legacyInventoryCompleted = false;
let legacyInventoryFailed = false;
let legacyInventoryFailureWarned = false;
/** Set while the latest inventory saw an unresolved registry reference. */
let legacyRegistryIncomplete = false;
/** Names the boot inventory marked; a web/Electron history records each one that clears. */
const legacyInventory = new Set<string>();
/** Names this process has a drain report for: a later inventory must not re-mark them pending. */
const legacyReported = new Set<string>();
/** The web/Electron scope history the inventory read, when it read one. */
let legacyHistory: LegacyScopeHistory | null = null;

/** Names this process saw report nothing kept (drained or absent). */
const legacyReportedEmpty = new Set<string>();
/** Names this process already recorded as cleared in the history. */
const legacyClearedRecorded = new Set<string>();

/**
 * Web/Electron: record in the history every inventoried name that reported nothing kept. The
 * history is settled (later boots count exactly) once it is complete and every name is cleared;
 * a scope opened later adds an uncleared name and un-settles it until that one reports.
 */
function clearLegacyHistory(): void {
	const history = legacyHistory;
	if (history === null) return;
	const names = [...legacyReportedEmpty].filter(
		(name) =>
			legacyInventory.has(name) &&
			!history.cleared.includes(name) &&
			!legacyClearedRecorded.has(name)
	);
	if (names.length === 0) return;
	for (const name of names) legacyClearedRecorded.add(name);
	void history.markCleared(names).catch(() => {
		// Best effort: an unrecorded clear only means the next boot inventories that name again.
	});
}

function reportLegacyDrain(
	databaseName: string,
	count: number | null,
	orderUuids?: readonly string[]
): void {
	legacyReported.add(databaseName);
	if (count === 0) legacyReportedEmpty.add(databaseName);
	else legacyReportedEmpty.delete(databaseName);
	rememberLegacyUnsentChanges(databaseName, count, orderUuids);
	clearLegacyHistory();
}

/**
 * The boot inventory of previous-generation databases (see `LEGACY_HISTORY_INCOMPLETE`): mark
 * every one this till may hold pending, so the reset count reads unknown until each reports.
 * `registry` is every scope the app's user database knows; `history` is the web/Electron scope
 * history (ignored where the platform lists its files).
 */
export async function inventoryLegacyScopeDatabases(input: {
	registry: readonly StoreScopeIdentity[];
	/** Registry references with no document behind them (see `LEGACY_REGISTRY_UNRESOLVED`). */
	unresolvedReferences?: readonly string[];
	history?: LegacyScopeHistory;
}): Promise<void> {
	// Only where the registry IS the inventory (web/Electron). On native the SQLite file listing
	// is authoritative: a dangling registry reference cannot hide a pos_v5 file from it.
	const unresolved = scopeDatabaseFiles === null ? (input.unresolvedReferences ?? []) : [];
	legacyRegistryIncomplete = unresolved.length > 0;
	// Re-read every inventory: a reference resolved since the last one no longer blocks.
	rememberLegacyUnsentChanges(LEGACY_REGISTRY_UNRESOLVED, legacyRegistryIncomplete ? null : 0);
	if (legacyRegistryIncomplete) {
		if (!legacyRegistryUnresolvedWarned) {
			legacyRegistryUnresolvedWarned = true;
			engineLogger.warn(
				'The store registry names records that are missing; unsent changes from the previous database version cannot be ruled out',
				{ context: { unresolved: [...unresolved] } }
			);
		}
	}
	let names: string[];
	if (scopeDatabaseFiles !== null) {
		names = (await scopeDatabaseFiles.list()).filter(
			(name) => isScopeDatabaseName(name) && containsDrainableScopeDatabaseName(name)
		);
	} else if (input.history?.settled) {
		names = [];
	} else {
		// A cleared name reported nothing kept on an earlier boot: its pos_v5 is gone for good.
		const cleared = new Set(input.history?.cleared ?? []);
		names = [
			...new Set([
				...(input.history?.names ?? []),
				...input.registry.map((scope) =>
					scopeDatabaseName(scope, { generation: DRAINABLE_SCOPE_DATABASE_GENERATION })
				),
			]),
		].filter((name) => !cleared.has(name));
		legacyHistory = input.history ?? null;
		if (!input.history?.complete) {
			// A pos_v5 nothing names may exist: the count is unknown for the life of this install.
			rememberLegacyUnsentChanges(LEGACY_HISTORY_INCOMPLETE, null);
		}
	}
	for (const name of names) {
		legacyInventory.add(name);
		if (!legacyReported.has(name) && !legacyDrainMarked(name)) markLegacyDrainPending(name);
	}
	// Discovery is complete: every database it found is marked (or reported) by name.
	legacyInventoryCompleted = true;
	if (!legacyInventoryFailed) rememberLegacyUnsentChanges(LEGACY_INVENTORY_PENDING, 0);
	clearLegacyHistory();
}

/**
 * Discovery itself, as the layout runs it after boot: `read` loads the registry and the history
 * from the user database. Until it completes, `LEGACY_INVENTORY_PENDING` (marked at engine
 * construction) keeps the reset count unknown. A read that fails leaves the count unknown for
 * the process (`LEGACY_INVENTORY_FAILED`, warned once) — except on native, whose inventory is
 * its file listing and needs no registry, so it still runs.
 */
export async function runLegacyInventory(
	read: () => Promise<Parameters<typeof inventoryLegacyScopeDatabases>[0]>
): Promise<void> {
	let input: Parameters<typeof inventoryLegacyScopeDatabases>[0];
	try {
		input = await read();
	} catch (error) {
		if (scopeDatabaseFiles === null) {
			failLegacyInventory(error);
			return;
		}
		input = { registry: [] };
	}
	try {
		await inventoryLegacyScopeDatabases(input);
	} catch (error) {
		failLegacyInventory(error);
	}
}

function failLegacyInventory(error: unknown): void {
	legacyInventoryFailed = true;
	rememberLegacyUnsentChanges(LEGACY_INVENTORY_PENDING, 0);
	rememberLegacyUnsentChanges(LEGACY_INVENTORY_FAILED, null);
	if (legacyInventoryFailureWarned) return;
	legacyInventoryFailureWarned = true;
	engineLogger.warn(
		"Could not list the previous database version's scope databases; unsent changes from it cannot be ruled out",
		{ context: { error: error instanceof Error ? error.message : String(error) } }
	);
}

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
 * session's credentials are that cashier's). While the session is refused (a
 * refused push would dead-letter them) or the till is offline it never PUSHES —
 * but it still probes (local), carries open carts over and reports what it kept,
 * then waits for the live engine's next write-drain tick that ran. A drain that
 * kept sendable work after a real attempt re-arms with a bounded backoff;
 * anything else is once per process.
 */
/** Report a marked-but-not-drained database as uncountable, so nothing waits on it. */
function releaseLegacyDrainMark(databaseName: string): void {
	if (legacyDrainMarked(databaseName)) reportLegacyDrain(databaseName, null);
}

/**
 * True while `engine` is still the app's engine and `scope` its active scope — when a line about
 * that scope's previous-version database belongs in the log the app is writing to now. A store
 * or site switch rebinds that log to the NEW store's database; a late line about the old scope
 * would land in the new store's Health log, so it is dropped instead (as `diagnostics` does for a
 * superseded engine).
 */
function stillLoggingFor(engine: RxdbSyncEngine, scope: StoreScopeIdentity): boolean {
	if (cachedEngine?.engine !== engine) return false;
	const active = engine.active();
	return active !== null && scopeCacheKey(active.identity) === scopeCacheKey(scope);
}

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
	const databaseName = scopeDatabaseName(scope, {
		generation: DRAINABLE_SCOPE_DATABASE_GENERATION,
	});
	const active = engine.active();
	if (!active || scopeCacheKey(active.identity) !== key) {
		// Not draining it now (switched away first): a mark must not outlive a drain that will not
		// run — release its waiters as "uncountable". Returning to the scope drains and re-marks.
		if (state === undefined) releaseLegacyDrainMark(databaseName);
		return;
	}
	// Until the drain reports, a previous-generation database MAY hold unsent work (usually
	// already marked at engine construction; a switched-to scope is marked here).
	if (state === undefined) markLegacyDrainPending(databaseName);
	const retries = state?.retries ?? 0;
	// Offline or a refused session blocks only the PUSH: the probe is local, so the drain still
	// checks, carries open carts over and reports what it kept — the report never waits on the
	// network. A blocked drain is not an attempt: no backoff, the next live tick re-arms it.
	const pushBlockedReason = sessionRefused()
		? 'the store refused the session'
		: getEngineConnectivity() === 'offline'
			? 'write-drain skipped: offline'
			: null;
	legacyDrainStates.set(key, { phase: 'running', retries });
	let next: LegacyDrainState = { phase: 'done' };
	try {
		const outcome = await drainLegacyScopeDatabase({ ...ports(), pushBlockedReason }, scope);
		// A blocked drain logs as a retry would: the warn waits for a real attempt.
		if (stillLoggingFor(engine, scope)) {
			logLegacyDrainOutcome(outcome, retries > 0 || pushBlockedReason !== null);
		}
		if (outcome.status === 'absent' || outcome.status === 'drained') {
			reportLegacyDrain(databaseName, 0);
		} else if (outcome.status === 'failed') {
			// Reported, but uncountable: a wipe stays "unknown", and nothing waits on it any longer.
			reportLegacyDrain(databaseName, null);
		} else {
			reportLegacyDrain(databaseName, remainingCount(outcome.remaining), outcome.keptOrderUuids);
			if (outcome.retryable && pushBlockedReason !== null) {
				next = { phase: 'waiting', retries, notBeforeMs: 0 };
			} else if (outcome.retryable) {
				next = {
					phase: 'waiting',
					retries: retries + 1,
					notBeforeMs: Date.now() + legacyDrainBackoffMs(retries),
				};
			}
		}
	} catch (error) {
		// The drain itself never throws; this is the host failing to build its ports.
		reportLegacyDrain(databaseName, null);
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
	// Marked now, during render — before any readiness callback or store-session effect — so a
	// reader that waits on the drain's report (the completion journal) can never ask before the
	// drain is known to be coming.
	if (!legacyDrainStates.has(cacheKey)) {
		markLegacyDrainPending(
			scopeDatabaseName(options.scope, { generation: DRAINABLE_SCOPE_DATABASE_GENERATION })
		);
	}
	// …and the inventory of every other one, until its discovery completes.
	if (!legacyInventoryCompleted && !legacyInventoryFailed) {
		markLegacyDrainPending(LEGACY_INVENTORY_PENDING);
	}
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
			onWriteEvent: (event) => {
				if (stillLoggingFor(engine, scope)) logLegacyDrainWriteEvent(databaseName, event);
			},
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
	// A drain waiting to retry runs after a live write-drain tick that finished `ran`. That
	// proves the LANE ran (online, session not held, scope open) — not that the store answered
	// (a tick over an empty queue sends nothing). So the trigger is only a cue: the backoff is
	// what bounds real attempts (about four an hour at the 15-minute cap), and attempts per
	// process are unbounded while sendable work stays kept.
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
		() => {
			// The scope never opened, so its drain never runs: release the construction-time mark.
			if (!legacyDrainStates.has(cacheKey)) {
				releaseLegacyDrainMark(
					scopeDatabaseName(options.scope, { generation: DRAINABLE_SCOPE_DATABASE_GENERATION })
				);
			}
		}
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
