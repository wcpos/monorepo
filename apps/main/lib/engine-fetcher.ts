import { COLLECTION_VOCABULARY } from '@wcpos/query';
import type { SyncEvent } from '@wcpos/sync-core';
import {
	type EngineFetcher,
	hydrateResponse,
	markTransportFailure,
	type QueryTotalWooRequest,
	type ResponseEnvelopeTransportState,
	type SyncCollectionName,
} from '@wcpos/sync-engine';
import { AppInfo } from '@wcpos/utils/app-info';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { buildRequestPreamble } from '@wcpos/utils/request-preamble';
import { INSTANCE_HEADER, sendsInstanceHeader } from '@wcpos/utils/sync-protocol';

import { evaluateClockSkew } from './clock-skew';
import { PERSISTENT_FAILURE_STREAK } from './sync-log-observer';
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

/**
 * Failing requests tracked at once. Each distinct request that is CURRENTLY
 * failing holds one entry; a few hundred covers every lane, page and search an
 * outage can leave failing, and the oldest is dropped past it so a long outage
 * of one-off searches cannot grow the map without bound.
 */
const MAX_TRACKED_FAILING_REQUESTS = 200;

/**
 * Per-fetcher streak of failed attempts at ONE logical request (method + URL,
 * query included). The lanes retry a failed request on their next tick, so one
 * 503 or one dropped connection is an attempt, not something to tell the
 * merchant about; the same request failing `PERSISTENT_FAILURE_STREAK` times
 * running is. Keyed by the full request, not the pathname: concurrent demand
 * and background requests to `/products` with different queries are different
 * operations, so one outage cannot count three of them as three retries, and a
 * healthy one cannot reset another that keeps failing. Per fetcher for the
 * same reason as the rate-limit streak above.
 */
function createFailureStreaks(): (key: string, failed: boolean) => number {
	const streaks = new Map<string, number>();
	return (key, failed) => {
		if (!failed) {
			streaks.delete(key);
			return 0;
		}
		const streak = (streaks.get(key) ?? 0) + 1;
		streaks.delete(key);
		streaks.set(key, streak);
		if (streaks.size > MAX_TRACKED_FAILING_REQUESTS) {
			const oldest = streaks.keys().next().value;
			if (oldest !== undefined) streaks.delete(oldest);
		}
		return streak;
	};
}

export type EngineFetcherAuth = {
	credentials: { getLatest: () => { access_token?: string } };
	refreshAuth?: (context?: { operationId?: string }) => Promise<string | null>;
	onAuthExhausted?: (token: string | null) => void;
	useJwtAsParam?: boolean;
	bareAuthParam?: boolean;
	/** These ride the same live-options ref as the auth flags: cache hits mutate it
	 * in place, so a probe-driven transport flip reaches the cached fetcher. */
	useRestRouteParam?: boolean;
	useCacheBuster?: boolean;
	useProtocolHeaders?: boolean;
	useInstanceHeader?: boolean;
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
	const failureStreak = createFailureStreaks();
	// Paths that have already answered 403 on this fetcher. A permission error is
	// a property of the session (a cashier role without that capability), not of
	// the tick, so it is reported at error ONCE per path and at info after that;
	// the fetcher is created per engine, so a new session starts clean (#1876).
	// A same-site cashier swap keeps the fetcher and replaces `auth.credentials`
	// in place, so the set is owned by the credentials object it was built for
	// and starts over when that object changes.
	const forbiddenPaths = new Set<string>();
	let forbiddenPathsOwner: unknown = input.auth.credentials;

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
		settle: (
			level: SyncEvent['level'],
			extraFields?: Record<string, unknown>,
			overrides?: { failed?: boolean }
		) => void;
	};

	/**
	 * Plain permalinks carry the REST route in ?rest_route= with pathname '/', so a
	 * push is classified from the route, not the path.
	 */
	const isPushRoute = (parsedUrl: URL): boolean =>
		(parsedUrl.searchParams.get('rest_route') ?? parsedUrl.pathname).split('/').includes('push');

	/** Execute one logical request arc, including any authentication retry. */
	const fetcher: EngineFetcher = async (url, init) => {
		const clockSkewGeneration = input.clockSkew.generation;
		let tokenUsed: string | undefined;
		const method = (init?.method ?? 'GET').toUpperCase();
		const requestPath = url.split(/[?#]/, 1)[0]?.replace(/\/+$/, '');
		const isRefreshRequest = requestPath?.endsWith('/auth/refresh') ?? false;
		const isTickProbe = requestPath?.endsWith('/changes/tick') ?? false;
		// The failure-streak key: one logical request, query included (see createFailureStreaks).
		const operationKey = `${method} ${url.split('#', 1)[0]}`;
		let isPushRequest = false;
		try {
			isPushRequest = isPushRoute(new URL(url));
		} catch {
			// An unparseable URL fails in the attempt below; it is not a push.
		}

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
			// Transport now uses resolveRestTransport (=== true); _layout.tsx resolves this flag to a strict boolean.
			const prepared = buildRequestPreamble(
				{
					purpose: 'sync',
					client: AppInfo,
					site: {
						use_jwt_as_param: input.auth.useJwtAsParam,
						use_rest_route_param: input.auth.useRestRouteParam,
						use_cache_buster: input.auth.useCacheBuster,
						use_protocol_headers: input.auth.useProtocolHeaders,
					},
					accessToken: token,
					storeId: input.scope?.storeId,
					wpJsonRoot: input.wpJsonRoot,
					bareAuthParam: input.auth.bareAuthParam ?? false,
				},
				{ url, method, headers: init?.headers }
			);
			const { headers } = prepared;
			if (!sendsInstanceHeader(AppInfo.platform, input.auth.useInstanceHeader)) {
				headers.delete(INSTANCE_HEADER);
			}
			const parsedUrl = new URL(prepared.url);
			const envelopeRequested = !isPushRoute(parsedUrl);
			if (envelopeRequested) {
				parsedUrl.searchParams.set('_wcpos_envelope', '1');
			}
			const finalUrl = parsedUrl.toString();
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
				const isNativeCancel =
					init?.signal?.aborted === true &&
					error instanceof Error &&
					/FetchRequestCanceledException|Fetch request has been canceled|UnexpectedException: cancelled|The operation was aborted/i.test(
						error.message
					);
				// Only rename what is not already an abort. A browser abort is a
				// DOMException whose message ALSO matches the pattern above and whose
				// `name` is a getter-only prototype accessor — assigning it throws on
				// Firefox ("setting getter-only property") and Safari ("Attempted to
				// assign to readonly property"), turning a cancelled search into a
				// SYNC321 failure (Sentry 2HK, 1.10.6–1.10.9).
				if (isNativeCancel && error.name !== 'AbortError') error.name = 'AbortError';
				const aborted = (error as { name?: unknown } | null)?.name === 'AbortError';
				// A push's failure is push.error's to report (attempt-counted); any
				// other path alarms only once it has failed several times running.
				// An abort is ours, so it neither counts nor resets the streak.
				const streak = aborted ? 0 : failureStreak(operationKey, true);
				input.emitTransport(
					{
						type: 'transport.request',
						level: !isPushRequest && streak >= PERSISTENT_FAILURE_STREAK ? 'warn' : 'info',
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
				// The row above reports this failure; a lane failing on the same
				// error must not report the incident a second time.
				if (!aborted) markTransportFailure(error);
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
									code: ERROR_CODES.CLOCK_OUT_OF_SYNC,
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
				settle: (level, extraFields, overrides) => {
					// A failure is what the merchant would recognise as one: warn or
					// error. Everything the rubric settles as info or debug — a 2xx, a
					// 304 conditional poll, a tick-probe 404 the change signal is built
					// to fall back from, an absorbed 401 whose retry then succeeded —
					// is a healthy request, not an amber hour. A caller may pin the bit
					// when the LOG level is quieter than the outcome (a repeated 403 is
					// still a failed request in the hourly metrics).
					recordTransport({
						atMs,
						durationMs,
						bytes,
						failed: overrides?.failed ?? (level === 'warn' || level === 'error'),
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
		 *  - 401 → warn: it reaches here only when no refresh arc ran (no refresh
		 *    port, or the refresh request itself), so nothing else reports it.
		 *  - any other push failure → info, still a failed request in the metrics: the
		 *    record-level events own every push verdict — push.error counts the
		 *    attempts, push.rejected / auto-reverted / the conflict rows settle the
		 *    rest. A warn here put a second coded row (a second SYNC221 action, a
		 *    second "ask the admin") on one record's incident.
		 *  - 429 → info, a failed request: cadence backoff absorbs bursts, and the
		 *    rate-limit streak above writes the one HOST161 warn when it persists.
		 *  - 403 → error: a permission error, never refreshed (the 1.9 row-14 rule);
		 *    it needs attention, not a refresh loop.
		 *  - non-push 409 → warn: no record event settles a pull's clash.
		 *  - anything else !ok (5xx, other 4xx, 426, an unexpected 1xx/3xx) → info
		 *    while it is an attempt the next tick retries, warn once the same path
		 *    has failed PERSISTENT_FAILURE_STREAK times running. A 426 refusal
		 *    latches the engine's update-required screen and error row on the first
		 *    reply, so its own requests never reach the streak.
		 */
		const emitSettled = (attempt: SettledAttempt, extraFields?: Record<string, unknown>): void => {
			const status = attempt.response.status;
			const healthy = attempt.response.ok || status === 304 || (status === 404 && isTickProbe);
			const streak = failureStreak(operationKey, !healthy);
			if (attempt.response.ok || status === 304) attempt.settle('info', extraFields);
			else if (status === 404 && isTickProbe)
				attempt.settle('debug', { outcome: 'recovered', ...extraFields });
			else if (status === 401) attempt.settle('warn', extraFields);
			else if (isPushRequest || status === 429)
				attempt.settle('info', extraFields, { failed: true });
			else if (status === 403) {
				if (forbiddenPathsOwner !== input.auth.credentials) {
					forbiddenPaths.clear();
					forbiddenPathsOwner = input.auth.credentials;
				}
				const forbiddenKey = requestPath ?? url;
				const repeat = forbiddenPaths.has(forbiddenKey);
				forbiddenPaths.add(forbiddenKey);
				// The repeat row is quiet, but the request still failed: keep the
				// hourly transport metric honest.
				attempt.settle(
					repeat ? 'info' : 'error',
					{ ...(repeat ? { outcome: 'forbidden-repeat' } : {}), ...extraFields },
					{ failed: true }
				);
			} else if (status === 409) attempt.settle('warn', extraFields);
			else if (streak >= PERSISTENT_FAILURE_STREAK) attempt.settle('warn', extraFields);
			else attempt.settle('info', extraFields, { failed: true });
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
			// The refresh itself failed hard — settle the attempt as a failed request
			// and let the refresh error propagate exactly as before. Info: the refresh
			// layer writes the verdict for it.
			first.settle('info', { outcome: 'failed', operationId }, { failed: true });
			throw error;
		}
		if (!retryToken) {
			// No fresh token. The refresh layer logs its own verdict ('Unable to
			// refresh session' — error when the refresh token is terminally rejected,
			// retried after a cooldown when the failure was transient), so this row
			// is an info request record, not a second "sign in again". Leave it
			// uncorrelated so repeated post-rejection 401s can collapse.
			first.settle('info', { outcome: 'failed' }, { failed: true });
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
			// A healthy answer ends this request's failure streak, refreshed or not.
			failureStreak(operationKey, false);
		} else if (retryStatus === 401) {
			// Still unauthorized after a refresh — bounded-refresh exhaustion; NOW
			// something is actually wrong and the user will need to re-authenticate.
			// onAuthExhausted writes that verdict (error + toast, once per token), so
			// the request row stays info; without a handler it is the only signal.
			first.settle('debug', { outcome: 'failed', operationId });
			retry.settle(
				input.auth.onAuthExhausted ? 'info' : 'error',
				{ operationId },
				{ failed: true }
			);
			input.auth.onAuthExhausted?.(tokenUsed ?? null);
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
