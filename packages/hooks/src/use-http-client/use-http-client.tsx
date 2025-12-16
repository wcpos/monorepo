import * as React from 'react';

import set from 'lodash/set';

import log from '@wcpos/utils/logger';

import http from './http';
import { parseWpError } from './parse-wp-error';
import { scheduleRequest } from './request-queue';
import { requestStateManager } from './request-state-manager';

import type { HttpErrorHandler, HttpErrorHandlerContext } from './types';

type AxiosRequestConfig = import('axios').AxiosRequestConfig;
type AxiosError = import('axios').AxiosError;
type AxiosResponse = import('axios').AxiosResponse;

/**
 * Process multiple error handlers in order of priority
 */
const processErrorHandlers = async (
	error: AxiosError,
	originalConfig: AxiosRequestConfig,
	errorHandlers: HttpErrorHandler[],
	makeRequest: (config: AxiosRequestConfig) => Promise<AxiosResponse>
): Promise<AxiosResponse | AxiosError> => {
	// Safety check - ensure errorHandlers is an array
	if (!Array.isArray(errorHandlers)) {
		console.error('processErrorHandlers: errorHandlers is not an array:', errorHandlers);
		return error;
	}

	// Sort handlers by priority (higher first)
	const sortedHandlers = [...errorHandlers].sort((a, b) => (b.priority || 0) - (a.priority || 0));

	let retryCount = 0;
	const maxRetries = 3;

	for (const handler of sortedHandlers) {
		log.debug(`Processing error with handler: ${handler.name}`, {
			context: {
				handlerName: handler.name,
				handlerPriority: handler.priority,
				canHandle: handler.canHandle(error),
				errorStatus: error.response?.status,
			},
		});

		if (!handler.canHandle(error)) {
			log.debug(`Handler ${handler.name} cannot handle this error, skipping`);
			continue;
		}

		try {
			const context: HttpErrorHandlerContext = {
				error,
				originalConfig,
				retryRequest: async (config?: AxiosRequestConfig) => {
					retryCount++;
					if (retryCount > maxRetries) {
						throw new Error(`Max retries (${maxRetries}) exceeded`);
					}
					return makeRequest(config || originalConfig);
				},
				retryCount,
			};

			const result = await handler.handle(context);

			// If handler returned a response, it successfully resolved the error
			if (result) {
				log.debug(`Error handled successfully by ${handler.name}`, {
					context: {
						status: error.response?.status,
						handlerName: handler.name,
						retryCount,
					},
				});
				return result;
			}

			// If handler intercepts but didn't return a response, it failed
			if (handler.intercepts) {
				log.debug(`Intercepting handler ${handler.name} failed`, {
					context: {
						status: error.response?.status,
						handlerName: handler.name,
					},
				});
				break;
			}
		} catch (handlerError) {
			log.error(`Error handler ${handler.name} threw an error`, {
				context: {
					error: handlerError instanceof Error ? handlerError.message : String(handlerError),
					originalStatus: error.response?.status,
					handlerIntercepts: handler.intercepts,
					willStopChain: handler.intercepts,
				},
			});

			// Special case: If token refresh handler throws an error with refresh token invalid flag,
			// continue the chain to let the fallback handler process it
			if (
				handler.name === 'token-refresh' &&
				handlerError === error &&
				(error as any).isRefreshTokenInvalid
			) {
				log.debug(
					`Token refresh handler failed with invalid refresh token, continuing chain to fallback handler`
				);
				continue; // Continue to next handler instead of breaking
			}

			// If this handler intercepts, stop the chain
			if (handler.intercepts) {
				log.debug(`Handler ${handler.name} intercepts and failed, stopping error chain`);
				// Return the handler error instead of the original error so we can propagate substitutions (e.g. CanceledError)
				return handlerError as any;
			} else {
				log.debug(`Handler ${handler.name} failed but does not intercept, continuing chain`);
			}
		}
	}

	// No handler successfully resolved the error
	return error;
};

// Create a stable empty array to avoid recreating it on every render
const EMPTY_ERROR_HANDLERS: HttpErrorHandler[] = [];

/**
 * Http Client provides a standard API for all platforms
 * also wraps request to provide a common error handler
 *
 * @param errorHandlers - Array of error handlers. IMPORTANT: Must be a stable reference
 *                       to avoid infinite re-renders. Use useMemo, useState, or a constant
 *                       outside the component if passing handlers.
 *
 * @example
 * // ✅ Good - no arguments (uses stable empty array)
 * const httpClient = useHttpClient();
 *
 * // ✅ Good - stable reference
 * const ERROR_HANDLERS = [{ name: 'retry', ... }];
 * const httpClient = useHttpClient(ERROR_HANDLERS);
 *
 * // ✅ Good - memoized
 * const errorHandlers = useMemo(() => [{ name: 'retry', ... }], []);
 * const httpClient = useHttpClient(errorHandlers);
 *
 * // ❌ BAD - will cause infinite re-renders!
 * const httpClient = useHttpClient([{ name: 'retry', ... }]);
 *
 * TODO - how best to cancel requests
 * TODO - becareful to use useOnlineStatus because it emits a lot of events
 */
export const useHttpClient = (errorHandlers: HttpErrorHandler[] = EMPTY_ERROR_HANDLERS) => {
	// const defaultErrorHandler = useHttpErrorHandler();

	/**
	 * Make the actual HTTP request
	 */
	const makeRequest = React.useCallback(async (config: AxiosRequestConfig) => {
		// Pre-flight check: ensure request can proceed based on global state
		const canProceed = requestStateManager.checkCanProceed() as any;
		if (!canProceed.ok) {
			// Create error with additional context
			const error = new Error(canProceed.reason || 'Request blocked') as any;
			error.errorCode = canProceed.errorCode;
			error.isPreFlightBlocked = true;
			error.isSleeping = canProceed.isSleeping || false;

			// Only log if not sleeping - sleeping is expected behavior
			if (!canProceed.isSleeping) {
				log.debug('Request blocked by pre-flight check', {
					context: {
						errorCode: canProceed.errorCode,
						reason: canProceed.reason,
						url: config.url,
						method: config.method,
					},
				});
			}
			throw error;
		}

		// If token refresh is in progress, wait for it to complete
		if (requestStateManager.isTokenRefreshing()) {
			log.debug('Token refresh in progress, waiting before making request', {
				context: {
					url: config.url,
					method: config.method,
				},
			});
			await requestStateManager.awaitTokenRefresh();
			log.debug('Token refresh completed, proceeding with request', {
				context: {
					url: config.url,
					method: config.method,
				},
			});
		}

		const processedConfig = { ...config };

		if (processedConfig.method?.toLowerCase() !== 'head') {
			set(processedConfig, ['headers', 'X-WCPOS'], 1);
		}

		if (processedConfig.method?.toLowerCase() === 'head') {
			set(processedConfig, 'decompress', false);
			set(processedConfig, ['params', '_method'], 'HEAD');
		}

		if (process.env.NODE_ENV === 'development') {
			set(processedConfig, ['params', 'XDEBUG_SESSION'], 'start');
		}

		return scheduleRequest(() => http.request(processedConfig));
	}, []);

	/**
	 * Main request function with error handling
	 */
	const request = React.useCallback(
		async (reqConfig: AxiosRequestConfig = {}) => {
			try {
				const response = await makeRequest(reqConfig);
				return response;
			} catch (error) {
				// Process through error handlers first
				if (errorHandlers && errorHandlers.length > 0) {
					const result = await processErrorHandlers(
						error as AxiosError,
						reqConfig,
						errorHandlers,
						makeRequest
					);

				// If result is a response (has both data and status properties), return it
				// This distinguishes responses from AxiosErrors which have status but not data at top level
				// Also check isAxiosError flag to be extra safe (AxiosErrors have this set to true)
				if (result && 'data' in result && 'status' in result && !(result as any).isAxiosError) {
					return result as AxiosResponse;
				}

					// Otherwise, it's still an error - use it as the new error
					error = result as AxiosError;
				}

				if (http.isCancel(error)) {
					log.debug('Request canceled (auth in progress)', {
						context: {
							message: error.message,
						},
					});
					// Throw the CanceledError so callers can handle it appropriately.
					// Previously we returned a never-resolving promise, but that caused:
					// 1. CollectionReplicationState to hang (active$ stayed true forever)
					// 2. No way to recover when auth completed
					//
					// Callers should check for CanceledError and handle gracefully:
					// - Don't show error toast (auth is being handled)
					// - Set active$ = false
					// - Let polling retry later
					throw error;
				}

				// Enrich error with WordPress/WooCommerce error details before throwing
				const axiosError = error as AxiosError;
				if (axiosError.response?.data) {
					const wpError = parseWpError(axiosError.response.data, axiosError.message);
					(error as any).wpCode = wpError.code; // Internal code (APIxxxxx)
					(error as any).wpServerCode = wpError.serverCode; // Original server code for debugging
					(error as any).wpMessage = wpError.message;
					(error as any).wpStatus = wpError.status;
				}

				log.debug(error);
				throw error;
			}
		},
		[errorHandlers, makeRequest]
	);

	/**
	 *
	 */
	return React.useMemo(
		() => ({
			request,
			get(url: string, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'GET', url });
			},
			post(url: string, data: any, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'POST', url, data });
			},
			put(url: string, data: any, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'PUT', url, data });
			},
			patch(url: string, data: any, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'PATCH', url, data });
			},
			delete(url: string, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'DELETE', url });
			},
			head(url: string, config: AxiosRequestConfig = {}) {
				return request({ ...config, method: 'HEAD', url });
			},
		}),
		[request]
	);
};
