import * as React from 'react';

import get from 'lodash/get';
import merge from 'lodash/merge';

import useHttpClient, { RequestConfig, requestStateManager } from '@wcpos/hooks/use-http-client';
import { createTokenRefreshHandler } from '@wcpos/hooks/use-http-client/create-token-refresh-handler';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAppState } from '../../../../contexts/app-state';
import { errorSubject, useAuthErrorHandler } from './auth-error-handler';
import { createRefreshHttpClient } from './refresh-http-client';

const httpLogger = getLogger(['wcpos', 'http', 'rest']);

/**
 *
 * @param responseString
 * @returns
 */
function extractValidJSON(responseString) {
	// Find the index where the actual JSON starts
	const indexOfJsonStart = responseString.search(/[{[]/);

	if (indexOfJsonStart === -1) {
		httpLogger.error('Server returned invalid response - no JSON found', {
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.MALFORMED_JSON_RESPONSE,
				responsePreview: responseString.substring(0, 200),
			},
		});
		return null;
	}

	// Extracting up to where we suspect the JSON ends
	const possibleJson = responseString.substring(indexOfJsonStart);

	// Trying to find a valid JSON object
	for (let i = possibleJson.length; i > 0; i--) {
		try {
			return JSON.parse(possibleJson.substring(0, i));
		} catch {
			// Not a valid JSON yet, continue trimming
		}
	}

	httpLogger.error('Unable to parse server response', {
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.MALFORMED_JSON_RESPONSE,
			responsePreview: responseString.substring(0, 200),
		},
	});
	return null;
}

export const useRestHttpClient = (endpoint = '') => {
	const { site, wpCredentials, store, logout } = useAppState();
	const { status: onlineStatus } = useOnlineStatus();

	/**
	 * NOTE: We intentionally do NOT use useObservableEagerState for the JWT token.
	 *
	 * The httpClient object is passed to Query classes at construction time and held
	 * as a reference. If we capture the JWT in React state (via useObservableEagerState),
	 * when the token changes:
	 * 1. React re-renders and creates a NEW httpClient object
	 * 2. But Query still holds the OLD reference with the OLD token
	 *
	 * Instead, we read the token fresh from wpCredentials.access_token at request time.
	 * This way, even stale httpClient references will use the CURRENT token.
	 */

	/**
	 * Create a fresh HTTP client for token refresh requests.
	 * This avoids circular error handling during token refresh.
	 *
	 * Note: This is platform-specific:
	 * - Web/Native: Uses fetch() directly
	 * - Electron: Uses IPC to main process (required because renderer is sandboxed)
	 *
	 * @see refresh-http-client.ts - Default implementation
	 * @see refresh-http-client.electron.ts - Electron implementation
	 */
	const getHttpClient = React.useCallback(() => {
		return createRefreshHttpClient();
	}, []);

	/**
	 * Create token refresh handler using the existing utility
	 */
	const tokenRefreshHandler = React.useMemo(
		() =>
			createTokenRefreshHandler({
				site,
				wpUser: wpCredentials,
				getHttpClient,
			}),
		[site, wpCredentials, getHttpClient]
	);

	/**
	 * Get the fallback auth error handler for cases where token refresh fails.
	 * Pass logout callback for security - if user logs in as different user, force logout.
	 */
	const fallbackAuthHandler = useAuthErrorHandler(site, wpCredentials, logout);

	/**
	 * Error handlers for HTTP requests - token refresh first, then fallback
	 */
	const errorHandlers = React.useMemo(
		() => [tokenRefreshHandler, fallbackAuthHandler],
		[tokenRefreshHandler, fallbackAuthHandler]
	);

	/**
	 * Sync online status with the request state manager
	 */
	React.useEffect(() => {
		const isOffline = onlineStatus === 'offline' || onlineStatus === 'online-website-unavailable';
		requestStateManager.setOffline(isOffline);
		// Logging happens in requestStateManager.setOffline()
	}, [onlineStatus]);

	/**
	 *
	 */
	const httpClient = useHttpClient(errorHandlers);

	/**
	 * Main request function.
	 *
	 * IMPORTANT: Reads JWT fresh from wpCredentials.access_token at request time,
	 * not from a captured closure. This ensures that even if Query holds a stale
	 * httpClient reference, it will always use the CURRENT token.
	 *
	 * If a token was just refreshed, we prefer the in-memory token from
	 * requestStateManager over the database value to avoid race conditions
	 * where RxDB hasn't fully persisted the new token yet.
	 */
	const request = React.useCallback(
		async (reqConfig: RequestConfig = {}) => {
			// Online status is now checked by the request state manager pre-flight check
			// No need to manually check here - requests will be blocked automatically

			// Prefer freshly refreshed token (in-memory) over database value
			// This avoids race conditions where RxDB hasn't persisted the new token yet
			const refreshedToken = requestStateManager.getRefreshedToken();
			const jwt = refreshedToken || wpCredentials.access_token;

			if (refreshedToken) {
				httpLogger.debug('Using in-memory refreshed token (RxDB may not have persisted yet)', {
					context: {
						endpoint,
						url: reqConfig.url,
					},
				});
			}

			const shouldUseJwtAsParam = get(
				window,
				['initialProps', 'site', 'use_jwt_as_param'],
				site.use_jwt_as_param
			);

			let apiURL = site.wcpos_api_url;

			// sanity check, make sure we have a wcpos_api_url
			if (!apiURL) {
				apiURL = site.wp_api_url + 'wcpos/v1';
				site.incrementalPatch({ wcpos_api_url: apiURL });
			}

			const defaultConfig = {
				baseURL: apiURL + '/' + endpoint,
				headers: shouldUseJwtAsParam ? {} : { Authorization: `Bearer ${jwt}` },
				params: {},
			};

			if (shouldUseJwtAsParam) {
				const params = { authorization: `Bearer ${jwt}` };
				defaultConfig.params = merge(params, defaultConfig.params);
			}

			if (store.id !== 0) {
				const params = { store_id: store.id };
				defaultConfig.params = merge(params, defaultConfig.params);
			}

			const config = merge({}, defaultConfig, reqConfig);

			try {
				const response = await httpClient.request(config);
				/**
				 * This is a HACK
				 * Some servers return invalid JSON, so we try to recover from it
				 * eg: rando WordPress plugin echo's out a bunch of HTML before the JSON
				 */
				if (typeof response?.data === 'string') {
					httpLogger.warn('Server returned text instead of JSON - attempting recovery', {
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.JSON_RECOVERY_ATTEMPTED,
							endpoint,
							url: config.url,
							responsePreview: response.data.substring(0, 200),
						},
					});
					response.data = extractValidJSON(response?.data);

					if (response.data) {
						httpLogger.debug('Successfully recovered valid JSON from response');
					}
				}
				return response;
			} catch (error) {
				// Re-throw the error - it will be caught by DataFetcher or other callers
				// Using try/catch ensures the rejection is properly handled in this async context
				throw error;
			}
		},
		[endpoint, httpClient, wpCredentials, store.id, site]
	);

	/**
	 *
	 */
	return React.useMemo(
		() => ({
			endpoint,
			request,
			onlineStatus,
			get(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'GET', url });
			},
			post(url: string, data: any, config: RequestConfig = {}) {
				return request({ ...config, method: 'POST', url, data });
			},
			put(url: string, data: any, config: RequestConfig = {}) {
				/**
				 * Some servers don't allow PUT requests, so we can use POST instead
				 * and add a _method=PUT query param and header
				 */
				const newConfig = {
					...config,
					headers: { ...config.headers, 'X-HTTP-Method-Override': 'PUT' },
					params: { ...config.params, _method: 'PUT' },
				};
				return request({ ...newConfig, method: 'POST', url, data });
			},
			patch(url: string, data: any, config: RequestConfig = {}) {
				/**
				 * Some servers don't allow PUT requests, so we can use POST instead
				 * and add a _method=PUT query param and header
				 */
				const newConfig = {
					...config,
					headers: { ...config.headers, 'X-HTTP-Method-Override': 'PATCH' },
					params: { ...config.params, _method: 'PATCH' },
				};
				return request({ ...newConfig, method: 'POST', url, data });
			},
			delete(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'DELETE', url });
			},
			head(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'HEAD', url });
			},

			/**
			 * @TODO - this is just an experiment to see if the httpClient should manage it's own error state
			 */
			error$: errorSubject.asObservable(),
		}),
		[endpoint, request, onlineStatus]
	);
};
