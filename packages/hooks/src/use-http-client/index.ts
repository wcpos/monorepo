export { useHttpClient as default } from './use-http-client';
export { createTokenRefreshHandler } from './create-token-refresh-handler';
export { requestStateManager } from './request-state-manager';
export { scheduleRequest, pauseQueue, resumeQueue, getQueueMetrics } from './request-queue';
export type { RequestConfig } from './types';
export type { HttpErrorHandler, HttpErrorHandlerContext } from './types';

/**
 * Note: requestStateManager.getRefreshedToken() is available for advanced use cases
 * where you need to access the token that was just refreshed. This is primarily used
 * internally by the token refresh handler to coordinate token updates across
 * concurrent 401 errors.
 */
