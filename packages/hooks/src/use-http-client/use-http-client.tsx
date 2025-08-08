import * as React from 'react';

import Bottleneck from 'bottleneck';
import set from 'lodash/set';

import log from '@wcpos/utils/logger';

import http from './http';

import type { HttpErrorHandler, HttpErrorHandlerContext } from './types';

type AxiosRequestConfig = import('axios').AxiosRequestConfig;
type AxiosError = import('axios').AxiosError;
type AxiosResponse = import('axios').AxiosResponse;

const limiter = new Bottleneck({
	maxConcurrent: 10,
	highWater: 50,
	strategy: Bottleneck.strategy.BLOCK,
});

limiter.on('error', (error) => {
	console.error('Queue limit exceeded!', error);
});

/**
 * Process multiple error handlers in order of priority
 */
const processErrorHandlers = async (
	error: AxiosError,
	originalConfig: AxiosRequestConfig,
	errorHandlers: HttpErrorHandler[],
	makeRequest: (config: AxiosRequestConfig) => Promise<AxiosResponse>
): Promise<AxiosResponse | AxiosError> => {
	// Sort handlers by priority (higher first)
	const sortedHandlers = [...errorHandlers].sort((a, b) => (b.priority || 0) - (a.priority || 0));

	let retryCount = 0;
	const maxRetries = 3;

	for (const handler of sortedHandlers) {
		if (!handler.canHandle(error)) {
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
				},
			});

			// If this handler intercepts, stop the chain
			if (handler.intercepts) {
				break;
			}
		}
	}

	// No handler successfully resolved the error
	return error;
};

/**
 * Http Client provides a standard API for all platforms
 * also wraps request to provide a common error handler
 *
 * TODO - how best to cancel requests
 * TODO - becareful to use useOnlineStatus because it emits a lot of events
 */
export const useHttpClient = (
	errorHandlers: HttpErrorHandler[] = [],
	legacyErrorHandler?: (error: unknown) => unknown
) => {
	// const defaultErrorHandler = useHttpErrorHandler();

	/**
	 * Make the actual HTTP request
	 */
	const makeRequest = React.useCallback(async (config: AxiosRequestConfig) => {
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

		return limiter.schedule(() => http.request(processedConfig));
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
				if (errorHandlers.length > 0) {
					const result = await processErrorHandlers(
						error as AxiosError,
						reqConfig,
						errorHandlers,
						makeRequest
					);

					// If result is a response, return it
					if (result && 'status' in result) {
						return result as AxiosResponse;
					}

					// Otherwise, it's still an error - use it as the new error
					error = result as AxiosError;
				}

				// Fall back to legacy error handler if provided
				let err = error;
				if (typeof legacyErrorHandler === 'function') {
					err = legacyErrorHandler(err);
				}

				log.debug(err);
				throw err;
			}
		},
		[errorHandlers, legacyErrorHandler, makeRequest]
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
