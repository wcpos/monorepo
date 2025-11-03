import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { pauseQueue, resumeQueue } from './request-queue';
import { requestStateManager } from './request-state-manager';

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

			// Check if token refresh is already in progress
			if (requestStateManager.isTokenRefreshing()) {
				log.debug('Token refresh already in progress, awaiting completion', {
					context: {
						userId: wpUser.id,
						originalUrl: originalConfig.url,
					},
				});

				try {
					// Wait for the in-progress refresh to complete
					await requestStateManager.awaitTokenRefresh();

					// Get the refreshed token from the state manager
					const freshToken = requestStateManager.getRefreshedToken();

					if (!freshToken) {
						log.error('Token refresh completed but no token available', {
							saveToDb: true,
							context: {
								errorCode: ERROR_CODES.TOKEN_REFRESH_FAILED,
								userId: wpUser.id,
								originalUrl: originalConfig.url,
							},
						});
						throw error;
					}

					log.debug('Token refresh completed, retrying with fresh token', {
						context: {
							userId: wpUser.id,
							originalUrl: originalConfig.url,
						},
					});

					// Update the config with the fresh token
					const updatedConfig = { ...originalConfig };

					if (site.use_jwt_as_param) {
						updatedConfig.params = {
							...updatedConfig.params,
							authorization: `Bearer ${freshToken}`,
						};
					} else {
						updatedConfig.headers = {
							...updatedConfig.headers,
							Authorization: `Bearer ${freshToken}`,
						};
					}

					// Retry with the fresh token
					return await retryRequest(updatedConfig);
				} catch (refreshError) {
					// Refresh failed while we were waiting - likely invalid refresh token
					log.debug('Token refresh failed while waiting for completion', {
						context: {
							userId: wpUser.id,
							originalUrl: originalConfig.url,
							error: refreshError instanceof Error ? refreshError.message : String(refreshError),
						},
					});
					throw error;
				}
			}

			// This is the first 401, start the token refresh process
			log.debug('Access token expired, starting token refresh', {
				context: {
					userId: wpUser.id,
					siteUrl: site.url,
					originalUrl: originalConfig.url,
				},
			});

			// Start the token refresh - this will return the new token
			try {
				await requestStateManager.startTokenRefresh(async () => {
					// Pause the queue during token refresh
					pauseQueue();

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

						log.debug('Token refresh response received', {
							context: {
								userId: wpUser.id,
								responseStatus: refreshResponse.status,
								hasAccessToken: !!access_token,
								responseData: refreshData,
							},
						});

						if (!access_token) {
							log.error('Session refresh failed - please log in again', {
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

						// Resume the queue now that token is refreshed
						resumeQueue();

						// Return the new token - it will be stored in RequestStateManager
						return access_token;
					} catch (refreshError) {
						// Resume queue even if refresh failed
						resumeQueue();

						const errorMsg =
							refreshError instanceof Error ? refreshError.message : String(refreshError);

						// Check if the refresh token itself is invalid (401 or no access token in response)
						const isRefreshTokenInvalid =
							(refreshError instanceof Error && errorMsg.includes('401')) ||
							(refreshError instanceof Error && errorMsg === 'REFRESH_TOKEN_INVALID') ||
							(refreshError as any)?.response?.status === 401;

						if (isRefreshTokenInvalid) {
							log.error('Your session has expired - please log in again', {
								showToast: true,
								saveToDb: true,
								context: {
									errorCode: ERROR_CODES.REFRESH_TOKEN_INVALID,
									userId: wpUser.id,
									siteUrl: site.url,
								},
							});

							// Set auth failed state
							requestStateManager.setAuthFailed(true);

							// Mark the original error as refresh token invalid and let other handlers process it
							(error as any).isRefreshTokenInvalid = true;
							(error as any).refreshTokenInvalid = true;

							log.debug('Refresh token invalid - triggering OAuth fallback handler');

							// Throw the marked error to let other handlers process it
							// The fallback handler will catch this specific error
							throw error;
						}

						log.error('Unable to refresh session', {
							saveToDb: true,
							context: {
								errorCode: ERROR_CODES.TOKEN_REFRESH_FAILED,
								error: errorMsg,
								userId: wpUser.id,
								siteUrl: site.url,
								originalStatus: error.response?.status,
							},
						});

						// Re-throw the original error since refresh failed
						throw error;
					}
				});

				// Token refresh completed successfully, get the token from state manager
				const freshToken = requestStateManager.getRefreshedToken();

				if (!freshToken) {
					log.error('Token refresh completed but no token available', {
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.TOKEN_REFRESH_FAILED,
							userId: wpUser.id,
							originalUrl: originalConfig.url,
						},
					});
					throw error;
				}

				// Update config with the fresh token
				const updatedConfig = { ...originalConfig };

				if (site.use_jwt_as_param) {
					// Update JWT in query parameters
					updatedConfig.params = {
						...updatedConfig.params,
						authorization: `Bearer ${freshToken}`,
					};
				} else {
					// Update JWT in Authorization header
					updatedConfig.headers = {
						...updatedConfig.headers,
						Authorization: `Bearer ${freshToken}`,
					};
				}

				log.debug('Retrying request after successful token refresh', {
					context: {
						userId: wpUser.id,
						originalUrl: originalConfig.url,
						hasNewToken: !!freshToken,
					},
				});

				// Retry the original request with the new token
				return await retryRequest(updatedConfig);
			} catch (refreshError) {
				// This catch handles errors thrown from startTokenRefresh
				// which have already been processed above
				throw refreshError;
			}
		},
	};
};
