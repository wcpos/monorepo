/**
 * queryTotalRequestRunner — the query-total REQUEST LIFECYCLE, as one module.
 *
 * A filtered exact-limit order query can't trust its expected ids until a
 * query-specific Woo total exists. Getting that total is a small state
 * machine: consult the fresh cache → plan against the persisted request
 * states (another tab may own an in-flight request, a failure may be inside
 * its retry window) → claim or take over the durable request state under a
 * lease → fetch through the host's executor → persist + publish the cache
 * entry → release the state — with ABANDONMENT (the browser navigated away
 * from the query) able to land between any two of those steps, aborting the
 * fetch and cleaning up the claim without leaking it.
 *
 * That machine used to live inline in App.tsx (~240 lines across two
 * useCallbacks and three refs) — engine logic leaked into the host, testable
 * only by mounting the app. Now the module owns the machine and its state
 * (in-flight keys, active requests, abandoned tombstones), and the host
 * supplies only host-shaped seams: the database handle, the executor, the
 * diagnostics sink, and read/publish access to the UI's cache-entry state.
 * The pure PLANNER stays where it was (scheduler/queryTotalRequestLifecycle);
 * this module is the executor around it. The durable RETRY of failed states
 * is the mount kit's scan loop — same repositories, same lease discipline.
 */

import {
	type QueryTotalCacheDatabase,
	RxQueryTotalCacheRepository,
} from '../collections/rx-query-total-cache-repository';
import {
	type QueryTotalRequestStateDatabase,
	RxQueryTotalRequestStateRepository,
} from '../rx-query-total-request-state-repository';
import {
	planQueryTotalRequestLifecycle,
	type QueryTotalRequestState,
	sameQueryTotalRequestState,
} from './query-total-request-lifecycle';
import {
	QUERY_TOTAL_FRESH_FOR_MS,
	QUERY_TOTAL_LEASE_FOR_MS,
	QUERY_TOTAL_RETRY_AFTER_MS,
	type QueryTotalCacheEntry,
	type QueryTotalWooRequest,
} from './query-total-requests';

/** Structural: any database carrying both query-total collections. */
export type QueryTotalDatabase = QueryTotalCacheDatabase & QueryTotalRequestStateDatabase;

export type QueryTotalDiagnostic = { level: 'info' | 'error'; message: string; detail?: string };

export type QueryTotalRequestInput = {
	queryKey: string;
	filters: Record<string, string | number | boolean | null | undefined>;
};

export type QueryTotalRequestRunnerDeps = {
	/**
	 * Null until the database opens: the runner then plans against the
	 * in-memory cache only and claims no durable state — the same degraded
	 * behavior the inline App code had.
	 */
	database: QueryTotalDatabase | null;
	/** Lease owner recorded on claimed request states. */
	ownerId: string;
	/** The query-total endpoint (G4: the /orders proxy in OUR namespace, which passes X-WP-Total through). */
	endpoint: string;
	fetchWooQueryTotal: (input: {
		request: QueryTotalWooRequest;
		signal?: AbortSignal;
	}) => Promise<number>;
	onDiagnostic: (event: QueryTotalDiagnostic) => void;
	/** Read the host's CURRENT cache entries (the planner consults them). */
	readCacheEntries: () => QueryTotalCacheEntry[];
	/** Publish a functional update to the host's cache-entry state (UI + ref). */
	publishCacheEntries: (
		updater: (current: QueryTotalCacheEntry[]) => QueryTotalCacheEntry[]
	) => void;
	now?: () => number;
	isOffline?: () => boolean;
};

export type QueryTotalRequestRunner = {
	/** Kick one query-total request; a duplicate for an in-flight queryKey is a no-op. */
	request: (input: QueryTotalRequestInput) => void;
	/** The browser left the query: abort the in-flight fetch and clean up the claim. */
	abandon: (input: { queryKey: string }) => void;
};

/** Keep the freshest entry per queryKey. Exported: the host's hydration + retry-scan callbacks merge with it too. */
export function mergeQueryTotalCacheEntries(
	current: QueryTotalCacheEntry[],
	incoming: QueryTotalCacheEntry[]
): QueryTotalCacheEntry[] {
	const byQueryKey = new Map(current.map((entry) => [entry.queryKey, entry]));
	for (const entry of incoming) {
		const existing = byQueryKey.get(entry.queryKey);
		if (!existing || existing.updatedAtMs < entry.updatedAtMs) {
			byQueryKey.set(entry.queryKey, entry);
		}
	}
	return [...byQueryKey.values()];
}

function latestQueryTotalRequestState(
	states: QueryTotalRequestState[],
	queryKey: string
): QueryTotalRequestState | null {
	return (
		states
			.filter((state) => state.queryKey === queryKey)
			.sort((left, right) => right.updatedAtMs - left.updatedAtMs)[0] ?? null
	);
}

type ActiveQueryTotalRequest = {
	state: QueryTotalRequestState | null;
	abandoned: boolean;
	abortController: AbortController | null;
};

function describeUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function diagnosticDetail(error: unknown): string | undefined {
	if (error instanceof Error) return error.stack ?? error.message;
	return typeof error === 'undefined' ? undefined : String(error);
}

function defaultIsOffline(): boolean {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function createQueryTotalRequestRunner(
	deps: QueryTotalRequestRunnerDeps
): QueryTotalRequestRunner {
	const now = deps.now ?? (() => Date.now());
	const isOffline = deps.isOffline ?? defaultIsOffline;
	const inFlightKeys = new Set<string>();
	const activeRequests = new Map<string, ActiveQueryTotalRequest>();
	/** Tombstones for states we removed on abandonment, so a re-request doesn't trust the stale read. */
	const abandonedStates = new Map<string, QueryTotalRequestState>();
	const info = (message: string) => deps.onDiagnostic({ level: 'info', message });
	const fail = (message: string, error: unknown) =>
		deps.onDiagnostic({
			level: 'error',
			message: `${message}: ${describeUnknown(error)}`,
			detail: diagnosticDetail(error),
		});

	const request = (input: QueryTotalRequestInput): void => {
		const { database } = deps;
		const nowMs = now();
		const requestStateRepository = database
			? new RxQueryTotalRequestStateRepository(database)
			: null;

		if (inFlightKeys.has(input.queryKey)) {
			info(`Waiting for in-flight Woo query total for ${input.queryKey}`);
			return;
		}

		inFlightKeys.add(input.queryKey);
		const activeRequest: ActiveQueryTotalRequest = {
			state: null,
			abandoned: false,
			abortController: typeof AbortController === 'undefined' ? null : new AbortController(),
		};
		activeRequests.set(input.queryKey, activeRequest);

		void (async () => {
			try {
				let cacheEntries = deps.readCacheEntries();
				if (database) {
					try {
						const freshEntries = await new RxQueryTotalCacheRepository(database).readFresh(nowMs);
						if (freshEntries.length > 0) {
							// Local snapshot for THIS plan, functional merge for the shared state —
							// a concurrent request's publish between our read and this update is
							// merged with, never clobbered by a stale snapshot.
							cacheEntries = mergeQueryTotalCacheEntries(deps.readCacheEntries(), freshEntries);
							deps.publishCacheEntries((current) =>
								mergeQueryTotalCacheEntries(current, freshEntries)
							);
						}
					} catch (error: unknown) {
						fail('Query total cache read failed', error);
					}
				}

				const persistedRequestStates = requestStateRepository
					? await requestStateRepository.readForQueryKeys([input.queryKey])
					: [];
				const abandonedRequestState = abandonedStates.get(input.queryKey);
				const requestStates = abandonedRequestState
					? persistedRequestStates.filter(
							(state) => !sameQueryTotalRequestState(state, abandonedRequestState)
						)
					: persistedRequestStates;
				const latestRequestState = latestQueryTotalRequestState(requestStates, input.queryKey);
				const decision = planQueryTotalRequestLifecycle({
					discovery: {
						queryKey: input.queryKey,
						action: 'request-query-total',
						reason:
							'filtered exact-limit query needs a query-specific Woo total before expected ids are trusted',
						complete: false,
						shouldRequestQueryTotal: true,
						totalMatchingRecords: null,
					},
					connectivity: isOffline() ? 'offline' : 'online',
					nowMs,
					ownerId: deps.ownerId,
					endpoint: deps.endpoint,
					filters: input.filters,
					cacheEntries,
					requestStates,
				});

				if (decision.action === 'use-cached-total') {
					info(
						`Using cached Woo query total for ${decision.queryKey}: ${decision.totalMatchingRecords}`
					);
					return;
				}
				if (decision.action === 'wait-for-owner') {
					info(`Waiting for in-flight Woo query total for ${decision.queryKey}`);
					return;
				}
				if (decision.action === 'wait-for-retry') {
					info(`Waiting for Woo query total retry for ${decision.queryKey}`);
					return;
				}
				if (decision.action === 'skip-offline') {
					info(`Skipped Woo query total for ${decision.queryKey}: offline`);
					return;
				}
				if (!decision.request) return;

				const requestState: QueryTotalRequestState = {
					queryKey: decision.queryKey,
					status: 'in-flight',
					ownerId: deps.ownerId,
					claimedUntilMs: nowMs + QUERY_TOTAL_LEASE_FOR_MS,
					attempt: decision.nextAttempt ?? 1,
					retryAfterMs: null,
					updatedAtMs: nowMs,
					request: decision.request,
				};
				activeRequest.state = requestState;

				info(`Requesting Woo query total for ${decision.queryKey}`);

				const writeFailedState = (failedAtMs: number) => {
					const failedState: QueryTotalRequestState = {
						...requestState,
						status: 'failed',
						ownerId: null,
						claimedUntilMs: null,
						retryAfterMs: failedAtMs + QUERY_TOTAL_RETRY_AFTER_MS,
						updatedAtMs: failedAtMs,
					};
					requestStateRepository
						?.markFailed(requestState, failedState)
						.catch((stateError: unknown) => {
							fail(
								`Query total request failure state write failed for ${decision.queryKey}`,
								stateError
							);
						});
				};

				const cleanupAbandonedRequestState = async () => {
					if (!requestStateRepository) return;
					try {
						await requestStateRepository.remove(requestState);
					} catch (error: unknown) {
						fail(`Query total abandoned state cleanup failed for ${decision.queryKey}`, error);
					}
				};

				if (activeRequest.abandoned) {
					return;
				}

				try {
					let acquired = true;
					if (requestStateRepository) {
						if (decision.action === 'take-over-request' || latestRequestState) {
							acquired = latestRequestState
								? await requestStateRepository.claim(latestRequestState, requestState)
								: false;
						} else {
							acquired = await requestStateRepository.claimNew(requestState);
						}
					}
					if (!acquired) {
						info(`Waiting for in-flight Woo query total for ${decision.queryKey}`);
						return;
					}
				} catch (error: unknown) {
					fail(`Query total request state claim failed for ${decision.queryKey}`, error);
					return;
				}

				if (activeRequest.abandoned) {
					await cleanupAbandonedRequestState();
					return;
				}

				let totalMatchingRecords: number;
				try {
					totalMatchingRecords = await deps.fetchWooQueryTotal({
						request: decision.request,
						signal: activeRequest.abortController?.signal,
					});
				} catch (error: unknown) {
					if (activeRequest.abandoned) return;
					writeFailedState(now());
					fail(`Woo query total failed for ${decision.queryKey}`, error);
					return;
				}

				if (activeRequest.abandoned) return;

				const updatedAtMs = now();
				const cacheEntry: QueryTotalCacheEntry = {
					queryKey: decision.queryKey,
					totalMatchingRecords,
					freshUntilMs: updatedAtMs + QUERY_TOTAL_FRESH_FOR_MS,
					updatedAtMs,
				};

				if (database) {
					const repository = new RxQueryTotalCacheRepository(database);
					try {
						if (activeRequest.abandoned) return;
						await repository.upsert(cacheEntry);
					} catch (error: unknown) {
						if (activeRequest.abandoned) return;
						writeFailedState(now());
						fail(`Query total cache write failed for ${decision.queryKey}`, error);
						return;
					}
				}

				if (activeRequest.abandoned) return;

				deps.publishCacheEntries((current) => [
					...current.filter((entry) => entry.queryKey !== cacheEntry.queryKey),
					cacheEntry,
				]);

				await requestStateRepository?.remove(requestState).catch((error: unknown) => {
					fail(`Query total request state cleanup failed for ${decision.queryKey}`, error);
				});
				info(`Cached Woo query total for ${decision.queryKey}: ${totalMatchingRecords}`);
			} catch (error: unknown) {
				fail(`Query total request state read failed for ${input.queryKey}`, error);
			} finally {
				if (activeRequests.get(input.queryKey) === activeRequest) {
					activeRequests.delete(input.queryKey);
					inFlightKeys.delete(input.queryKey);
				}
			}
		})();
	};

	const abandon = (input: { queryKey: string }): void => {
		const { database } = deps;
		const activeRequest = activeRequests.get(input.queryKey);
		if (!activeRequest || activeRequest.abandoned) return;

		activeRequest.abandoned = true;
		activeRequest.abortController?.abort();
		const releaseAbandonedRequest = () => {
			if (activeRequests.get(input.queryKey) === activeRequest) {
				activeRequests.delete(input.queryKey);
				inFlightKeys.delete(input.queryKey);
			}
		};

		if (!activeRequest.state || !database) {
			releaseAbandonedRequest();
			return;
		}

		abandonedStates.set(input.queryKey, activeRequest.state);
		const requestStateRepository = new RxQueryTotalRequestStateRepository(database);
		requestStateRepository
			.remove(activeRequest.state)
			.catch((error: unknown) => {
				fail(`Query total abandoned state cleanup failed for ${input.queryKey}`, error);
			})
			.finally(() => {
				const abandonedState = abandonedStates.get(input.queryKey);
				if (
					abandonedState &&
					activeRequest.state &&
					sameQueryTotalRequestState(abandonedState, activeRequest.state)
				) {
					abandonedStates.delete(input.queryKey);
				}
				releaseAbandonedRequest();
			});
	};

	return { request, abandon };
}
