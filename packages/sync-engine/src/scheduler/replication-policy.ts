import type { RemoteId } from '@wcpos/sync-core';

export type ReplicationMode = 'greedy' | 'windowed' | 'on-demand';

export type FetchTask = {
	id: string;
	requirementId: string;
	collection: string;
	queryKey: string;
	ids?: string[];
	/**
	 * Numeric Woo server ids for a targeted fetch — the only channel: targeted
	 * fetchers throw a contract error when it is missing/empty. Optional only because
	 * non-targeted (lane/query) tasks carry no ids.
	 */
	remoteIds?: RemoteId[];
	limit: number;
	priority: number;
	mode: ReplicationMode;
};

/** Preserve the task's total/window limit while capping each transport request. */
export function pullRequestLimit(task: FetchTask, configured?: () => number | undefined): number {
	return Math.min(task.limit, configured?.() ?? task.limit);
}

export type FetchTaskResult = {
	taskId: string;
	documentCount: number;
	requestCount: number;
	completed: boolean;
	/**
	 * Local docs tombstoned by a set-difference prune on a completed greedy
	 * refresh (deleted upstream, absent from the authoritative full set). Omitted
	 * by fetchers that don't prune. Surfaced so deletions aren't silent.
	 */
	prunedCount?: number;
};

export type SchedulerFetcherContext = { signal?: AbortSignal };

export type SchedulerFetcher = (
	task: FetchTask,
	context?: SchedulerFetcherContext
) => Promise<FetchTaskResult>;
