import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { createTokenRefreshHandler, useHttpClient } from '@wcpos/hooks/use-http-client';
import { extractErrorMessage } from '@wcpos/hooks/use-http-client/parse-wp-error';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAppState } from '../contexts/app-state';
import { mergeStoresWithResponse } from '../utils/merge-stores';

const appLogger = getLogger(['wcpos', 'app', 'validation']);

interface Props {
	site: import('@wcpos/database').SiteDocument;
	wpUser: import('@wcpos/database').WPCredentialsDocument;
}

interface UserValidationResult {
	isValid: boolean;
	isLoading: boolean;
	error: string | null;
}

/**
 * Hook to validate user credentials against the cashier endpoint
 */
export const useUserValidation = ({ site, wpUser }: Props): UserValidationResult => {
	const [isValid, setIsValid] = React.useState(true); // Start optimistic
	const [isLoading, setIsLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	// Use reactive state for access token to get latest value
	const accessToken = useObservableEagerState(
		wpUser.access_token$ ?? of(undefined as string | undefined)
	);
	const refreshToken = useObservableEagerState(
		wpUser.refresh_token$ ?? of(undefined as string | undefined)
	);
	const userId = useObservableEagerState(wpUser.id$ ?? of(undefined as number | undefined));

	// Use stable values for site to avoid unnecessary re-renders
	const siteUrl = site.url;
	const apiUrl = site.wcpos_api_url;
	const useJwtAsParam = site.use_jwt_as_param;

	// Get userDB and user for store merging
	const { userDB, user } = useAppState();

	// Create HTTP client without token refresh for the refresh requests
	const baseHttpClient = useHttpClient();

	// Create token refresh handler with stable dependencies
	const tokenRefreshHandler = React.useMemo(() => {
		return createTokenRefreshHandler({
			site: {
				wcpos_api_url: apiUrl,
				use_jwt_as_param: useJwtAsParam,
				url: siteUrl,
			},
			wpUser: {
				id: userId,
				refresh_token: refreshToken,
				incrementalPatch: wpUser.incrementalPatch.bind(wpUser),
				getLatest: wpUser.getLatest.bind(wpUser),
			},
			getHttpClient: () => baseHttpClient,
		});
	}, [apiUrl, useJwtAsParam, siteUrl, userId, refreshToken, baseHttpClient, wpUser]);

	// Create HTTP client with token refresh handler
	const httpClient = useHttpClient([tokenRefreshHandler]);

	// Add a ref to track if validation is already in progress
	const validationInProgress = React.useRef(false);

	// Add a ref to track the last validation attempt to prevent duplicate validations
	const lastValidationKey = React.useRef<string>('');

	React.useEffect(() => {
		// Create a unique key for this validation attempt
		const validationKey = `${userId}-${accessToken?.slice(-10)}`;

		// Skip if already validating or if this is the same as the last validation
		if (validationInProgress.current || lastValidationKey.current === validationKey) {
			return;
		}

		// Only validate if we have the required data
		if (!apiUrl || !userId || !accessToken) {
			appLogger.debug('[stores] SKIPPING user validation — missing required data', {
				context: {
					hasApiUrl: !!apiUrl,
					apiUrl,
					hasUserId: !!userId,
					userId,
					hasAccessToken: !!accessToken,
					siteUrl,
					siteUuid: site.uuid,
				},
			});
			setIsValid(false);
			setError('Missing required user or site data');
			return;
		}

		appLogger.debug('[stores] useUserValidation effect running', {
			context: {
				userId,
				apiUrl,
				siteUrl,
				siteUuid: site.uuid,
				wpUserUuid: wpUser.uuid,
				currentWpUserStores: (wpUser as unknown as { stores?: string[] }).stores,
			},
		});

		const validateUser = async () => {
			validationInProgress.current = true;
			lastValidationKey.current = validationKey;

			// Reset state
			setIsLoading(true);
			setError(null);

			/**
			 * Fetch user data from server (HTTP operation)
			 */
			const fetchUserData = async () => {
				try {
					// Build the endpoint URL
					const endpoint = `${apiUrl}cashier/${userId}`;

					// Prepare request config
					const requestConfig: any = {
						params: { wcpos: 1 },
						headers: {
							'X-WCPOS': '1',
						},
					};

					// Handle authentication based on site configuration
					if (useJwtAsParam) {
						// Use JWT as query parameter
						requestConfig.params.authorization = `Bearer ${accessToken}`;
					} else {
						// Use JWT as Authorization header
						requestConfig.headers.Authorization = `Bearer ${accessToken}`;
					}

					appLogger.debug('Validating user credentials', {
						context: {
							userId,
							siteUrl,
							useJwtAsParam,
						},
					});

					appLogger.debug('[stores] GET cashier endpoint', {
						context: { endpoint, userId, siteUrl },
					});
					const response = await httpClient.get(endpoint, requestConfig);
					appLogger.debug('[stores] cashier response received', {
						context: {
							status: response?.status,
							hasData: !!response?.data,
							dataStoresType: typeof response?.data?.stores,
							dataStoresLength: Array.isArray(response?.data?.stores)
								? response.data.stores.length
								: undefined,
						},
					});

					// Check if response is successful
					if (!response || response.status < 200 || response.status >= 300) {
						const errorMsg = `Invalid response status: ${response?.status}`;
						appLogger.error('User validation failed', {
							context: {
								errorCode: ERROR_CODES.CONNECTION_REFUSED,
								status: response?.status,
								statusText: response?.statusText,
								userId,
								siteUrl,
							},
						});
						throw new Error(errorMsg);
					}

					const data = get(response, 'data', {});

					// Check if data exists and has expected structure
					if (!data || typeof data !== 'object') {
						const errorMsg = 'Invalid response data';
						appLogger.error('User validation response contains no valid data', {
							context: {
								errorCode: ERROR_CODES.INVALID_RESPONSE_FORMAT,
								userId,
								siteUrl,
								hasData: !!data,
							},
						});
						throw new Error(errorMsg);
					}

					// Sanity check: verify that the response ID matches the expected user ID
					if (data.id !== undefined && data.id !== userId) {
						const errorMsg = `User ID mismatch: expected ${userId}, got ${data.id}`;
						appLogger.error('User validation failed - ID mismatch', {
							context: {
								errorCode: ERROR_CODES.INVALID_RESPONSE_FORMAT,
								expectedUserId: userId,
								receivedUserId: data.id,
								siteUrl,
							},
						});
						throw new Error(errorMsg);
					}

					return data;
				} catch (error: any) {
					// Extract the WooCommerce/WordPress error message from the response
					const serverMessage = extractErrorMessage(
						error?.response?.data,
						'Failed to fetch user data from server'
					);
					appLogger.error(serverMessage, {
						context: {
							errorCode: ERROR_CODES.CONNECTION_REFUSED,
							error: error instanceof Error ? error.message : String(error),
							userId,
							siteUrl,
						},
					});
					throw error;
				}
			};

			/**
			 * Update user data in local database (DB operation)
			 */
			const updateUserInDB = async (data: any) => {
				try {
					// Update user fields directly with response data
					const updateData: any = {};
					const fieldsToUpdate = [
						'avatar_url',
						'display_name',
						'email',
						'first_name',
						'last_access',
						'last_name',
						'nice_name',
						'username',
					];

					fieldsToUpdate.forEach((field) => {
						if (data[field] !== undefined) {
							updateData[field] = data[field];
						}
					});

					// Roles can come as an array of slugs (`roles`) or a legacy single
					// string (`role`) from older plugin versions. Normalize to array.
					if (Array.isArray(data.roles)) {
						updateData.roles = data.roles.filter(
							(r: unknown): r is string => typeof r === 'string' && r.length > 0
						);
					} else if (typeof data.role === 'string' && data.role.length > 0) {
						updateData.roles = [data.role];
					}

					// Update user data if we have fields to update
					if (Object.keys(updateData).length > 0) {
						await wpUser.incrementalPatch(updateData);
						appLogger.debug('User data updated successfully', {
							context: {
								userId,
								updatedFields: Object.keys(updateData),
							},
						});
					}

					// Merge stores if present in response
					if (data.stores && Array.isArray(data.stores)) {
						appLogger.debug('Merging stores from cashier response', {
							context: {
								userId,
								siteUuid: site.uuid,
								remoteStoreCount: data.stores.length,
								remoteStoreIds: data.stores.map((s: any) => s?.id),
							},
						});
						await mergeStoresWithResponse({
							userDB,
							wpUser,
							remoteStores: data.stores,
							user: { uuid: user.uuid ?? '' },
							siteID: site.uuid ?? '',
						});
					} else {
						appLogger.debug('Cashier response has no stores array — skipping merge', {
							context: {
								userId,
								siteUuid: site.uuid,
								dataKeys: Object.keys(data ?? {}),
								storesType: typeof data?.stores,
							},
						});
					}
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					appLogger.error('Failed to update user in local database', {
						context: {
							errorCode: ERROR_CODES.TRANSACTION_FAILED,
							error: errorMsg,
							userId,
						},
					});
					throw error;
				}
			};

			try {
				// Fetch user data from server
				const data = await fetchUserData();

				// Update local database with fetched data
				await updateUserInDB(data);

				appLogger.debug('[stores] validation complete, wpUser.stores after patch', {
					context: {
						wpUserUuid: wpUser.uuid,
						storesAfter: (wpUser.getLatest() as unknown as { stores?: string[] }).stores,
					},
				});
				setIsValid(true);
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				appLogger.error('[stores] validation FAILED', {
					context: {
						error: errorMsg,
						userId,
						siteUrl,
					},
				});
				setError(errorMsg);
				setIsValid(false);
			} finally {
				validationInProgress.current = false;
				setIsLoading(false);
			}
		};

		validateUser();
	}, [
		httpClient,
		apiUrl,
		useJwtAsParam,
		siteUrl,
		userId,
		accessToken,
		wpUser,
		userDB,
		user,
		site.uuid,
	]);

	return {
		isValid,
		isLoading,
		error,
	};
};
