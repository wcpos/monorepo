import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import useHttpClient, { createTokenRefreshHandler } from '@wcpos/hooks/use-http-client';
import log from '@wcpos/utils/logger';

import { useAppState } from '../contexts/app-state';
import { mergeStoresWithResponse } from '../utils/merge-stores';

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
	const accessToken = useObservableEagerState(wpUser.access_token$);
	const refreshToken = useObservableEagerState(wpUser.refresh_token$);
	const userId = useObservableEagerState(wpUser.id$);

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
			log.debug('Skipping user validation - missing required data', {
				context: {
					hasApiUrl: !!apiUrl,
					hasUserId: !!userId,
					hasAccessToken: !!accessToken,
				},
			});
			setIsValid(false);
			setError('Missing required user or site data');
			return;
		}

		const validateUser = async () => {
			validationInProgress.current = true;
			lastValidationKey.current = validationKey;

			// Reset state
			setIsLoading(true);
			setError(null);

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

				log.debug('Validating user credentials', {
					context: {
						userId,
						siteUrl,
						useJwtAsParam,
					},
				});

				const response = await httpClient.get(endpoint, requestConfig);

				// Check if response is successful
				if (!response || response.status < 200 || response.status >= 300) {
					const errorMsg = `Invalid response status: ${response?.status}`;
					log.error('User validation failed', {
						context: {
							status: response?.status,
							statusText: response?.statusText,
							userId,
							siteUrl,
						},
					});
					setError(errorMsg);
					setIsValid(false);
					return;
				}

				const data = get(response, 'data', {});

				// Check if data exists and has expected structure
				if (!data || typeof data !== 'object') {
					const errorMsg = 'Invalid response data';
					log.debug('User validation response contains no valid data', {
						context: {
							userId,
							siteUrl,
							hasData: !!data,
						},
					});
					setError(errorMsg);
					setIsValid(false);
					return;
				}

				// Sanity check: verify that the response ID matches the expected user ID
				if (data.id !== undefined && data.id !== userId) {
					const errorMsg = `User ID mismatch: expected ${userId}, got ${data.id}`;
					log.error('User validation failed - ID mismatch', {
						context: {
							expectedUserId: userId,
							receivedUserId: data.id,
							siteUrl,
						},
					});
					setError(errorMsg);
					setIsValid(false);
					return;
				}

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

				// Update user data if we have fields to update
				if (Object.keys(updateData).length > 0) {
					await wpUser.incrementalPatch(updateData);
					log.debug('User data updated successfully', {
						context: {
							userId,
							updatedFields: Object.keys(updateData),
						},
					});
				}

				// Merge stores if present in response
				if (data.stores && Array.isArray(data.stores)) {
					await mergeStoresWithResponse({
						userDB,
						wpUser,
						remoteStores: data.stores,
						user: { uuid: user.uuid },
						siteID: site.uuid,
					});
				}

				setIsValid(true);
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				log.error('User validation failed', {
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		httpClient,
		apiUrl,
		useJwtAsParam,
		siteUrl,
		userId,
		accessToken,
		wpUser.incrementalPatch,
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
