import { COLLECTION_VOCABULARY } from '@wcpos/query';
import type { SyncEvent } from '@wcpos/sync-core';
import {
	type EngineFetcher,
	hydrateResponse,
	type QueryTotalWooRequest,
	type ResponseEnvelopeTransportState,
	type SyncCollectionName,
} from '@wcpos/sync-engine';
import { AppInfo } from '@wcpos/utils/app-info';
import { formatAuthorizationParam } from '@wcpos/utils/auth-param';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { toRestRouteUrl } from '@wcpos/utils/rest-transport';

import { evaluateClockSkew } from './clock-skew';
import {
	collectionFromSyncUrl,
	getMetricsEpoch,
	recordServerLoad,
	recordTransport,
} from './metrics';

const engineLogger = getLogger(['wcpos', 'sync', 'engine']);
const envelopeTransportByFetcher = new WeakMap<EngineFetcher, ResponseEnvelopeTransportState>();
// Six consecutive 429s approximates all lanes being rejected across multiple
// ticks, beyond the automatic-backoff regime that already handles brief bursts.
const PERSISTENT_RATE_LIMIT_THRESHOLD = 6;

/**
 * Per-fetcher 429 streak observer. Deliberately NOT module state: a fetcher is
 * built per engine, and a store switch must start the new site's streak from
 * zero — otherwise the outgoing site's count could fire this warning on the
 * incoming site's first 429, or its latch could suppress a real one.
 */
function createRateLimitObserver(): (status: number) => void {
	let consecutive429s = 0;
	let latched = false;
	return (status: number) => {
		if (status !== 429) {
			consecutive429s = 0;
			latched = false;
			return;
		}
		consecutive429s += 1;
		if (consecutive429s === PERSISTENT_RATE_LIMIT_THRESHOLD && !latched) {
			latched = true;
			engineLogger.warn('Host persistently rate-limited sync requests', {
				code: ERROR_CODES.HOST_RATE_LIMITED,
				showToast: true,
				context: { consecutive429s },
			});
		}
	};
}

export type EngineFetcherAuth = {
	credentials: { getLatest: () => { access_token?: string } };
	refreshAuth?: (context?: { operationId?: string }) => Promise<string | null>;
	useJwtAsParam?: boolean;
	bareAuthParam?: boolean;
	/** Rides the same live-options ref as the auth flags: cache hits mutate it
	 * in place, so a probe-driven transport flip reaches the cached fetcher. */
	useRestRouteParam?: boolean;
};

export type ClockSkewGate = { generation: number; evaluated: boolean };

/**
 * The engine's store scope, read FRESH at request time (never captured) so a
 * store switch retargets in-flight lanes the same way a token refresh does.
 *
 * The sync lanes do not use the legacy REST http client, which was the only
 * place `store_id` was ever attached — so before this the whole v2 surface
 * carried no store context and Pro's per-store pricing had nothing to key on
 * (pro#425). The header is the seam: no URL rewriting, every pull/push/ack
 * request carries it.
 */
export type EngineFetcherScope = {
	/** The scoped store id, sourced exactly as orders source `_pos_store`. */
	storeId?: number | string | null;
};

/** The header carrying the till's store scope to the WCPOS v2 REST surface. */
export const STORE_SCOPE_HEADER = 'X-WCPOS-Store';

/**
 * Narrow a scope value to a store id worth sending, or null.
 *
 * Store `0` is the free plugin's "no store" default — the SAME sentinel the
 * order lane tests before stamping `_pos_store`, kept identical here on purpose.
 * Sending a placeholder would be worse than sending nothing: the server treats
 * an absent scope as "unknown" and refuses to overwrite a store-scoped price,
 * whereas a bogus `0` would read as a real scope.
 */
function normalizeStoreScope(storeId: number | string | null | undefined): string | null {
	if (storeId === null || storeId === undefined) return null;
	if (typeof storeId === 'number') {
		return Number.isFinite(storeId) && storeId > 0 ? String(storeId) : null;
	}
	const trimmed = storeId.trim();
	if (trimmed === '' || trimmed === '0') return null;
	return trimmed;
}

function isSyncCollectionName(name: string): name is SyncCollectionName {
	return Object.prototype.hasOwnProperty.call(COLLECTION_VOCABULARY, name);
}

/** Build the authenticated fetch adapter used by the sync engine. */
export function createEngineFetcher(input: {
	auth: EngineFetcherAuth;
	clockSkew: ClockSkewGate;
	emitTransport: (event: SyncEvent, durable?: boolean) => void;
	/** Mutated in place by the scope lifecycle; read per attempt, never captured. */
	scope?: EngineFetcherScope;
	fetch?: typeof globalThis.fetch;
	now?: () => number;
	wpJsonRoot: string;
}): EngineFetcher {
	const now = input.now ?? Date.now;
	const observeResponseStatus = createRateLimitObserver();

	// One logical request = one arc. When a 401 enters the refresh path, the arc's
	// rows — the absorbed attempt, the refresh layer's "Session renewed
	// automatically" breadcrumb, and the retry — share this id so the ledger can
	// chain attempt → refresh → success (#899). Minted per ARC only: a synthetic id
	// on every row would defeat repeat-collapse (see the observer's operationId note).
	const mintOperationId = (now: () => number): string =>
		`auth-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

	type SettledAttempt = {
		response: Response;
		/**
		 * Close this attempt's books at the level the SETTLED arc decided: it writes
		 * the transport row AND stamps the attempt into the hourly metric bucket.
		 *
		 * Both, from one call, on purpose — the two used to be stamped at different
		 * moments and disagreed (#1547). Call it EXACTLY once per attempt: twice
		 * double-counts the request, never loses it. `settle`, not `emit`, because
		 * emitting a log row is only half of what it does.
		 */
		settle: (level: SyncEvent['level'], extraFields?: Record<string, unknown>) => void;
	};

	/** Execute one logical request arc, including any authentication retry. */
	const fetcher: EngineFetcher = async (url, init) => {
		const clockSkewGeneration = input.clockSkew.generation;
		let tokenUsed: string | undefined;
		const method = (init?.method ?? 'GET').toUpperCase();
		const requestPath = url.split(/[?#]/, 1)[0]?.replace(/\/+$/, '');
		const isRefreshRequest = requestPath?.endsWith('/auth/refresh') ?? false;
		const isTickProbe = requestPath?.endsWith('/changes/tick') ?? false;

		/**
		 * Perform one attempt, deferring both its log row and its transport verdict
		 * to the caller instead of firing them here.
		 *
		 * WHY. A log level is a promise about how the OPERATION ended, and inside a
		 * refresh arc the ending is not known yet (#899) — a 401 that a refresh then
		 * absorbs is not a fault, and stamping it as one before the retry has run is
		 * exactly what surfaced the healthy TTL cycle as a failure. The hourly metric
		 * rides with the log row for the same reason (#1547).
		 *
		 * Server load is still sampled immediately (it is a reading, not a verdict),
		 * and the network-failure path emits inline — a thrown fetch has no arc to
		 * wait for.
		 */
		const performAttempt = async (arcFields?: Record<string, unknown>): Promise<SettledAttempt> => {
			const token = input.auth.credentials.getLatest().access_token;
			tokenUsed = token;
			const headers = new Headers(init?.headers ?? {});
			// The WCPOS REST namespaces only construct for POS-flagged requests
			// (woocommerce_pos_request()) — without this header every sync route
			// answers rest_no_route and the engine stays degraded-empty.
			headers.set('X-WCPOS', '1');
			// Explicit product UA on native/Electron (B10, wcpos-infra#72): a blank
			// or library UA on a POST earns a permanent AIOS IP ban. The fragment is
			// EMPTY on web — Firefox honours fetch UA overrides, and replacing the
			// battle-tested browser UA with a product string reads as a bot.
			for (const [name, value] of Object.entries(AppInfo.userAgentHeader)) {
				headers.set(name, value);
			}
			// Re-read per attempt: a store switch that lands between the absorbed 401
			// and its retry must send the retry under the NEW scope, never the old one.
			const storeScope = normalizeStoreScope(input.scope?.storeId);
			if (storeScope !== null) {
				headers.set(STORE_SCOPE_HEADER, storeScope);
			} else {
				// An unscoped engine must not inherit a stale header from init.
				headers.delete(STORE_SCOPE_HEADER);
			}
			if (input.auth.useRestRouteParam) url = toRestRouteUrl(url, input.wpJsonRoot);
			let finalUrl = url;
			if (token) {
				if (input.auth.useJwtAsParam) {
					const parsed = new URL(url);
					parsed.searchParams.set(
						'authorization',
						formatAuthorizationParam(token, input.auth.bareAuthParam ?? false)
					);
					finalUrl = parsed.toString();
				} else {
					headers.set('Authorization', `Bearer ${token}`);
				}
			}
			const parsedUrl = new URL(finalUrl);
			// Plain permalinks carry the REST route in ?rest_route= with pathname
			// '/', so the push exemption must classify from the route, not the path.
			const restRoutePath = parsedUrl.searchParams.get('rest_route') ?? parsedUrl.pathname;
			const envelopeRequested = !restRoutePath.split('/').includes('push');
			// Marker parity with the X-WCPOS header set above: hostile proxies
			// strip custom request headers, and an unmarked request answers
			// rest_no_route. The query-var twin (`wcpos`, registered in the
			// plugin's Init::query_vars) rides the URL, which a header-stripping
			// proxy cannot touch — sent unconditionally, pushes included, so
			// marker delivery never depends on header survival (B7,
			// wcpos-infra#72; prerequisite for B12's strict marker gating).
			parsedUrl.searchParams.set('wcpos', '1');
			// Scope parity with the X-WCPOS-Store header set above: the server
			// honours the store_id param only when NO header arrived (free#1646 —
			// a stripping proxy produces absence; a sent header always wins), so
			// republishing the scope here is a no-op until the header dies in
			// transit — exactly the hostile case (B6, wcpos-infra#72).
			if (storeScope !== null) {
				parsedUrl.searchParams.set('store_id', storeScope);
			} else {
				// An unscoped engine must not inherit a stale param from the caller
				// URL — mirror of the header delete above.
				parsedUrl.searchParams.delete('store_id');
			}
			if (envelopeRequested) {
				parsedUrl.searchParams.set('_wcpos_envelope', '1');
			}
			finalUrl = parsedUrl.toString();
			const path = parsedUrl.pathname;
			const startedAtMs = now();
			// Captured at start: a completion after a store switch (epoch bump) is the
			// outgoing store's traffic and must not land in the new store's buckets.
			const epochAtStart = getMetricsEpoch();
			let response: Response;
			try {
				response = input.fetch
					? await input.fetch(finalUrl, { ...init, headers })
					: await globalThis.fetch(finalUrl, { ...init, headers });
			} catch (error) {
				const atMs = now();
				const durationMs = atMs - startedAtMs;
				const aborted = (error as { name?: unknown } | null)?.name === 'AbortError';
				input.emitTransport(
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
							...arcFields,
						},
					},
					!aborted
				);
				// The metric follows the same verdict as the row: an abort is OUR
				// cancellation (a superseded tick, a scope switch), so it counts as a
				// request that happened and never as a fault. Counting it turned the
				// uptime strip amber for an hour whose log holds nothing to explain it.
				recordTransport({
					atMs,
					durationMs,
					bytes: 0,
					failed: !aborted,
					epoch: epochAtStart,
				});
				throw error;
			}
			observeResponseStatus(response.status);

			const atMs = now();
			const durationMs = atMs - startedAtMs;
			if (input.clockSkew.generation === clockSkewGeneration && !input.clockSkew.evaluated) {
				try {
					const dateHeader = response.headers.get('Date');
					if (dateHeader !== null && !Number.isNaN(Date.parse(dateHeader))) {
						const result = evaluateClockSkew({
							dateHeader,
							requestStartedAtMs: startedAtMs,
							responseAtMs: atMs,
						});
						input.clockSkew.evaluated = true;
						if (result) {
							engineLogger.warn(
								`Server clock is ${Math.abs(result.skewSeconds)}s ${result.skewSeconds > 0 ? 'ahead of' : 'behind'} the device clock`,
								{
									context: {
										skewSeconds: result.skewSeconds,
										serverDate: result.serverDate,
										deviceDate: result.deviceDate,
									},
								}
							);
						}
					}
				} catch {
					// Malformed server diagnostics must not affect the sync request.
				}
			}
			const contentLengthRaw = Number(response.headers.get('content-length'));
			// A malformed/negative content-length (broken server or proxy) must not
			// poison the hourly byte totals — clamp to a finite non-negative count.
			const bytes =
				Number.isFinite(contentLengthRaw) && contentLengthRaw >= 0 ? contentLengthRaw : 0;
			// Hydrate BEFORE sampling diagnostics: on a header-stripping host the
			// server-load value exists only in the _wcpos body envelope, and the
			// engine wrapper's own hydration runs after this fetcher returns —
			// too late for the perf screen's recordServerLoad sample below. The
			// wrapper's second pass is an idempotent passthrough (memoized body,
			// patched headers).
			// Scoped to 2xx: the server never envelopes errors or 304s, and the
			// auth-retry path must keep un-consumed 401 bodies clone-able.
			if (response.ok) {
				let transportState = envelopeTransportByFetcher.get(fetcher);
				if (!transportState) {
					transportState = { responseHeadersReadable: true };
					envelopeTransportByFetcher.set(fetcher, transportState);
				}
				const state = transportState;
				response = await hydrateResponse(response, {
					envelopeRequested,
					transportState: state,
					onDiagnostic: (kind) =>
						engineLogger.debug(`Response envelope metadata is ${kind}`, {
							context: { responseHeadersReadable: state.responseHeadersReadable },
						}),
				});
			}

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

			return {
				response,
				settle: (level, extraFields) => {
					// A failure is what the merchant would recognise as one: warn or
					// error. Everything the rubric settles as info or debug — a 2xx, a
					// 304 conditional poll, a tick-probe 404 the change signal is built
					// to fall back from, an absorbed 401 whose retry then succeeded —
					// is a healthy request, not an amber hour.
					recordTransport({
						atMs,
						durationMs,
						bytes,
						failed: level === 'warn' || level === 'error',
						epoch: epochAtStart,
					});
					input.emitTransport({
						type: 'transport.request',
						level,
						collection: collectionFromSyncUrl(finalUrl),
						at: atMs,
						fields: {
							durationMs,
							bytes,
							status: response.status,
							method,
							path,
							...arcFields,
							...extraFields,
						},
					});
				},
			};
		};

		/**
		 * The settled classification for an attempt whose arc ends with it (#899
		 * rubric — the level reflects how the operation ended):
		 *
		 *  - 2xx/304 → info (successes are metrics-only; the observer drops them).
		 *  - tick-probe 404 → debug + outcome 'recovered': the hybrid change signal
		 *    latches tick-unsupported and falls back to sequence-log polling BY
		 *    CONSTRUCTION (its TIER 1 poll is unconditional), so this is a designed
		 *    self-healing downgrade, not a fault worth a warn in the merchant's log.
		 *  - 403 → error: a permission error, never refreshed (the 1.9 row-14 rule);
		 *    it needs attention, not a refresh loop.
		 *  - anything else !ok → warn (will need attention if it persists).
		 */
		const emitSettled = (attempt: SettledAttempt, extraFields?: Record<string, unknown>): void => {
			const status = attempt.response.status;
			if (attempt.response.ok || status === 304) attempt.settle('info', extraFields);
			else if (status === 404 && isTickProbe)
				attempt.settle('debug', { outcome: 'recovered', ...extraFields });
			else if (status === 403) attempt.settle('error', extraFields);
			else attempt.settle('warn', extraFields);
		};

		const first = await performAttempt();
		if (first.response.status !== 401 || !input.auth.refreshAuth || isRefreshRequest) {
			emitSettled(first);
			return first.response;
		}

		// The 401 entered the refresh arc — hold the attempt's row until the arc
		// settles. Stamping warn here, before the single-flight refresh and retry
		// have run, is exactly what surfaced the healthy TTL cycle as a fault (#899).
		const operationId = mintOperationId(now);
		let retryToken: string | null;
		try {
			// A concurrent request may have already refreshed the JWT while this one was in
			// flight. If the current token differs from the one this request used, retry with it
			// before starting another refresh — avoids redundant refreshes on staggered 401s.
			const currentToken = input.auth.credentials.getLatest().access_token;
			retryToken =
				currentToken && currentToken !== tokenUsed
					? currentToken
					: await input.auth.refreshAuth({ operationId });
		} catch (error) {
			// The refresh itself failed hard — settle the attempt as a failure and let
			// the refresh error propagate exactly as before.
			first.settle('warn', { outcome: 'failed', operationId });
			throw error;
		}
		if (!retryToken) {
			// No fresh token. The refresh layer logs its own verdict ('Unable to
			// refresh session' — error when the refresh token is terminally rejected),
			// so this row records the request-level failure without double-escalating.
			// Leave it uncorrelated so repeated post-rejection 401s can collapse.
			first.settle('warn', { outcome: 'failed' });
			return first.response;
		}

		let retry: SettledAttempt;
		try {
			retry = await performAttempt({ operationId });
		} catch (error) {
			// The retry never settled (the network fell over mid-arc). Its thrown path
			// already emitted a status-0 warn row carrying the arc id; the absorbed 401
			// stays forensic.
			first.settle('debug', { outcome: 'failed', operationId });
			throw error;
		}
		const retryStatus = retry.response.status;
		if (retry.response.ok || retryStatus === 304) {
			// The healthy cycle: the 401 was just a stale token. Both attempts become
			// forensic debug rows (visible under verbose diagnostics, chained by the
			// arc id); the user-facing narrative is the single 'Session renewed
			// automatically' info row the refresh layer writes.
			first.settle('debug', { outcome: 'recovered', operationId });
			retry.settle('debug', { operationId });
		} else if (retryStatus === 401) {
			// Still unauthorized after a refresh — bounded-refresh exhaustion; NOW
			// something is actually wrong and the user will need to re-authenticate.
			first.settle('debug', { outcome: 'failed', operationId });
			retry.settle('error', { operationId });
		} else {
			// The 401 was cured but the retry hit a different failure — classify that
			// failure on its own terms, keeping the arc id for the chain.
			first.settle('debug', { outcome: 'recovered', operationId });
			emitSettled(retry, { operationId });
		}
		return retry.response;
	};

	return fetcher;
}

export async function fetchWooQueryTotal(
	input: { request: QueryTotalWooRequest; signal?: AbortSignal },
	fetcher: EngineFetcher,
	wpJsonRoot: string
): Promise<number | null> {
	if (!isSyncCollectionName(input.request.endpoint)) return null;
	const mappedRoute = COLLECTION_VOCABULARY[input.request.endpoint].censusRoute;
	if (mappedRoute === null) return null;
	const url = new URL(mappedRoute, wpJsonRoot);
	for (const [key, value] of Object.entries(input.request.params)) {
		url.searchParams.set(key, String(value));
	}
	url.searchParams.set('page', '1');
	url.searchParams.set('per_page', '1');
	const rawResponse = await fetcher(
		url.toString(),
		input.signal !== undefined ? { signal: input.signal } : undefined
	);
	let transportState = envelopeTransportByFetcher.get(fetcher);
	if (!transportState) {
		transportState = { responseHeadersReadable: true };
		envelopeTransportByFetcher.set(fetcher, transportState);
	}
	const response = await hydrateResponse(rawResponse, {
		envelopeRequested: true,
		transportState,
		onDiagnostic: (kind) =>
			engineLogger.debug(`Response envelope metadata is ${kind}`, {
				context: {
					responseHeadersReadable: transportState.responseHeadersReadable,
				},
			}),
	});
	if (!response.ok) {
		throw new Error(`Query total request failed: ${response.status}`);
	}
	const rawTotal = response.headers.get(input.request.totalHeader);
	const total = rawTotal === null || rawTotal.trim() === '' ? Number.NaN : Number(rawTotal);
	if (!Number.isSafeInteger(total) || total < 0) {
		throw new Error(`Invalid ${input.request.totalHeader} response header`);
	}
	return total;
}
