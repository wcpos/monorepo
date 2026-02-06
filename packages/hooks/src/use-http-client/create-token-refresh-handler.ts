/**
 * Token Refresh Error Handler Factory
 *
 * Creates an HttpErrorHandler that automatically refreshes expired JWT tokens
 * and retries the original request.
 *
 * ## How It Works
 *
 * This handler is registered with priority 100 (highest) so it runs first when
 * a 401 error occurs.
 *
 * ### Single Request Flow
 * ```
 * 1. Request fails with 401
 * 2. Handler checks: Is refresh already in progress? NO
 * 3. Start refresh via RequestStateManager
 * 4. Call /auth/refresh endpoint with refresh_token
 * 5. Save new access_token to database
 * 6. Retry original request with new token
 * 7. Return response (success!)
 * ```
 *
 * ### Multiple Concurrent 401s
 * ```
 * Request A: 401 → isTokenRefreshing()? NO → Start refresh
 * Request B: 401 → isTokenRefreshing()? YES → Wait for A's refresh
 * Request C: 401 → isTokenRefreshing()? YES → Wait for A's refresh
 *
 * A's refresh completes → B and C get token → All retry → All succeed
 * ```
 *
 * ### When Refresh Fails
 *
 * If the refresh token is invalid (401, 403, 404 from /auth/refresh):
 * 1. Sets `authFailed = true` in RequestStateManager
 * 2. Marks error with `isRefreshTokenInvalid = true`
 * 3. Throws error to continue handler chain
 * 4. Fallback auth handler catches it and triggers OAuth
 *
 * ## Why a Fresh HTTP Client?
 *
 * The refresh request uses a raw `fetch` wrapper instead of `useHttpClient`.
 * This avoids circular error handling - if the refresh request itself got a 401,
 * it would try to refresh again, causing infinite loops.
 *
 * ## Integration Points
 *
 * - **RequestStateManager**: Coordinates refresh across all requests
 * - **Fallback Auth Handler**: Catches errors when refresh fails
 * - **WPUser Document**: Stores tokens in RxDB
 *
 * @example
 * const handler = createTokenRefreshHandler({
 *   site: { wcpos_api_url: 'https://example.com/wp-json/wcpos/v1/' },
 *   wpUser: wpCredentialsDocument,
 *   getHttpClient: () => ({
 *     post: async (url, data, config) => {
 *       const response = await fetch(url, {
 *         method: 'POST',
 *         body: JSON.stringify(data),
 *         headers: { 'Content-Type': 'application/json', ...config?.headers }
 *       });
 *       return { data: await response.json(), status: response.status };
 *     }
 *   })
 * });
 *
 * @see request-state-manager.ts - Token refresh coordination
 * @see auth-error-handler.ts - Fallback when refresh fails
 * @see README.md - Full architecture documentation
 */

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { pauseQueue, resumeQueue } from './request-queue';
import { requestStateManager } from './request-state-manager';

import type { AxiosRequestConfig } from 'axios';
import type { HttpErrorHandler, HttpErrorHandlerContext } from './types';

const tokenLogger = getLogger(['wcpos', 'auth', 'token']);

/**
 * RxDB document interface for WordPress credentials.
 * This is a subset of the full RxDocument interface with the methods we need.
 */
interface WPCredentialsDocument {
	/** User ID for logging */
	id?: number;
	/** The refresh token used to obtain new access tokens */
	refresh_token?: string;
	/** RxDB method to update token in database */
	incrementalPatch: (data: { access_token: string; expires_at: number }) => Promise<any>;
	/**
	 * Returns the latest known state of the RxDocument.
	 * This is important when the document may have been updated elsewhere
	 * (e.g., by OAuth login saving new tokens).
	 * @see https://rxdb.info/rx-document.html#getlatest
	 */
	getLatest: () => WPCredentialsDocument;
}

/**
 * Configuration for creating the token refresh handler
 */
interface TokenRefreshConfig {
	/** Site configuration with API URL */
	site: {
		/** Base URL for WCPOS REST API (e.g., 'https://example.com/wp-json/wcpos/v1/') */
		wcpos_api_url?: string;
		/** Base URL for WordPress REST API - fallback for constructing wcpos_api_url */
		wp_api_url?: string;
		/** If true, JWT is sent as query param instead of header */
		use_jwt_as_param?: boolean;
		/** Site URL for logging */
		url?: string;
	};
	/** WordPress user credentials document (RxDB document) */
	wpUser: WPCredentialsDocument;
	/**
	 * Factory for a fresh HTTP client used for the refresh request.
	 *
	 * This should NOT use useHttpClient to avoid circular error handling.
	 * A simple fetch wrapper is recommended.
	 */
	getHttpClient: () => {
		post: (url: string, data: any, config?: AxiosRequestConfig) => Promise<any>;
	};
}

/**
 * Response structure from the /auth/refresh endpoint
 */
interface TokenRefreshResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	expires_at: number;
}

/**
 * Creates a token refresh error handler.
 *
 * This handler:
 * - Intercepts 401 errors
 * - Attempts to refresh the JWT token
 * - Retries the original request with the new token
 * - Marks errors for fallback handling if refresh fails
 */
export const createTokenRefreshHandler = ({
	site,
	wpUser,
	getHttpClient,
}: TokenRefreshConfig): HttpErrorHandler => {
	return {
		name: 'token-refresh',
		priority: 100, // Highest priority - runs first
		intercepts: true, // Stops the error chain if successful

		/**
		 * Handle 401 Unauthorized and 403 Forbidden errors.
		 *
		 * 403 can occur when an expired JWT causes the server to reset
		 * the authenticated user, failing the capability check.
		 *
		 * Other errors (network, 5xx, etc.) pass through to other handlers.
		 */
		canHandle: (error) => {
			const status = error.response?.status;
			return status === 401 || status === 403;
		},

		/**
		 * Attempt to refresh the token and retry the request.
		 */
		handle: async (context: HttpErrorHandlerContext) => {
			const { error, originalConfig, retryRequest } = context;

			// ================================================================
			// GUARD: Check if we can attempt refresh
			// ================================================================

			// IMPORTANT: Read refresh_token fresh from the document to ensure we get the
			// latest value. After OAuth login, the document is patched with new tokens,
			// but we need to ensure we read the current value, not a stale cached one.
			//
			// RxDB's getLatest() returns the latest known state of the document.
			// See: https://rxdb.info/rx-document.html#getlatest
			const latestDoc = wpUser.getLatest();
			const currentRefreshToken = latestDoc?.refresh_token;

			// Construct API URL with fallback (wcpos_api_url may not be set on web after wake)
			const apiUrl = site.wcpos_api_url || (site.wp_api_url ? `${site.wp_api_url}wcpos/v1/` : null);

			if (!apiUrl || !currentRefreshToken) {
				tokenLogger.debug('Skipping token refresh - missing required data', {
					context: {
						hasWcposApiUrl: !!site.wcpos_api_url,
						hasWpApiUrl: !!site.wp_api_url,
						hasApiUrl: !!apiUrl,
						hasRefreshToken: !!currentRefreshToken,
					},
				});
				// Can't refresh - let other handlers deal with it
				throw error;
			}

			// ================================================================
			// Attempt token refresh (startTokenRefresh handles locking)
			// If another refresh is in progress, we'll wait for it automatically
			// ================================================================

			tokenLogger.debug('Access token expired, attempting token refresh', {
				context: {
					userId: wpUser.id,
					siteUrl: site.url,
					originalUrl: originalConfig.url,
				},
			});

			try {
				// startTokenRefresh() handles locking internally:
				// - If no refresh in progress: acquires lock, performs refresh
				// - If refresh in progress: waits for existing refresh to complete
				await requestStateManager.startTokenRefresh(async () => {
					// Pause queue to prevent other requests from using stale token
					pauseQueue();

					try {
						// Use fresh HTTP client to avoid circular error handling
						const httpClient = getHttpClient();

						tokenLogger.debug('Attempting token refresh', {
							context: {
								userId: wpUser.id,
								hasRefreshToken: !!currentRefreshToken,
								refreshTokenPreview: currentRefreshToken
									? `${currentRefreshToken.substring(0, 20)}...`
									: 'none',
							},
						});

						const refreshResponse = await httpClient.post(
							`${apiUrl}auth/refresh`,
							{ refresh_token: currentRefreshToken },
							{ headers: { 'X-WCPOS': '1' } }
						);

						const refreshData: TokenRefreshResponse = refreshResponse.data;
						const { access_token, expires_at } = refreshData;

						tokenLogger.debug('Token refresh response received', {
							context: {
								userId: wpUser.id,
								responseStatus: refreshResponse.status,
								hasAccessToken: !!access_token,
								responseData: refreshData,
							},
						});

						if (!access_token) {
							tokenLogger.warn('Session refresh failed - please log in again', {
								showToast: true,
								saveToDb: true,
								context: {
									errorCode: ERROR_CODES.REFRESH_TOKEN_INVALID,
									userId: wpUser.id,
									responseStatus: refreshResponse.status,
								},
							});
							throw new Error('REFRESH_TOKEN_INVALID');
						}

						tokenLogger.debug('Token refresh successful', {
							context: {
								userId: wpUser.id,
								hasNewToken: !!access_token,
							},
						});

						// Persist new token to database
						await wpUser.incrementalPatch({ access_token, expires_at });

						resumeQueue();
						return access_token;
					} catch (refreshError) {
						resumeQueue();
						handleRefreshError(refreshError, error, wpUser, site);
						// handleRefreshError always throws
						throw error;
					}
				});

				// Refresh succeeded - retry with new token
				const freshToken = requestStateManager.getRefreshedToken();

				if (!freshToken) {
					tokenLogger.warn('Token refresh completed but no token available', {
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.TOKEN_REFRESH_FAILED,
							userId: wpUser.id,
							originalUrl: originalConfig.url,
						},
					});
					throw error;
				}

				tokenLogger.debug('Retrying request after successful token refresh', {
					context: {
						userId: wpUser.id,
						originalUrl: originalConfig.url,
						hasNewToken: !!freshToken,
					},
				});

				return await retryWithNewToken(
					originalConfig,
					freshToken,
					site.use_jwt_as_param,
					retryRequest
				);
			} catch (refreshError) {
				// Error was already processed in handleRefreshError
				throw refreshError;
			}
		},
	};
};

/**
 * Retry request with a new access token
 */
async function retryWithNewToken(
	originalConfig: AxiosRequestConfig,
	token: string,
	useJwtAsParam: boolean | undefined,
	retryRequest: (config: AxiosRequestConfig) => Promise<any>
) {
	const updatedConfig = { ...originalConfig };

	if (useJwtAsParam) {
		updatedConfig.params = {
			...updatedConfig.params,
			authorization: `Bearer ${token}`,
		};
	} else {
		updatedConfig.headers = {
			...updatedConfig.headers,
			Authorization: `Bearer ${token}`,
		};
	}

	return await retryRequest(updatedConfig);
}

/**
 * Handle token refresh errors.
 *
 * Determines if the refresh token is invalid and should trigger OAuth,
 * or if it's a transient error.
 *
 * @throws Always throws - either the original error (marked) or as-is
 */
function handleRefreshError(
	refreshError: unknown,
	originalError: any,
	wpUser: TokenRefreshConfig['wpUser'],
	site: TokenRefreshConfig['site']
): never {
	const errorMsg = refreshError instanceof Error ? refreshError.message : String(refreshError);

	// Determine if this is an invalid refresh token (requires re-auth)
	// vs a transient error (can retry later)
	const isRefreshTokenInvalid =
		// Error message contains HTTP status codes indicating auth failure
		(refreshError instanceof Error &&
			(errorMsg.includes('401') ||
				errorMsg.includes('403') ||
				errorMsg.includes('404') ||
				errorMsg.includes('400'))) ||
		// Explicit invalid token error
		(refreshError instanceof Error && errorMsg === 'REFRESH_TOKEN_INVALID') ||
		// Pre-flight auth block
		(refreshError as any)?.errorCode === ERROR_CODES.AUTH_REQUIRED ||
		// HTTP response status
		[400, 401, 403, 404].includes((refreshError as any)?.response?.status);

	if (isRefreshTokenInvalid) {
		tokenLogger.warn('Your session has expired - please log in again', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.REFRESH_TOKEN_INVALID,
				userId: wpUser.id,
				siteUrl: site.url,
			},
		});

		// Block future requests until re-auth
		requestStateManager.setAuthFailed(true);

		// Mark error for fallback handler to catch
		originalError.isRefreshTokenInvalid = true;
		originalError.refreshTokenInvalid = true;

		tokenLogger.debug('Refresh token invalid - triggering OAuth fallback handler');
		throw originalError;
	}

	// Transient error - log and re-throw
	tokenLogger.warn('Unable to refresh session', {
		saveToDb: true,
		context: {
			errorCode: ERROR_CODES.TOKEN_REFRESH_FAILED,
			error: errorMsg,
			userId: wpUser.id,
			siteUrl: site.url,
			originalStatus: originalError.response?.status,
		},
	});

	throw originalError;
}
