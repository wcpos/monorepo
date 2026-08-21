import * as React from 'react';

import get from 'lodash/get';

import {
	createTokenRefreshHandler,
	PREFLIGHT_BLOCK,
	requestStateManager,
	useHttpClient,
} from '@wcpos/hooks/use-http-client';
import { extractErrorMessage } from '@wcpos/hooks/use-http-client/parse-wp-error';
import { bareAuthParamSupported, formatAuthorizationParam } from '@wcpos/utils/auth-param';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../contexts/app-state';
import { mergeStoresWithResponse } from '../utils/merge-stores';

const appLogger = getLogger(['wcpos', 'app', 'validation']);

/**
 * A request blocked by the sleeping pre-flight check (tab hidden) is expected
 * control flow, not an auth failure — the block codes are explicitly documented
 * as never-to-be-persisted log codes (see request-state-manager.ts). Validation
 * is deferred to the wake retry instead of being reported as an error.
 */
const isAsleepBlock = (error: unknown): boolean =>
	(error as { isPreFlightBlocked?: boolean })?.isPreFlightBlocked === true &&
	(error as { blockCode?: string })?.blockCode === PREFLIGHT_BLOCK.ASLEEP;

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
	const accessToken = useDocField(wpUser, (value) => value.access_token);
	const refreshToken = useDocField(wpUser, (value) => value.refresh_token);
	const userId = useDocField(wpUser, (value) => value.id);

	// Use stable values for site to avoid unnecessary re-renders
	const siteUrl = site.url;
	const apiUrl = site.wcpos_api_url;
	const useJwtAsParam = site.use_jwt_as_param;
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
				use_jwt_as_param: useJwtAsParam,
				wcpos_version: wcposVersion,
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
	}, [apiUrl, useJwtAsParam, wcposVersion, siteUrl, userId, refreshToken, baseHttpClient, wpUser]);

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
						requestConfig.params.authorization = formatAuthorizationParam(
							accessToken,
							bareAuthParamSupported(wcposVersion)
						);
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
					appLogger.error(serverMessage, {
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

					// Server omits `capabilities` on plugin versions without the capability
					// payload (absence = unknown = fail open). Never patch the key to
					// `undefined` — RxDB schema validation rejects undefined values (422),
					// which failed the whole login validation and left the user stuck on
					// "Re-authenticate" with no stores. Stale stored caps are cleared via
					// an incrementalModify below instead, which can actually remove a key.
					let clearCapabilities = false;
					if (data.capabilities === undefined) {
						clearCapabilities = true;
					} else if (Array.isArray(data.capabilities)) {
						updateData.capabilities = [
							...new Set(
								data.capabilities.filter(
									(capability: unknown): capability is string =>
										typeof capability === 'string' && capability.length > 0
								)
							),
						];
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

					if (
						clearCapabilities &&
						(wpUser.getLatest() as unknown as { capabilities?: string[] }).capabilities !==
							undefined
					) {
						await wpUser.getLatest().incrementalModify((docData) => {
							delete (docData as { capabilities?: string[] }).capabilities;
							return docData;
						});
						appLogger.debug('Cleared stale capabilities (server omitted the field)', {
							context: { userId },
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
					const errorMsg = getErrorMessage(error);
					appLogger.error('Failed to update user in local database', {
						code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
						context: {
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
				if (isAsleepBlock(error)) {
					// Defer, don't fail: clear the key so the wake tick re-runs this
					// validation, and leave isValid untouched — nothing was proven wrong.
					lastValidationKey.current = '';
					appLogger.debug('[stores] validation deferred — app is in background', {
						context: { userId, siteUrl },
					});
				} else {
					const errorMsg = getErrorMessage(error);
					appLogger.error('[stores] validation FAILED', {
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
		useJwtAsParam,
		wcposVersion,
		siteUrl,
		userId,
		accessToken,
		wpUser,
		userDB,
		user,
		site.uuid,
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
