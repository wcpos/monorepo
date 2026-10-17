import Bottleneck from 'bottleneck';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { requestStateManager } from './request-state-manager';

const httpLogger = getLogger(['wcpos', 'http', 'queue']);

/**
 * How long one overflow burst is collected before it is reported. Bottleneck's
 * BLOCK strategy drops the whole backlog at once, then keeps dropping new
 * requests for its 5 s penalty; one row per second of that counts every request
 * that was lost without a row per request.
 */
const OVERFLOW_BURST_MS = 1000;

/** How many distinct requests a burst row names; the rest are only counted. */
const OVERFLOW_BURST_SAMPLE = 10;

/**
 * The error a dropped request rejects with. Callers skip their own per-request
 * failure row for it, because the burst row below already reports the drop
 * under its real code (CLIENT131) instead of an uncoded CLIENT999 each.
 */
export const isDroppedRequestError = (error: unknown): boolean =>
	error instanceof Bottleneck.BottleneckError;

type DropReason = 'overflow' | 'stale-after-wake';
const dropBursts = new Map<DropReason, string[]>();

const reportBurst = (reason: DropReason) => {
	const requests = dropBursts.get(reason) ?? [];
	dropBursts.delete(reason);
	const context = {
		reason,
		droppedCount: requests.length,
		requests: [...new Set(requests)].slice(0, OVERFLOW_BURST_SAMPLE),
	};
	if (reason === 'overflow') {
		httpLogger.error('Too many requests queued - please wait', {
			showToast: true,
			code: ERROR_CODES.REQUEST_QUEUE_OVERFLOW,
			context,
		});
	} else {
		// Dropping the backlog on wake is deliberate housekeeping, so no toast;
		// the row still names what was dropped in case one of them mattered.
		httpLogger.warn('Dropped requests queued while the app was asleep', {
			code: ERROR_CODES.REQUEST_QUEUE_OVERFLOW,
			context,
		});
	}
};

const reportDroppedRequest = (reason: DropReason, request: unknown) => {
	const requests = dropBursts.get(reason);
	if (requests) {
		requests.push(String(request ?? 'unknown'));
		return;
	}
	dropBursts.set(reason, [String(request ?? 'unknown')]);
	setTimeout(() => reportBurst(reason), OVERFLOW_BURST_MS);
};

const createQueue = (): Bottleneck => {
	const queue = new Bottleneck({
		maxConcurrent: 10,
		highWater: 50,
		strategy: Bottleneck.strategy.BLOCK,
	});
	// An overflow surfaces as 'dropped', never 'error' ('error' is reserved for
	// Bottleneck's own datastore faults), so this is where CLIENT131 belongs.
	queue.on('dropped', ({ args }) => {
		reportDroppedRequest(queue === globalQueue ? 'overflow' : 'stale-after-wake', args[0]);
	});
	queue.on('error', (error) => {
		httpLogger.error('Request queue failed', {
			code: ERROR_CODES.UNEXPECTED_ERROR,
			context: { error: error instanceof Error ? error.message : String(error) },
		});
	});
	queue.on('failed', async (error, jobInfo) => {
		// Debug only - individual request failures are handled by error handlers
		httpLogger.debug('Request failed in queue', {
			context: {
				error: error instanceof Error ? error.message : String(error),
				retryCount: jobInfo.retryCount,
			},
		});
	});
	return queue;
};

/**
 * Global request queue shared across all HTTP client instances.
 * This ensures coordinated rate limiting and allows pause/resume functionality.
 */
let globalQueue = createQueue();

/**
 * Clear all pending requests from the queue.
 * Used when waking from sleep to prevent stale request pile-up.
 *
 * A stopped Bottleneck rejects every later job, and `updateSettings` does not
 * revive it — stopping the shared queue in place broke checkout and refunds
 * until a reload. So the stale queue is swapped out first and stopped on its
 * own: its waiting jobs reject (callers see a failure, not a hang), its
 * in-flight requests finish, and new requests go to the fresh queue.
 */
const clearQueue = async (): Promise<void> => {
	if (globalQueue.queued() === 0) return;
	const staleQueue = globalQueue;
	globalQueue = createQueue();
	await staleQueue.stop({ dropWaitingJobs: true });
};

// Register for wake events to clear stale requests
requestStateManager.onWake(() => {
	clearQueue().catch(() => {
		// Silently ignore queue clearing errors
	});
});

/**
 * Schedule a request in the global queue. `label` (e.g. `POST /orders`) names
 * the request in the overflow row if it is dropped.
 */
export const scheduleRequest = <T>(fn: () => Promise<T>, label?: string): Promise<T> => {
	return globalQueue.schedule((_label: string | undefined) => fn(), label);
};

/**
 * Pause the request queue (prevents new requests from executing)
 * NOTE: We don't actually pause the Bottleneck queue because it can't be restarted.
 * Instead, we rely on the RequestStateManager's pre-flight checks to block new requests.
 * This function is kept for API compatibility but does nothing.
 */
export const pauseQueue = (): void => {
	// Intentionally empty - pre-flight checks handle request blocking
	httpLogger.debug('Request coordination active (via state manager, not queue pause)');
};

/**
 * Resume the request queue
 * NOTE: We don't actually resume the Bottleneck queue.
 * This function is kept for API compatibility but does nothing.
 */
export const resumeQueue = (): void => {
	// Intentionally empty - pre-flight checks handle request unblocking
	httpLogger.debug('Request coordination complete (via state manager)');
};

/**
 * Get queue metrics for monitoring
 */
export const getQueueMetrics = () => {
	return {
		running: globalQueue.running(),
		queued: globalQueue.queued(),
	};
};
