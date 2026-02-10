export { useHttpClient } from './use-http-client';
export { http } from './http';
export { createTokenRefreshHandler } from './create-token-refresh-handler';
export { requestStateManager } from './request-state-manager';
export { scheduleRequest, pauseQueue, resumeQueue, getQueueMetrics } from './request-queue';
export {
	extractErrorMessage,
	extractWpErrorCode,
	parseWpError,
	isWpErrorResponse,
} from './parse-wp-error';
export type { RequestConfig } from './types';
export type { HttpErrorHandler, HttpErrorHandlerContext } from './types';
export type { WpErrorResponse, ParsedWpError } from './parse-wp-error';

/**
 * Note: requestStateManager.getRefreshedToken() is available for advanced use cases
 * where you need to access the token that was just refreshed. This is primarily used
 * internally by the token refresh handler to coordinate token updates across
 * concurrent 401 errors.
 */
