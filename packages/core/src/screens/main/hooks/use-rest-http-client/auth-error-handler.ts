import * as React from 'react';

import { CanceledError } from 'axios';
import { makeRedirectUri, ResponseType, useAuthRequest } from 'expo-auth-session';
import { BehaviorSubject } from 'rxjs';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';
import type { HttpErrorHandler } from '@wcpos/hooks/use-http-client';
import { requestStateManager } from '@wcpos/hooks/use-http-client';

import { useLoginHandler } from '../../../auth/hooks/use-login-handler';

import type { Site, WPCredentials } from './types';

const errorSubject = new BehaviorSubject(null);

/**
 * Hook that creates an auth error handler for token refresh and login redirect
 */
export const useAuthErrorHandler = (site: Site, wpCredentials: WPCredentials): HttpErrorHandler => {
	const { handleLoginSuccess } = useLoginHandler(site as any);
	const [shouldTriggerAuth, setShouldTriggerAuth] = React.useState(false);

	const redirectUri = makeRedirectUri({
		scheme: 'wcpos',
		path: (window as any)?.baseUrl ?? undefined,
	});

	// Point at this site's auth endpoint
	const discovery = {
		authorizationEndpoint: site.wcpos_login_url,
	};

	const [, response, promptAsync] = useAuthRequest(
		{
			clientId: 'unused', // expo requires this field
			responseType: ResponseType.Token,
			redirectUri,
			extraParams: { redirect_uri: redirectUri },
			scopes: [],
			usePKCE: false,
		},
		discovery
	);

	// Handle OAuth trigger
	React.useEffect(() => {
		if (shouldTriggerAuth) {
			log.debug('Triggering OAuth authentication flow');
			setShouldTriggerAuth(false); // Reset the flag
			promptAsync().catch((authError) => {
				log.warn('Authentication failed - please try again', {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.AUTH_REQUIRED,
						siteName: site.name,
						error: authError instanceof Error ? authError.message : String(authError),
					},
				});
			});
		}
	}, [shouldTriggerAuth, promptAsync, site.name]);

	// Handle auth response
	React.useEffect(() => {
		if (response?.type === 'success') {
			log.success('Successfully logged in', {
				showToast: true,
			});
			log.debug('Authentication successful', {
				context: {
					siteName: site.name,
					userId: wpCredentials.id,
				},
			});
			// Clear auth failed state on successful login
			requestStateManager.setAuthFailed(false);
			handleLoginSuccess(response as any);
		} else if (response?.type === 'error') {
			log.warn('Login failed - please check your credentials', {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.INVALID_CREDENTIALS,
					siteName: site.name,
					errorDetails: response.error,
				},
			});
		}
	}, [response, handleLoginSuccess, site.name, wpCredentials.id]);

	// Token refresh is now handled by the dedicated createTokenRefreshHandler
	// This handler only deals with cases where token refresh has already failed

	return React.useMemo(
		() => ({
			name: 'fallback-auth-handler',
			priority: 50, // Lower priority - runs after token refresh handler
			canHandle: (error) => {
				const canHandle =
					error.response?.status === 401 ||
					(error as any).isRefreshTokenInvalid ||
					(error as any).refreshTokenInvalid ||
					(error instanceof Error && error.message === 'REFRESH_TOKEN_INVALID');

				log.debug('Fallback auth handler canHandle check', {
					context: {
						canHandle,
						errorStatus: error.response?.status,
						hasRefreshTokenInvalidFlag: (error as any).isRefreshTokenInvalid,
						hasRefreshTokenInvalidFlag2: (error as any).refreshTokenInvalid,
						errorMessage: error instanceof Error ? error.message : String(error),
					},
				});

				return canHandle;
			},
			handle: async (context) => {
				const { error } = context;

				log.debug('Fallback auth handler triggered', {
					context: {
						errorMessage: error instanceof Error ? error.message : String(error),
						errorStatus: (error as any)?.response?.status,
						hasRefreshTokenInvalidFlag: (error as any)?.isRefreshTokenInvalid,
						hasRefreshTokenInvalidFlag2: (error as any)?.refreshTokenInvalid,
					},
				});

				// Check if this is a refresh token invalid error
				const isRefreshTokenInvalid =
					(error as any).isRefreshTokenInvalid ||
					(error as any).refreshTokenInvalid ||
					(error instanceof Error && error.message === 'REFRESH_TOKEN_INVALID');

				if (isRefreshTokenInvalid) {
					log.debug('Refresh token is invalid, launching OAuth flow');
				} else {
					log.debug('Token refresh failed, attempting OAuth flow');
				}

				errorSubject.next(context.error);

				// Trigger OAuth flow asynchronously via state
				log.debug('Setting flag to trigger OAuth flow');
				setShouldTriggerAuth(true);

				// Throw a CanceledError to stop the request chain
				// The OAuth flow will be handled by the useEffect
				throw new CanceledError('401 - attempting re-authentication');
			},
			intercepts: true, // This handler intercepts and stops the error chain
		}),
		[setShouldTriggerAuth]
	);
};

// Export the error subject for other components to subscribe to
export { errorSubject };
