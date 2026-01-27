import Bottleneck from 'bottleneck';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { requestStateManager } from './request-state-manager';

const httpLogger = getLogger(['wcpos', 'http', 'queue']);

/**
 * Global request queue shared across all HTTP client instances.
 * This ensures coordinated rate limiting and allows pause/resume functionality.
 */
const globalQueue = new Bottleneck({
	maxConcurrent: 10,
	highWater: 50,
	strategy: Bottleneck.strategy.BLOCK,
});

globalQueue.on('error', (error) => {
	httpLogger.error('Too many requests queued - please wait', {
		showToast: true,
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.REQUEST_QUEUE_FULL,
			error: error instanceof Error ? error.message : String(error),
		},
	});
});

globalQueue.on('failed', async (error, jobInfo) => {
	// Debug only - individual request failures are handled by error handlers
	httpLogger.debug('Request failed in queue', {
		context: {
			error: error instanceof Error ? error.message : String(error),
			retryCount: jobInfo.retryCount,
		},
	});
});

/**
 * Clear all pending requests from the queue.
 * Used when waking from sleep to prevent stale request pile-up.
 */
const clearQueue = async (): Promise<void> => {
	const queuedCount = globalQueue.queued();
	if (queuedCount > 0) {
		// Stop accepting new jobs temporarily
		await globalQueue.stop({ dropWaitingJobs: true });

		// Restart the queue
		globalQueue.updateSettings({
			maxConcurrent: 10,
			highWater: 50,
			strategy: Bottleneck.strategy.BLOCK,
		});
	}
};

// Register for wake events to clear stale requests
requestStateManager.onWake(() => {
	clearQueue().catch(() => {
		// Silently ignore queue clearing errors
	});
});

/**
 * Schedule a request in the global queue
 */
export const scheduleRequest = <T>(fn: () => Promise<T>): Promise<T> => {
	return globalQueue.schedule(fn);
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

/**
 * Export the queue instance for advanced usage
 */
export { globalQueue };
