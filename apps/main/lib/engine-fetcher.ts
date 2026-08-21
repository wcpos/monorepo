import { COLLECTION_VOCABULARY } from '@wcpos/query';
import type { SyncEvent } from '@wcpos/sync-core';
import {
	type EngineFetcher,
	hydrateResponse,
	type QueryTotalWooRequest,
	type ResponseEnvelopeTransportState,
	type SyncCollectionName,
} from '@wcpos/sync-engine';
import { formatAuthorizationParam } from '@wcpos/utils/auth-param';
import { getLogger } from '@wcpos/utils/logger';

import { evaluateClockSkew } from './clock-skew';
import {
	collectionFromSyncUrl,
	getMetricsEpoch,
	recordServerLoad,
	recordTransport,
} from './metrics';

const engineLogger = getLogger(['wcpos', 'sync', 'engine']);
const envelopeTransportByFetcher = new WeakMap<EngineFetcher, ResponseEnvelopeTransportState>();

export type EngineFetcherAuth = {
	credentials: { getLatest: () => { access_token?: string } };
	refreshAuth?: (context?: { operationId?: string }) => Promise<string | null>;
	useJwtAsParam?: boolean;
	bareAuthParam?: boolean;
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

export function createEngineFetcher(input: {
	auth: EngineFetcherAuth;
	clockSkew: ClockSkewGate;
	emitTransport: (event: SyncEvent, durable?: boolean) => void;
	/** Mutated in place by the scope lifecycle; read per attempt, never captured. */
	scope?: EngineFetcherScope;
	fetch?: typeof globalThis.fetch;
	now?: () => number;
}): EngineFetcher {
	const now = input.now ?? Date.now;

	// One logical request = one arc. When a 401 enters the refresh path, the arc's
	// rows — the absorbed attempt, the refresh layer's "Session renewed
	// automatically" breadcrumb, and the retry — share this id so the ledger can
	// chain attempt → refresh → success (#899). Minted per ARC only: a synthetic id
	// on every row would defeat repeat-collapse (see the observer's operationId note).
	const mintOperationId = (now: () => number): string =>
		`auth-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

	type SettledAttempt = {
		response: Response;
		/** Emit this attempt's transport row with the level the SETTLED arc decided. */
		emit: (level: SyncEvent['level'], extraFields?: Record<string, unknown>) => void;
	};

	const fetcher: EngineFetcher = async (url, init) => {
		const clockSkewGeneration = input.clockSkew.generation;
		let tokenUsed: string | undefined;
		const method = (init?.method ?? 'GET').toUpperCase();
		const requestPath = url.split(/[?#]/, 1)[0]?.replace(/\/+$/, '');
		const isRefreshRequest = requestPath?.endsWith('/auth/refresh') ?? false;
		const isTickProbe = requestPath?.endsWith('/changes/tick') ?? false;

		// Performs one attempt. Metrics (recordTransport, server load) are recorded
		// immediately, but the LOG emit is returned to the caller instead of fired
		// here: a log level is a promise about how the operation ended, and inside a
		// refresh arc the ending is not known yet (#899). The network-failure path
		// still emits inline — a thrown fetch has no arc to wait for.
		const performAttempt = async (arcFields?: Record<string, unknown>): Promise<SettledAttempt> => {
			const token = input.auth.credentials.getLatest().access_token;
			tokenUsed = token;
			const headers = new Headers(init?.headers ?? {});
			// The WCPOS REST namespaces only construct for POS-flagged requests
			// (woocommerce_pos_request()) — without this header every sync route
			// answers rest_no_route and the engine stays degraded-empty.
			headers.set('X-WCPOS', '1');
			// Re-read per attempt: a store switch that lands between the absorbed 401
			// and its retry must send the retry under the NEW scope, never the old one.
			const storeScope = normalizeStoreScope(input.scope?.storeId);
			if (storeScope !== null) {
				headers.set(STORE_SCOPE_HEADER, storeScope);
			} else {
				// An unscoped engine must not inherit a stale header from init.
				headers.delete(STORE_SCOPE_HEADER);
			}
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
					(error as { name?: unknown } | null)?.name !== 'AbortError'
				);
				recordTransport({
					atMs,
					durationMs,
					bytes: 0,
					ok: false,
					epoch: epochAtStart,
				});
				throw error;
			}

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
			// 304 is the conditional-GET success path (idle sequence-log polls answer
			// If-None-Match with Not Modified every tick) — Response.ok is false for it,
			// but logging it as a failure would record ~360 phantom errors/hour per idle
			// terminal and corrupt the transport health counters.
			const accepted = response.ok || response.status === 304;
			recordTransport({
				atMs,
				durationMs,
				bytes,
				ok: accepted,
				epoch: epochAtStart,
			});

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
				emit: (level, extraFields) =>
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
					}),
			};
		};

		// The settled classification for an attempt whose arc ends with it (#899
		// rubric — the level reflects how the operation ended):
		//  - 2xx/304 → info (successes are metrics-only; the observer drops them).
		//  - tick-probe 404 → debug + outcome 'recovered': the hybrid change signal
		//    latches tick-unsupported and falls back to sequence-log polling BY
		//    CONSTRUCTION (its TIER 1 poll is unconditional), so this is a designed
		//    self-healing downgrade, not a fault worth a warn in the merchant's log.
		//  - 403 → error: a permission error, never refreshed (the 1.9 row-14 rule);
		//    it needs attention, not a refresh loop.
		//  - anything else !ok → warn (will need attention if it persists).
		const emitSettled = (attempt: SettledAttempt, extraFields?: Record<string, unknown>): void => {
			const status = attempt.response.status;
			if (attempt.response.ok || status === 304) attempt.emit('info', extraFields);
			else if (status === 404 && isTickProbe)
				attempt.emit('debug', { outcome: 'recovered', ...extraFields });
			else if (status === 403) attempt.emit('error', extraFields);
			else attempt.emit('warn', extraFields);
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
			first.emit('warn', { outcome: 'failed', operationId });
			throw error;
		}
		if (!retryToken) {
			// No fresh token. The refresh layer logs its own verdict ('Unable to
			// refresh session' — error when the refresh token is terminally rejected),
			// so this row records the request-level failure without double-escalating.
			// Leave it uncorrelated so repeated post-rejection 401s can collapse.
			first.emit('warn', { outcome: 'failed' });
			return first.response;
		}

		let retry: SettledAttempt;
		try {
			retry = await performAttempt({ operationId });
		} catch (error) {
			// The retry never settled (the network fell over mid-arc). Its thrown path
			// already emitted a status-0 warn row carrying the arc id; the absorbed 401
			// stays forensic.
			first.emit('debug', { outcome: 'failed', operationId });
			throw error;
		}
		const retryStatus = retry.response.status;
		if (retry.response.ok || retryStatus === 304) {
			// The healthy cycle: the 401 was just a stale token. Both attempts become
			// forensic debug rows (visible under verbose diagnostics, chained by the
			// arc id); the user-facing narrative is the single 'Session renewed
			// automatically' info row the refresh layer writes.
			first.emit('debug', { outcome: 'recovered', operationId });
			retry.emit('debug', { operationId });
		} else if (retryStatus === 401) {
			// Still unauthorized after a refresh — bounded-refresh exhaustion; NOW
			// something is actually wrong and the user will need to re-authenticate.
			first.emit('debug', { outcome: 'failed', operationId });
			retry.emit('error', { operationId });
		} else {
			// The 401 was cured but the retry hit a different failure — classify that
			// failure on its own terms, keeping the arc id for the chain.
			first.emit('debug', { outcome: 'recovered', operationId });
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
