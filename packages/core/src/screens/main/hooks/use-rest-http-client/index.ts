import * as React from 'react';

import get from 'lodash/get';
import merge from 'lodash/merge';

import { RequestConfig, requestStateManager, useHttpClient } from '@wcpos/hooks/use-http-client';
import { createTokenRefreshHandler } from '@wcpos/hooks/use-http-client/create-token-refresh-handler';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { AppInfo } from '@wcpos/utils/app-info';
import { bareAuthParamSupported, formatAuthorizationParam } from '@wcpos/utils/auth-param';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	deriveSyntheticPathBase,
	deriveSyntheticPathRoot,
	resolveRestTransport,
	toRestRouteUrl,
} from '@wcpos/utils/rest-transport';
import {
	CLIENT_QUERY_PARAM,
	formatClientSignal,
	PROTOCOL_QUERY_PARAM,
	SYNC_PROTOCOL_VERSION,
} from '@wcpos/utils/sync-protocol';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useAuthErrorHandler } from './auth-error-handler';
import { createRefreshHttpClient } from './refresh-http-client';

const httpLogger = getLogger(['wcpos', 'http', 'rest']);

/**
 *
 * @param responseString
 * @returns
 */
function extractValidJSON(responseString: string) {
	// Find the index where the actual JSON starts
	const indexOfJsonStart = responseString.search(/[{[]/);

	if (indexOfJsonStart === -1) {
		httpLogger.error('Server returned invalid response - no JSON found', {
			code: ERROR_CODES.STORE_SERVER_ERROR,
			context: {
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
		code: ERROR_CODES.STORE_SERVER_ERROR,
		context: {
			responsePreview: responseString.substring(0, 200),
		},
	});
	return null;
}

/** Unwraps a WCPOS v1 response envelope and restores missing pagination headers in place. */
export function unwrapResponseEnvelope<T>(response: T): T {
	if (typeof response !== 'object' || response === null) return response;

	const mutableResponse = response as { data?: unknown; headers?: unknown };
	const envelope = mutableResponse.data;
	if (
		typeof envelope !== 'object' ||
		envelope === null ||
		!Object.prototype.hasOwnProperty.call(envelope, 'data')
	) {
		return response;
	}

	const envelopeRecord = envelope as Record<string, unknown>;
	const metadata = envelopeRecord._wcpos;
	if (typeof metadata !== 'object' || metadata === null || (metadata as { v?: unknown }).v !== 1) {
		return response;
	}

	if (mutableResponse.headers === undefined) mutableResponse.headers = {};
	if (typeof mutableResponse.headers === 'object' && mutableResponse.headers !== null) {
		const headers = mutableResponse.headers as Record<string, unknown>;
		const { total, total_pages: totalPages } = metadata as Record<string, unknown>;
		const totalHeader = Object.keys(headers).find(
			(header) => header.toLowerCase() === 'x-wp-total'
		);
		if (
			(totalHeader === undefined ||
				headers[totalHeader] === undefined ||
				headers[totalHeader] === '') &&
			Number.isSafeInteger(total) &&
			(total as number) >= 0
		) {
			headers[totalHeader ?? 'x-wp-total'] = String(total);
		}
		const totalPagesHeader = Object.keys(headers).find(
			(header) => header.toLowerCase() === 'x-wp-totalpages'
		);
		if (
			(totalPagesHeader === undefined ||
				headers[totalPagesHeader] === undefined ||
				headers[totalPagesHeader] === '') &&
			Number.isSafeInteger(totalPages) &&
			(totalPages as number) >= 1
		) {
			headers[totalPagesHeader ?? 'x-wp-totalpages'] = String(totalPages);
		}
	}

	mutableResponse.data = envelopeRecord.data;
	return response;
}

export const useRestHttpClient = (endpoint = '') => {
	const { site, wpCredentials, store, logout } = useStoreSession();
	const { status: onlineStatus } = useOnlineStatus();
	const t = useT();

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
		return createRefreshHttpClient() as {
			post: (
				url: string,
				data: unknown,
				config?: import('axios').AxiosRequestConfig
			) => Promise<unknown>;
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
				sessionRenewedMessage: t('auth.session_renewed_automatically'),
			}),
		[site, wpCredentials, getHttpClient, t]
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
			const wcposVersion = site.wcpos_version;

			let apiURL = site.wcpos_api_url;
			const pathFormRoot = deriveSyntheticPathRoot(site.wp_api_url!).replace(/\/?$/, '/');
			const wpApiURL = pathFormRoot;

			if (apiURL) apiURL = deriveSyntheticPathBase(apiURL);

			// Migrate missing and persisted v1 service bases to v2.
			if (!apiURL || /\/wcpos\/v1\/?$/.test(apiURL)) {
				apiURL = wpApiURL + 'wcpos/v2';
				await site.incrementalPatch({ wcpos_api_url: apiURL });
			}

			// Discovery stores wcpos_api_url WITH a trailing slash; strip it before
			// joining so the composed path never carries `//`. Pretty routing
			// tolerated the double slash, but rest_route matching is strict.
			const pathFormBaseURL = apiURL.replace(/\/+$/, '') + '/' + endpoint;
			const defaultConfig = {
				baseURL:
					resolveRestTransport(site) === 'query'
						? toRestRouteUrl(pathFormBaseURL, pathFormRoot)
						: pathFormBaseURL,
				headers: shouldUseJwtAsParam ? {} : { Authorization: `Bearer ${jwt}` },
				params: {
					[PROTOCOL_QUERY_PARAM]: SYNC_PROTOCOL_VERSION,
					[CLIENT_QUERY_PARAM]: formatClientSignal(AppInfo.platform, AppInfo.version),
				},
			};

			if (shouldUseJwtAsParam) {
				const params = {
					authorization: formatAuthorizationParam(jwt!, bareAuthParamSupported(wcposVersion)),
				};
				defaultConfig.params = merge(params, defaultConfig.params);
			}

			if (store.id !== 0) {
				const params = { store_id: store.id };
				defaultConfig.params = merge(params, defaultConfig.params);
			}

			if ((reqConfig.method ?? 'GET').toUpperCase() === 'GET') {
				// Axios lane's single envelope opt-in point, mirroring apps/main/lib/engine-fetcher.ts.
				// Unwrapping keeps header readers such as refund pagination working when a proxy
				// strips X-WP-TotalPages.
				const params = { _wcpos_envelope: 1 };
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
						code: ERROR_CODES.STORE_RESPONSE_MALFORMED,
						context: {
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
				return unwrapResponseEnvelope(response);
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
				 * Tunnel through POST because some servers don't allow PUT requests.
				 * CRS 920450 denylists the override header, and WP core reads the
				 * _method query param first, so the param alone is sufficient.
				 */
				const newConfig = {
					...config,
					params: { ...config.params, _method: 'PUT' },
				};
				return request({ ...newConfig, method: 'POST', url, data });
			},
			patch(url: string, data: any, config: RequestConfig = {}) {
				/**
				 * Tunnel through POST because some servers don't allow PATCH requests.
				 * CRS 920450 denylists the override header, and WP core reads the
				 * _method query param first, so the param alone is sufficient.
				 */
				const newConfig = {
					...config,
					params: { ...config.params, _method: 'PATCH' },
				};
				return request({ ...newConfig, method: 'POST', url, data });
			},
			delete(url: string, config: RequestConfig = {}) {
				const newConfig = {
					...config,
					params: { ...config.params, _method: 'DELETE' },
				};
				return request({ ...newConfig, method: 'POST', url });
			},
			head(url: string, config: RequestConfig = {}) {
				return request({ ...config, method: 'HEAD', url });
			},
		}),
		[endpoint, request, onlineStatus]
	);
};
