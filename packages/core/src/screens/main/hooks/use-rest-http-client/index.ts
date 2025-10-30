import * as React from 'react';

import get from 'lodash/get';
import merge from 'lodash/merge';
import { useObservableEagerState } from 'observable-hooks';

import useHttpClient, { RequestConfig } from '@wcpos/hooks/use-http-client';
import { createTokenRefreshHandler } from '@wcpos/hooks/use-http-client/create-token-refresh-handler';
import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAppState } from '../../../../contexts/app-state';
import { errorSubject, useAuthErrorHandler } from './auth-error-handler';

/**
 *
 * @param responseString
 * @returns
 */
function extractValidJSON(responseString) {
	// Find the index where the actual JSON starts
	const indexOfJsonStart = responseString.search(/[{[]/);

	if (indexOfJsonStart === -1) {
		log.error('Server returned invalid response - no JSON found', {
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

	log.error('Unable to parse server response', {
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.MALFORMED_JSON_RESPONSE,
			responsePreview: responseString.substring(0, 200),
		},
	});
	return null;
}

export const useRestHttpClient = (endpoint = '') => {
	const { site, wpCredentials, store } = useAppState();
	const { status: onlineStatus } = useOnlineStatus();
	const jwt = useObservableEagerState(wpCredentials.access_token$);

	/**
	 * Create a fresh HTTP client for token refresh requests
	 * This avoids circular error handling during token refresh
	 */
	const getHttpClient = React.useCallback(() => {
		return {
			post: async (url: string, data: any, config: any = {}) => {
				const response = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...config.headers,
					},
					body: JSON.stringify(data),
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				return {
					data: await response.json(),
					status: response.status,
					statusText: response.statusText,
				};
			},
		};
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
	 * Get the fallback auth error handler for cases where token refresh fails
	 */
	const fallbackAuthHandler = useAuthErrorHandler(site, wpCredentials);

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
	 *
	 */
	const request = React.useCallback(
		async (reqConfig: RequestConfig = {}) => {
			// Online status is now checked by the request state manager pre-flight check
			// No need to manually check here - requests will be blocked automatically

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

		return httpClient.request(config).then((response) => {
			/**
			 * This is a HACK
			 * Some servers return invalid JSON, so we try to recover from it
			 * eg: rando WordPress plugin echo's out a bunch of HTML before the JSON
			 */
			if (typeof response?.data === 'string') {
				log.warn('Server returned text instead of JSON - attempting recovery', {
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
					log.debug('Successfully recovered valid JSON from response');
				}
			}
			return response;
		});
		},
		[endpoint, httpClient, jwt, store.id, site, onlineStatus]
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
