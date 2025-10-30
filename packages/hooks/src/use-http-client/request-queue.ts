import Bottleneck from 'bottleneck';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

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
	log.error('Too many requests queued - please wait', {
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
	log.debug('Request failed in queue', {
		context: {
			error: error instanceof Error ? error.message : String(error),
			retryCount: jobInfo.retryCount,
		},
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
	log.debug('Request coordination active (via state manager, not queue pause)');
};

/**
 * Resume the request queue
 * NOTE: We don't actually resume the Bottleneck queue.
 * This function is kept for API compatibility but does nothing.
 */
export const resumeQueue = (): void => {
	// Intentionally empty - pre-flight checks handle request unblocking
	log.debug('Request coordination complete (via state manager)');
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
