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
 *   site: { wcpos_api_url: 'https://example.com/wp-json/wcpos/v2/' },
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

import { bareAuthParamSupported, formatAuthorizationParam } from '@wcpos/utils/auth-param';
import { toPreambleSite } from '@wcpos/utils/request-preamble';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { refreshAccessToken } from './refresh-access-token';
import { requestStateManager } from './request-state-manager';

import type { WcposRequestConfig } from './use-http-client';
import type { RefreshAccessTokenConfig } from './refresh-access-token';
import type { HttpErrorHandler, HttpErrorHandlerContext } from './types';

const tokenLogger = getLogger(['wcpos', 'auth', 'token']);

type TokenRefreshConfig = RefreshAccessTokenConfig;

type RefreshTokenError = HttpErrorHandlerContext['error'] & {
	isRefreshTokenInvalid?: boolean;
	refreshTokenInvalid?: boolean;
};

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
	sessionRenewedMessage,
}: TokenRefreshConfig): HttpErrorHandler => {
	return {
		name: 'token-refresh',
		priority: 100, // Highest priority - runs first
		intercepts: true, // Stops the error chain if successful

		/**
		 * Handle 401 Unauthorized errors.
		 *
		 * Other errors (network, 5xx, etc.) pass through to other handlers.
		 * 403 responses are authenticated permission errors and should not
		 * trigger token refresh.
		 */
		canHandle: (error) => {
			const status = error.response?.status;
			return status === 401;
		},

		/**
		 * Attempt to refresh the token and retry the request.
		 */
		handle: async (context: HttpErrorHandlerContext) => {
			const { error, originalConfig, retryRequest } = context;

			tokenLogger.debug('Access token expired, attempting token refresh', {
				context: {
					userId: wpUser.id,
					siteUrl: site.url,
					originalUrl: originalConfig.url,
				},
			});

			const freshToken = await refreshAccessToken({
				site,
				wpUser,
				getHttpClient,
				sessionRenewedMessage,
			});
			if (!freshToken) {
				// refreshAccessToken latches authFailed only for a terminally rejected refresh
				// token — flag the error for the OAuth fallback in that case. A transient failure
				// (network / 5xx / malformed) leaves authFailed clear and re-throws the original
				// error unflagged, so the request stays retryable instead of forcing re-auth.
				if (requestStateManager.isAuthFailed()) {
					const refreshError = error as RefreshTokenError;
					refreshError.isRefreshTokenInvalid = true;
					refreshError.refreshTokenInvalid = true;
				}
				throw error;
			}

			tokenLogger.debug('Retrying request after successful token refresh', {
				context: {
					userId: wpUser.id,
					originalUrl: originalConfig.url,
					hasNewToken: true,
				},
			});

			try {
				return await retryRequest(withRefreshedCredential(originalConfig, freshToken, site));
			} catch (retryError: unknown) {
				const retryStatus = getResponseStatus(retryError);
				if (retryStatus === 401) {
					// Settled failure (#899 rubric): the refresh ran and the 401 persisted,
					// so the user must re-authenticate — that is user action, i.e. error.
					tokenLogger.error(
						'Request still unauthorized after token refresh - please log in again',
						{
							showToast: true,
							code: ERROR_CODES.SESSION_EXPIRED,
							context: {
								userId: wpUser.id,
								siteUrl: site.url,
								originalUrl: originalConfig.url,
								retryStatus,
							},
						}
					);

					requestStateManager.setAuthFailed(true);
					const refreshError = error as RefreshTokenError;
					refreshError.isRefreshTokenInvalid = true;
					refreshError.refreshTokenInvalid = true;
					throw error;
				}
				throw retryError;
			}
		},
	};
};

/**
 * Hand the fresh token to the retry. A request that carries preamble metadata (every
 * production caller: the REST wrapper and cashier validation) gets it on that metadata,
 * so the same interceptor authors the retry as authored the first try. A bare Axios
 * config opted out of the preamble and may carry a relative URL the module cannot
 * compose, so it keeps the pre-#2129 behaviour: the credential goes straight on the
 * config, in the channel the site uses.
 */
function withRefreshedCredential(
	originalConfig: WcposRequestConfig,
	token: string,
	site: RefreshAccessTokenConfig['site']
): WcposRequestConfig {
	if (originalConfig.wcposPreamble) {
		return {
			...originalConfig,
			wcposPreamble: {
				...originalConfig.wcposPreamble,
				// Caller metadata wins field by field; the handler's site fills what it left out.
				site: { ...toPreambleSite(site), ...originalConfig.wcposPreamble.site },
				refreshedAccessToken: token,
			},
		};
	}
	if (site.use_jwt_as_param) {
		const authorization = formatAuthorizationParam(
			token,
			bareAuthParamSupported(site.wcpos_version)
		);
		if (originalConfig.params instanceof URLSearchParams) {
			// Spreading URLSearchParams drops its entries; clone and set instead.
			const params = new URLSearchParams(originalConfig.params);
			params.set('authorization', authorization);
			return { ...originalConfig, params };
		}
		return { ...originalConfig, params: { ...originalConfig.params, authorization } };
	}
	return {
		...originalConfig,
		headers: { ...originalConfig.headers, Authorization: `Bearer ${token}` },
	};
}

function getResponseStatus(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const response = (error as Record<string, unknown>).response;
	if (!response || typeof response !== 'object') return undefined;
	const status = (response as Record<string, unknown>).status;
	return typeof status === 'number' ? status : undefined;
}
