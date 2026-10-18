import * as React from 'react';

import get from 'lodash/get';

import {
	createTokenRefreshHandler,
	isAsleepBlock,
	requestStateManager,
	useHttpClient,
	type WcposRequestConfig,
} from '@wcpos/hooks/use-http-client';
import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { extractErrorMessage } from '@wcpos/hooks/use-http-client/parse-wp-error';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { toPreambleSite } from '@wcpos/utils/request-preamble';
import { deriveSyntheticPathBase, deriveSyntheticPathRoot } from '@wcpos/utils/rest-transport';
import { useDocField } from '@wcpos/query';
import {
	credentialsTokenOwner,
	type ReadonlySiteRecord,
	type ReadonlyWpCredentialsRecord,
	recordCashierProfile,
} from '@wcpos/query/user-db';

import { useAppState } from '../contexts/app-state';

const appLogger = getLogger(['wcpos', 'app', 'validation']);

interface Props {
	site: ReadonlySiteRecord;
	wpUser: ReadonlyWpCredentialsRecord;
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
	const accessToken = useDocField(wpUser, (value) => value.access_token);
	const refreshToken = useDocField(wpUser, (value) => value.refresh_token);
	const userId = useDocField(wpUser, (value) => value.id);

	// Use stable values for site to avoid unnecessary re-renders
	const siteUrl = site.url;
	const apiUrl = site.wcpos_api_url;
	const wpApiUrl = site.wp_api_url;
	const useJwtAsParam = site.use_jwt_as_param;
	const useRestRouteParam = site.use_rest_route_param;
	const useProtocolHeaders = site.use_protocol_headers ?? false;
	const wcposVersion = site.wcpos_version;

	// Get userDB and user for store merging
	const { userDB, user } = useAppState();

	// Create HTTP client without token refresh for the refresh requests
	const baseHttpClient = useHttpClient();

	// Create token refresh handler with stable dependencies
	const tokenRefreshHandler = React.useMemo(() => {
		return createTokenRefreshHandler({
			site: {
				wcpos_api_url: apiUrl,
				wp_api_url: wpApiUrl,
				use_jwt_as_param: useJwtAsParam,
				use_rest_route_param: useRestRouteParam,
				use_protocol_headers: useProtocolHeaders,
				wcpos_version: wcposVersion,
				url: siteUrl,
			},
			wpUser: { ...credentialsTokenOwner(wpUser), id: userId, refresh_token: refreshToken },
			getHttpClient: () => baseHttpClient,
		});
	}, [
		apiUrl,
		wpApiUrl,
		useJwtAsParam,
		useRestRouteParam,
		useProtocolHeaders,
		wcposVersion,
		siteUrl,
		userId,
		refreshToken,
		baseHttpClient,
		wpUser,
	]);

	// Create HTTP client with token refresh handler
	const httpClient = useHttpClient([tokenRefreshHandler]);

	// Add a ref to track if validation is already in progress
	const validationInProgress = React.useRef(false);

	// Add a ref to track the last validation attempt to prevent duplicate validations
	const lastValidationKey = React.useRef<string>('');

	// A validation attempt blocked while the tab was hidden clears
	// lastValidationKey and waits here: waking bumps the tick, re-running the
	// effect, and the key guard skips the re-run when nothing was deferred.
	const [wakeTick, setWakeTick] = React.useState(0);
	React.useEffect(() => {
		return requestStateManager.onWake(() => setWakeTick((tick) => tick + 1));
	}, []);

	React.useEffect(() => {
		// Create a unique key for this validation attempt
		const validationKey = `${userId}-${accessToken?.slice(-10)}`;

		// Skip if already validating or if this is the same as the last validation
		if (validationInProgress.current || lastValidationKey.current === validationKey) {
			return;
		}

		// Only validate if we have the required data. The "missing data" outcome is
		// derived during render (see `missingRequiredData` below), so here we just
		// skip the async work without touching state.
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
			return;
		}

		appLogger.debug('[stores] useUserValidation effect running', {
			context: {
				userId,
				apiUrl,
				siteUrl,
				siteUuid: site.uuid,
				wpUserUuid: wpUser.uuid,
				currentWpUserStores: wpUser.stores,
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
					const pathApiUrl = deriveSyntheticPathBase(apiUrl);
					const pathRoot = deriveSyntheticPathRoot(wpApiUrl ?? pathApiUrl);
					const endpoint = `${pathApiUrl}cashier/${userId}`;
					const requestConfig: WcposRequestConfig = {
						wcposPreamble: {
							purpose: 'cashier',
							accessToken,
							wpJsonRoot: pathRoot,
							site: toPreambleSite(site),
						},
					};

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
							code: ERROR_CODES.AUTH_UNEXPECTED,
							context: {
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
							code: ERROR_CODES.AUTH_UNEXPECTED,
							context: {
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
							code: ERROR_CODES.AUTH_UNEXPECTED,
							context: {
								expectedUserId: userId,
								receivedUserId: data.id,
								siteUrl,
							},
						});
						throw new Error(errorMsg);
					}

					return data;
				} catch (error: any) {
					if (isAsleepBlock(error)) {
						throw error; // Expected while the tab is hidden — handled by the caller.
					}
					// Extract the WooCommerce/WordPress error message from the response
					const serverMessage = extractErrorMessage(
						error?.response?.data,
						'Failed to fetch user data from server'
					);
					const logLevel = isExpectedPreflightBlock(error) ? 'warn' : 'error';
					appLogger[logLevel](serverMessage, {
						code: ERROR_CODES.AUTH_UNEXPECTED,
						context: {
							error: getErrorMessage(error),
							userId,
							siteUrl,
						},
					});
					throw error;
				}
			};

			try {
				// Fetch user data from server
				const data = await fetchUserData();

				// Update local database with fetched data
				await recordCashierProfile(userDB, wpUser, data, {
					userUuid: user.uuid,
					siteUuid: site.uuid,
				});

				appLogger.debug('[stores] validation complete, wpUser.stores after patch', {
					context: {
						wpUserUuid: wpUser.uuid,
						storesAfter: wpUser.getLatest().stores,
					},
				});
				setIsValid(true);
			} catch (error) {
				if (isAsleepBlock(error)) {
					// Defer, don't fail: clear the key so the wake tick re-runs this
					// validation, and leave isValid untouched — nothing was proven wrong.
					lastValidationKey.current = '';
					appLogger.debug('[stores] validation deferred — app is in background', {
						context: { userId, siteUrl },
					});
				} else {
					const errorMsg = getErrorMessage(error);
					const logLevel = isExpectedPreflightBlock(error) ? 'warn' : 'error';
					appLogger[logLevel]('[stores] validation FAILED', {
						code: ERROR_CODES.AUTH_UNEXPECTED,
						context: {
							error: errorMsg,
							userId,
							siteUrl,
						},
					});
					setError(errorMsg);
					setIsValid(false);
				}
			} finally {
				validationInProgress.current = false;
				setIsLoading(false);
			}
		};

		void validateUser();
	}, [
		httpClient,
		apiUrl,
		wpApiUrl,
		useJwtAsParam,
		useRestRouteParam,
		useProtocolHeaders,
		wcposVersion,
		siteUrl,
		userId,
		accessToken,
		wpUser,
		userDB,
		user,
		site,
		wakeTick,
	]);

	// When required data is missing the user is invalid — derived during render
	// rather than synced via setState in the effect above.
	const missingRequiredData = !apiUrl || !userId || !accessToken;

	return {
		isValid: missingRequiredData ? false : isValid,
		isLoading,
		error: missingRequiredData ? 'Missing required user or site data' : error,
	};
};
