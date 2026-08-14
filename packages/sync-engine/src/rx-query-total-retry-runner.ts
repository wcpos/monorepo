import type {
	QueryTotalCacheEntry,
	QueryTotalRequestState,
	QueryTotalWooRequest,
} from './scheduler';

export type QueryTotalRetryRunnerStateRepository = {
	readRunnable(nowMs: number): Promise<QueryTotalRequestState[]>;
	claim(
		expectedState: QueryTotalRequestState,
		claimedState: QueryTotalRequestState
	): Promise<boolean>;
	markIdle(
		expectedState: QueryTotalRequestState,
		idleState: QueryTotalRequestState
	): Promise<boolean>;
	markFailed(
		expectedState: QueryTotalRequestState,
		failedState: QueryTotalRequestState
	): Promise<boolean>;
};

export type QueryTotalRetryRunnerCacheRepository = {
	readFresh(nowMs: number): Promise<QueryTotalCacheEntry[]>;
	upsert(entry: QueryTotalCacheEntry): Promise<void>;
};

export type QueryTotalRetryRunnerInput = {
	stateRepository: QueryTotalRetryRunnerStateRepository;
	cacheRepository: QueryTotalRetryRunnerCacheRepository;
	fetchWooQueryTotal(input: {
		request: QueryTotalWooRequest;
		signal?: AbortSignal;
	}): Promise<number | null>;
	signal?: AbortSignal;
	ownerId: string;
	nowMs: number;
	getNowMs?: () => number;
	leaseForMs: number;
	retryAfterMs: number;
	freshForMs: number | ((request: QueryTotalWooRequest) => number);
	maxRequests?: number;
	/** Run only this request and ignore its fresh cache entry. */
	forceQueryKey?: string;
};

export type QueryTotalRetryRunnerResult = {
	scanned: number;
	skippedFreshCache: number;
	skippedMissingRequest: number;
	claimLost: number;
	succeeded: number;
	unsupported: number;
	failed: number;
	cacheEntries: QueryTotalCacheEntry[];
};

function claimState(
	state: QueryTotalRequestState,
	input: QueryTotalRetryRunnerInput
): QueryTotalRequestState {
	return {
		...state,
		status: 'in-flight',
		ownerId: input.ownerId,
		claimedUntilMs: input.nowMs + input.leaseForMs,
		attempt: state.attempt + 1,
		retryAfterMs: null,
		updatedAtMs: input.nowMs,
	};
}

function failedState(
	state: QueryTotalRequestState,
	input: QueryTotalRetryRunnerInput,
	failedAtMs: number
): QueryTotalRequestState {
	return {
		...state,
		status: 'failed',
		ownerId: null,
		claimedUntilMs: null,
		retryAfterMs: failedAtMs + input.retryAfterMs,
		updatedAtMs: failedAtMs,
	};
}

function idleState(state: QueryTotalRequestState, nowMs: number): QueryTotalRequestState {
	return {
		...state,
		status: 'idle',
		ownerId: null,
		claimedUntilMs: null,
		retryAfterMs: null,
		updatedAtMs: nowMs,
	};
}

export async function runQueryTotalRetryRequests(
	input: QueryTotalRetryRunnerInput
): Promise<QueryTotalRetryRunnerResult> {
	let [runnableStates, freshCacheEntries] = await Promise.all([
		input.stateRepository.readRunnable(input.nowMs),
		input.cacheRepository.readFresh(input.nowMs),
	]);
	if (input.forceQueryKey !== undefined) {
		runnableStates = runnableStates.filter((state) => state.queryKey === input.forceQueryKey);
		freshCacheEntries = freshCacheEntries.filter((entry) => entry.queryKey !== input.forceQueryKey);
	}
	const freshCacheByQueryKey = new Map(freshCacheEntries.map((entry) => [entry.queryKey, entry]));
	const result: QueryTotalRetryRunnerResult = {
		scanned: runnableStates.length,
		skippedFreshCache: 0,
		skippedMissingRequest: 0,
		claimLost: 0,
		succeeded: 0,
		unsupported: 0,
		failed: 0,
		cacheEntries: [],
	};

	for (const runnableState of runnableStates) {
		if (input.signal?.aborted) break;
		if (result.succeeded + result.unsupported + result.failed >= (input.maxRequests ?? Infinity))
			break;
		const freshCacheEntry = freshCacheByQueryKey.get(runnableState.queryKey);
		if (freshCacheEntry) {
			await input.stateRepository.markIdle(runnableState, idleState(runnableState, input.nowMs));
			result.cacheEntries.push(freshCacheEntry);
			result.skippedFreshCache += 1;
			continue;
		}

		if (!runnableState.request) {
			result.skippedMissingRequest += 1;
			continue;
		}

		const claimedState = claimState(runnableState, input);
		const claimed = await input.stateRepository.claim(runnableState, claimedState);
		if (!claimed) {
			result.claimLost += 1;
			continue;
		}

		try {
			const totalMatchingRecords = await input.fetchWooQueryTotal({
				request: runnableState.request,
				...(input.signal !== undefined ? { signal: input.signal } : {}),
			});
			if (totalMatchingRecords === null) {
				await input.stateRepository.markIdle(claimedState, idleState(claimedState, input.nowMs));
				result.unsupported += 1;
				continue;
			}
			const freshForMs =
				typeof input.freshForMs === 'function'
					? input.freshForMs(runnableState.request)
					: input.freshForMs;
			const cacheEntry = {
				queryKey: runnableState.queryKey,
				totalMatchingRecords,
				freshUntilMs: input.nowMs + freshForMs,
				updatedAtMs: input.nowMs,
			};
			await input.cacheRepository.upsert(cacheEntry);
			await input.stateRepository.markIdle(claimedState, idleState(claimedState, input.nowMs));
			result.cacheEntries.push(cacheEntry);
			result.succeeded += 1;
		} catch {
			const failedAtMs = input.getNowMs?.() ?? input.nowMs;
			await input.stateRepository.markFailed(
				claimedState,
				failedState(claimedState, input, failedAtMs)
			);
			result.failed += 1;
		}
	}

	return result;
}
