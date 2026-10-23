/**
 * The engine transport: the one path every engine request takes, one instance per
 * engine. It owns the protocol-gate latch, the instance header, response-envelope
 * hydration, the server-pressure observation, and each request's ONE deadline
 * layer with its lane label and deadline streak. A lane is a label on a request,
 * never a layer around it: a lane that needs a shorter deadline passes
 * `deadlineMs` instead of wrapping the request in a timer of its own.
 */
import type { SyncObserver } from '@wcpos/sync-core';

import { createFailureStreak, type FailureStreak } from '../failure-streak';
import { RequestTimeoutError, withRequestTimeout } from './request-timeout';
import { parseUpdateRequiredBody } from '../update-required';
import {
	parseRetryAfterMs,
	parseServerLoad1m,
	parseServerPressure,
	type ServerPressure,
	type ServerPressureMonitor,
	type ServerPressureTransition,
} from '../change-signal/server-pressure';
import { hydrateResponse, type ResponseEnvelopeTransportState } from './response-envelope';

import type {
	EngineConnectivity,
	EngineFetcher,
	RxdbSyncEnginePorts,
} from '../create-rxdb-sync-engine';
import type { EngineTimers } from '../engine-timers';
import type { EngineLaneName } from '../maintenance/lane-registry';
/**
 * How long an in-flight request must have been running before a cancellation is
 * read as the SERVER failing to answer rather than the app changing its mind.
 * Matches the barcode lookup's own deadline (the fastest deadline any caller
 * imposes on hostTransport) and is five times the sustained-slowness threshold.
 */
const ABORT_AS_TIMEOUT_AFTER_MS = 10_000;
// Allow slow paged pulls, but release a black-holed lane within a cashier-sized wait.
const ENGINE_REQUEST_DEADLINE_MS = 60_000;

/** A lane's request: the engine transport with the lane's label already applied. */
export type EngineRequest = (
	url: string,
	init?: RequestInit,
	options?: { deadlineMs?: number }
) => Promise<Response>;

type EngineTransport = {
	/** `lane` labels the deadline row (default 'host-transport'); `deadlineMs`
	 * replaces the 60 s default and stays the request's only deadline. */
	request(
		url: string,
		init?: RequestInit,
		options?: {
			lane?: EngineLaneName | 'host-transport' | 'require' | 'conflict-resolution';
			deadlineMs?: number;
		}
	): Promise<Response>;
	/** True once the protocol-gate latch is set: every request is a local replay of the refusal. */
	updateRequired(): boolean;
	/** Drops every deadline streak: they belong to the outgoing scope. */
	scopeActivated(): void;
};

export function createEngineTransport(deps: {
	fetcher: EngineFetcher;
	pressure: ServerPressureMonitor;
	getInstanceId?: RxdbSyncEnginePorts['getInstanceId'];
	onUpdateRequired?: RxdbSyncEnginePorts['onUpdateRequired'];
	diagnostics: SyncObserver;
	now: () => number;
	timers: EngineTimers;
	connectivity: () => EngineConnectivity;
	onPressureTransition: (transition: ServerPressureTransition) => void;
	onPressureReadoutChanged: () => void;
}): EngineTransport {
	const { now: nowMs, timers, diagnostics, connectivity: readConnectivity } = deps;
	const serverPressure = deps.pressure;
	const responseEnvelopeTransport: ResponseEnvelopeTransportState = {
		responseHeadersReadable: true,
	};
	const rawFetcher: EngineFetcher = deps.fetcher;
	// The protocol-gate latch (wcpos/woocommerce-pos#1752). Instance state on
	// purpose: a fresh engine (restart, reload, reconnect) always re-probes, and
	// the latch never leaks across sites the way module state would (the same
	// trap as runtime 429 counters). Once set, every lane sees a local replay of
	// the refusal — uniform downstream error handling, zero network.
	let updateRequiredRefusal: { status: number; body: string } | null = null;
	const createRequestObservation = (callerSignal?: AbortSignal | null) => {
		const startedAtMs = nowMs();
		let observed = false;
		// The age that decides whether an abort was a timeout is measured at the ABORT, not at
		// the moment a transport that ignored the signal finally rejects (which can be at the
		// deadline, long after a young cancellation).
		let abortedAtMs: number | null = callerSignal?.aborted ? nowMs() : null;
		const onAbort = () => {
			abortedAtMs ??= nowMs();
		};
		callerSignal?.addEventListener('abort', onAbort, { once: true });
		// A lane signal is reused across many requests; drop the listener when this one ends.
		const release = () => callerSignal?.removeEventListener('abort', onAbort);
		const abortAgeMs = () => (abortedAtMs ?? nowMs()) - startedAtMs;
		const observe = (
			status: number,
			retryAfter?: string | null,
			pressure?: ServerPressure,
			serverLoad1m?: number
		): void => {
			if (observed) return;
			observed = true;
			const atMs = nowMs();
			const reportedBefore = serverPressure.reported();
			const signalBefore = serverPressure.signal();
			const transition = serverPressure.observe({
				atMs,
				status,
				durationMs: atMs - startedAtMs,
				offline: readConnectivity() === 'offline',
				...(retryAfter === undefined ? {} : { retryAfter }),
				...(pressure === undefined ? {} : { pressure }),
				...(serverLoad1m === undefined ? {} : { serverLoad1m }),
			});
			if (transition !== null) deps.onPressureTransition(transition);
			// A header that moved without crossing a back-off threshold, or a
			// signal re-labelled at the ladder's ceiling, changes the status
			// read-out without a transition; subscribers were promised a snapshot
			// when status changes, so tell them.
			if (
				serverPressure.reported() !== reportedBefore ||
				serverPressure.signal() !== signalBefore
			) {
				deps.onPressureReadoutChanged();
			}
		};
		return { observe, abortAgeMs, release };
	};
	const transportFetcher = async (
		url: string,
		init: RequestInit | undefined,
		{ observe, abortAgeMs }: ReturnType<typeof createRequestObservation>
	) => {
		if (updateRequiredRefusal !== null) {
			return new Response(updateRequiredRefusal.body, {
				status: updateRequiredRefusal.status,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		const headers = new Headers(init?.headers);
		const installId = await deps.getInstanceId?.();
		if (installId !== undefined || headers.has('X-WCPOS-Instance')) {
			headers.delete('X-WCPOS-Instance');
			if (installId !== undefined) headers.set('X-WCPOS-Instance', installId);
			init = { ...init, headers };
		}
		let response: Response;
		try {
			response = await rawFetcher(url, init);
		} catch (error) {
			// Aborts are ambiguous, and BOTH readings are real:
			//  - a scope switch, disposal or superseded search cancels in-flight work,
			//    often several requests at once — counting those would invent a
			//    three-strike burst out of nothing and hand the incoming scope a
			//    phantom back-off;
			//  - a deadline abort (the barcode lookup gives the server 10s before it
			//    gives up, via hostTransport's fetcher) means the server genuinely
			//    never answered, which is exactly the timeout signal we want.
			// The honest discriminator is not WHO pulled the plug but HOW LONG the
			// request had already been running: a cancellation that young says nothing
			// about the server, while a request still unanswered after the barcode
			// deadline was not going to be answered promptly whoever cancelled it.
			// Everything else that throws here (network timeout, DNS, TLS, connection
			// reset) is an unambiguous transport failure and reports as status 0, the
			// spelling the rest of the stack uses (see apps/main transport.request).
			// Detect the abort from the signal as well as the name: expo's native
			// fetch rejects an aborted request with a plain Error wrapping
			// FetchRequestCanceledException, never an AbortError (#1672), and the
			// engine must not depend on the host's fetcher renaming it first.
			const aborted =
				(error as { name?: unknown } | null)?.name === 'AbortError' ||
				init?.signal?.aborted === true;
			const abortedYoung = aborted && abortAgeMs() < ABORT_AS_TIMEOUT_AFTER_MS;
			if (!abortedYoung) observe(0);
			throw error;
		}
		// Plain permalinks carry the REST route in ?rest_route= with pathname '/',
		// so the push exemption must classify from the route, not the path.
		const requestRoute = (() => {
			try {
				const parsed = new URL(url);
				return parsed.searchParams.get('rest_route') ?? parsed.pathname;
			} catch {
				return url.split(/[?#]/, 1)[0] ?? '';
			}
		})();
		response = await hydrateResponse(response, {
			envelopeRequested: !requestRoute.split('/').includes('push'),
			signal: init?.signal,
			transportState: responseEnvelopeTransport,
			onDiagnostic: (kind) =>
				diagnostics({
					type: 'transport.request',
					level: 'debug',
					message: `Response envelope metadata is ${kind}`,
					fields: {
						status: response.status,
						responseHeadersReadable: responseEnvelopeTransport.responseHeadersReadable,
					},
				}),
		});
		let retryAfter: string | null = null;
		let pressure: ServerPressure | undefined;
		let serverLoad1m: number | undefined;
		try {
			retryAfter = response.headers.get('retry-after');
			pressure = parseServerPressure(response.headers.get('x-wcpos-pressure'));
			serverLoad1m = parseServerLoad1m(response.headers.get('x-server-load'));
		} catch {
			// A host fetch stub may hand back a header-less object; never let
			// telemetry break a real response.
		}
		// clone() first: on an unhydrated response (push lane) it leaves the real
		// body untouched downstream. On a hydrated response the original body is
		// already consumed and clone() throws, so the proxy's memoized json() is
		// the safe read.
		let body: unknown;
		let cloned: Response | null = null;
		try {
			cloned = response.clone();
		} catch {
			cloned = null;
		}
		try {
			body = cloned ? await cloned.json() : await response.json();
		} catch {
			body = undefined;
		}
		// B10 (wcpos-infra#72): hostile hosts strip Access-Control-Expose-Headers,
		// blinding web clients to Retry-After even when the wire carries it. The
		// plugin mirrors the delay into the error body as data.retry_after_seconds
		// (free#1649) — read it only when the header is absent or unparseable, so
		// a readable, valid header always wins on disagreement.
		if (response.status >= 400) {
			if (parseRetryAfterMs(retryAfter, nowMs()) === null) {
				const seconds = (body as { data?: { retry_after_seconds?: unknown } } | null | undefined)
					?.data?.retry_after_seconds;
				if (typeof seconds === 'number' && Number.isSafeInteger(seconds) && seconds >= 0) {
					retryAfter = String(seconds);
				}
			}
		}
		// The deliberate upgrade refusal is keyed on the body code; status is
		// advisory because middleboxes may rewrite it. The null re-check keeps
		// latch-and-notify exactly-once for concurrent in-flight refusals.
		const refusal = parseUpdateRequiredBody(body);
		if (refusal !== null && updateRequiredRefusal === null) {
			updateRequiredRefusal = { status: response.status, body: JSON.stringify(body) };
			deps.onUpdateRequired?.({ ...refusal, status: response.status });
		}
		observe(response.status, retryAfter, pressure, serverLoad1m);
		return response;
	};
	// Deadlines in a row per lane, stamped on engine.request.deadline: one slow
	// answer is retried by the next tick, so the log alarms only on a streak.
	// Keyed by lane AND request path (query stripped): a lane issues several
	// requests, and a healthy `/changes/tick` probe must not reset the streak of
	// a `/changes/sequence-log` that keeps timing out beside it. Any answer on
	// that path — whatever its status — ends its streak. Like the lane streaks,
	// the instances are dropped on every scope activation (see the 'switched'
	// handler) and each request settles the instance it started with.
	const consecutiveDeadlines = new Map<string, FailureStreak>();
	const deadlineStreakFor = (lane: string, url: string): FailureStreak => {
		const key = `${lane} ${url.split(/[?#]/, 1)[0] ?? url}`;
		let streak = consecutiveDeadlines.get(key);
		if (streak === undefined) {
			streak = createFailureStreak();
			consecutiveDeadlines.set(key, streak);
		}
		return streak;
	};
	const observeDeadline = async <T>(
		request: (observation: ReturnType<typeof createRequestObservation>) => Promise<T>,
		lane: string,
		url: string,
		callerSignal?: AbortSignal | null
	) => {
		const observation = createRequestObservation(callerSignal);
		const startedAtMs = nowMs();
		const deadlineStreak = deadlineStreakFor(lane, url);
		try {
			const answered = await request(observation);
			deadlineStreak.reset();
			return answered;
		} catch (error) {
			if (error instanceof RequestTimeoutError) {
				observation.observe(0);
				diagnostics({
					type: 'engine.request.deadline',
					level: 'warn',
					fields: {
						lane,
						elapsedMs: nowMs() - startedAtMs,
						consecutiveDeadlines: deadlineStreak.fail(),
					},
				});
			}
			throw error;
		} finally {
			observation.release();
		}
	};
	const request: EngineTransport['request'] = (
		url,
		init,
		{ lane = 'host-transport', deadlineMs = ENGINE_REQUEST_DEADLINE_MS } = {}
	) =>
		observeDeadline(
			(observation) =>
				withRequestTimeout(
					(url, init) => transportFetcher(url, init, observation),
					deadlineMs,
					timers
				)(url, { ...init, signal: init?.signal ?? undefined }),
			lane,
			url,
			init?.signal
		);
	return {
		request,
		updateRequired: () => updateRequiredRefusal !== null,
		scopeActivated: () => consecutiveDeadlines.clear(),
	};
}
