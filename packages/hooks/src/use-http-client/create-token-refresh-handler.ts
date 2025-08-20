import log from '@wcpos/utils/logger';

import type { AxiosRequestConfig } from 'axios';
import type { HttpErrorHandler, HttpErrorHandlerContext } from './types';

interface TokenRefreshConfig {
	site: {
		wcpos_api_url?: string;
		use_jwt_as_param?: boolean;
		url?: string;
	};
	wpUser: {
		id?: number;
		refresh_token?: string;
		incrementalPatch: (data: { access_token: string; expires_at: number }) => Promise<any>;
	};
	// Function to get a fresh HTTP client for the refresh request
	getHttpClient: () => {
		post: (url: string, data: any, config?: AxiosRequestConfig) => Promise<any>;
	};
}

interface TokenRefreshResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	expires_at: number;
}

/**
 * Creates a token refresh error handler that automatically refreshes expired tokens
 * and retries the original request with the new token.
 */
export const createTokenRefreshHandler = ({
	site,
	wpUser,
	getHttpClient,
}: TokenRefreshConfig): HttpErrorHandler => {
	return {
		name: 'token-refresh',
		priority: 100, // High priority to run first
		intercepts: true, // This handler stops the error chain if successful

		canHandle: (error) => {
			// Only handle 401 Unauthorized errors
			return error.response?.status === 401;
		},

		handle: async (context: HttpErrorHandlerContext) => {
			const { error, originalConfig, retryRequest } = context;

			// Check if we have the required data for token refresh
			if (!site.wcpos_api_url || !wpUser.refresh_token) {
				log.debug('Skipping token refresh - missing required data', {
					context: {
						hasApiUrl: !!site.wcpos_api_url,
						hasRefreshToken: !!wpUser.refresh_token,
					},
				});
				throw error;
			}

			log.debug('Access token expired, attempting refresh', {
				context: {
					userId: wpUser.id,
					siteUrl: site.url,
					originalUrl: originalConfig.url,
				},
			});

			try {
				// Use a fresh HTTP client to avoid circular error handling
				const httpClient = getHttpClient();

				// Make the token refresh request
				const refreshResponse = await httpClient.post(
					`${site.wcpos_api_url}auth/refresh`,
					{
						refresh_token: wpUser.refresh_token,
					},
					{
						headers: {
							'X-WCPOS': '1',
						},
					}
				);

				const refreshData: TokenRefreshResponse = refreshResponse.data;
				const { access_token, expires_at } = refreshData;

				if (!access_token) {
					throw new Error('No access token in refresh response');
				}

				log.debug('Token refresh successful', {
					context: {
						userId: wpUser.id,
						hasNewToken: !!access_token,
					},
				});

				// Update the wpUser document with new token
				await wpUser.incrementalPatch({
					access_token,
					expires_at,
				});

				// Update the original request config with the new token
				const updatedConfig = { ...originalConfig };

				if (site.use_jwt_as_param) {
					// Update JWT in query parameters
					updatedConfig.params = {
						...updatedConfig.params,
						authorization: `Bearer ${access_token}`,
					};
				} else {
					// Update JWT in Authorization header
					updatedConfig.headers = {
						...updatedConfig.headers,
						Authorization: `Bearer ${access_token}`,
					};
				}

				// Retry the original request with the new token
				const retryResponse = await retryRequest(updatedConfig);

				log.debug('Request retry successful after token refresh', {
					context: {
						userId: wpUser.id,
						originalUrl: originalConfig.url,
						retryStatus: retryResponse.status,
					},
				});

				return retryResponse;
			} catch (refreshError) {
				const errorMsg =
					refreshError instanceof Error ? refreshError.message : String(refreshError);

				log.error('Token refresh failed', {
					context: {
						error: errorMsg,
						userId: wpUser.id,
						siteUrl: site.url,
						originalUrl: originalConfig.url,
						originalStatus: error.response?.status,
					},
				});

				// Re-throw the original error since refresh failed
				throw error;
			}
		},
	};
};
