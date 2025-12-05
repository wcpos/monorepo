import * as React from 'react';

import { CanceledError } from 'axios';
import { BehaviorSubject } from 'rxjs';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';
import type { HttpErrorHandler } from '@wcpos/hooks/use-http-client';
import { requestStateManager } from '@wcpos/hooks/use-http-client';

import { useWcposAuth } from '../../../../hooks/use-wcpos-auth';
import { useLoginHandler } from '../../../auth/hooks/use-login-handler';

import type { Site, WPCredentials } from './types';

const errorSubject = new BehaviorSubject(null);

/**
 * Hook that creates an auth error handler for token refresh and login redirect
 */
export const useAuthErrorHandler = (site: Site, wpCredentials: WPCredentials): HttpErrorHandler => {
	const { handleLoginSuccess } = useLoginHandler(site as any);
	const [shouldTriggerAuth, setShouldTriggerAuth] = React.useState(false);
	const processedResponseRef = React.useRef<string | null>(null);

	const { response, promptAsync } = useWcposAuth({ site });

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
		if (!response) return;

		// Create a unique key to prevent double-processing
		const responseKey = response.params?.access_token || response.error || response.type;
		if (processedResponseRef.current === responseKey) {
			return;
		}

		if (response.type === 'success') {
			log.success('Successfully logged in', {
				showToast: true,
			});
			log.debug('Authentication successful', {
				context: {
					siteName: site.name,
					userId: wpCredentials.id,
				},
			});
			processedResponseRef.current = responseKey;
			// Clear auth failed state on successful login
			requestStateManager.setAuthFailed(false);
			handleLoginSuccess({ params: response.params } as any);
		} else if (response.type === 'error') {
			log.warn('Login failed - please check your credentials', {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.INVALID_CREDENTIALS,
					siteName: site.name,
					errorDetails: response.error,
				},
			});
			processedResponseRef.current = responseKey;
		} else if (
			response.type === 'dismiss' ||
			response.type === 'cancel' ||
			response.type === 'locked'
		) {
			// User cancelled or dismissed the auth window
			// NOTE: We DO NOT reset authFailed state here.
			// This ensures that background requests continue to be blocked.
			// User must actively trigger a new request (e.g. pull to refresh) or click the Login button in the toast to retry.

			log.warn('Login cancelled', {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.AUTH_REQUIRED,
					siteName: site.name,
					status: response.type,
				},
			});
			processedResponseRef.current = responseKey;
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
					(error as any).errorCode === ERROR_CODES.AUTH_REQUIRED ||
					(error as any).isRefreshTokenInvalid ||
					(error as any).refreshTokenInvalid ||
					(error instanceof Error && error.message === 'REFRESH_TOKEN_INVALID');

				log.debug('Fallback auth handler canHandle check', {
					context: {
						canHandle,
						errorStatus: error.response?.status,
						errorCode: (error as any).errorCode,
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
						errorCode: (error as any)?.errorCode,
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
					// Auto-launch for session expiration
					setShouldTriggerAuth(true);
				} else if ((error as any).errorCode === ERROR_CODES.AUTH_REQUIRED) {
					log.debug('Auth required (pre-flight blocked), showing toast');
					// For pre-flight blocks (e.g. user cancelled previously), show Toast with Login button
					// instead of auto-launching to avoid intrusive loops
					log.warn('Please log in to continue', {
						showToast: true,
						saveToDb: true,
						toast: {
							action: {
								label: 'Login',
								onClick: () => setShouldTriggerAuth(true),
							},
						},
						context: {
							errorCode: ERROR_CODES.AUTH_REQUIRED,
							siteName: site.name,
						},
					});
				} else {
					log.debug('Token refresh failed, attempting OAuth flow');
					// Auto-launch for other auth failures
					setShouldTriggerAuth(true);
				}

				errorSubject.next(context.error);

				// Throw a CanceledError to stop the request chain and suppress upstream errors
				throw new CanceledError('401 - attempting re-authentication');
			},
			intercepts: true, // This handler intercepts and stops the error chain
		}),
		[setShouldTriggerAuth, site.name]
	);
};

// Export the error subject for other components to subscribe to
export { errorSubject };
