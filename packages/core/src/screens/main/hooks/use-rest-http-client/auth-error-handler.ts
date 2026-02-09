/**
 * Fallback Authentication Error Handler
 *
 * This handler is the last line of defense for authentication errors. It runs
 * AFTER the token-refresh handler has already attempted (and failed) to refresh
 * the JWT token.
 *
 * ## When This Handler Runs
 *
 * 1. **Token Refresh Failed**: The token-refresh handler tried to call /auth/refresh
 *    but got an error (401, 403, 404). It marked the error with `isRefreshTokenInvalid`
 *    and threw it. This handler catches it.
 *
 * 2. **Pre-flight Block**: The RequestStateManager blocked a request because
 *    `authFailed = true`. The error has `errorCode: AUTH_REQUIRED`.
 *
 * 3. **Direct 401**: A 401 that somehow bypassed token-refresh (shouldn't happen
 *    in normal flow, but handled for safety).
 *
 * ## Behavior Based on Error Type
 *
 * | Error Type | Behavior | Rationale |
 * |------------|----------|-----------|
 * | `isRefreshTokenInvalid` | Auto-launch OAuth | Session expired, needs immediate action |
 * | `AUTH_REQUIRED` (pre-flight) | Show toast with [Login] button | User may have cancelled intentionally |
 * | Other 401 | Auto-launch OAuth | Unexpected auth failure, try to recover |
 *
 * ## Why CanceledError?
 *
 * After triggering OAuth, we throw `CanceledError` to:
 * 1. Stop the error handler chain (no more handlers run)
 * 2. Prevent upstream error logging (useHttpClient suppresses CanceledError)
 * 3. Leave the request in a "pending" state (component shows loading)
 *
 * This is a semantic hack - we're not actually canceling the request, but it
 * achieves the desired behavior of stopping error propagation.
 *
 * ## OAuth Response Handling
 *
 * The useEffect watching `response` handles OAuth outcomes:
 * - **success**: Save tokens, clear authFailed, show success toast
 * - **error**: Show error toast (authFailed stays true)
 * - **cancel/dismiss**: Show info toast (authFailed stays true)
 *
 * When authFailed stays true, subsequent requests are blocked at pre-flight.
 * User must click [Login] button or interact with UI to retry.
 *
 * @see create-token-refresh-handler.ts - Runs before this handler
 * @see request-state-manager.ts - Manages authFailed state
 * @see README.md - Full architecture documentation
 */

import * as React from 'react';

import { CanceledError } from 'axios';
import { BehaviorSubject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';
import type { HttpErrorHandler } from '@wcpos/hooks/use-http-client';
import { requestStateManager } from '@wcpos/hooks/use-http-client';

import { useWcposAuth } from '../../../../hooks/use-wcpos-auth';
import { useLoginHandler } from '../../../auth/hooks/use-login-handler';

import type { Site, WPCredentials } from './types';

const authLogger = getLogger(['wcpos', 'auth', 'error']);

/**
 * RxJS subject for error events.
 * Components can subscribe to be notified of auth errors.
 */
const errorSubject = new BehaviorSubject<import('axios').AxiosError | null>(null);

/**
 * Hook that creates the fallback authentication error handler.
 *
 * This hook manages:
 * 1. OAuth flow triggering via expo-auth-session
 * 2. OAuth response processing
 * 3. Token persistence after successful login
 * 4. User ID validation (security check)
 *
 * @param site - Site configuration (login URL, name)
 * @param wpCredentials - WordPress user credentials document
 * @param onUserMismatch - Optional callback when logged in user doesn't match expected user
 * @returns HttpErrorHandler for use with useHttpClient
 */
export const useAuthErrorHandler = (
	site: Site,
	wpCredentials: WPCredentials,
	onUserMismatch?: () => void
): HttpErrorHandler => {
	const { handleLoginSuccess } = useLoginHandler(site as any);

	/**
	 * Ref to track processed OAuth responses.
	 * Prevents double-processing when response object changes but content is same.
	 */
	const processedResponseRef = React.useRef<string | null>(null);

	// Setup OAuth flow via platform-specific useWcposAuth hook
	const { response, promptAsync } = useWcposAuth({ site });

	// Keep a ref so the error handler always calls the latest promptAsync
	const promptAsyncRef = React.useRef(promptAsync);
	promptAsyncRef.current = promptAsync;

	/**
	 * Trigger OAuth flow directly — no state-as-trigger intermediate
	 */
	const triggerAuthFlow = React.useCallback(() => {
		authLogger.debug('Triggering OAuth flow', {
			context: { siteName: site.name },
		});
		promptAsyncRef
			.current()
			.then((result) => {
				authLogger.debug('promptAsync resolved', {
					context: { resultType: (result as any)?.type },
				});
			})
			.catch((authError) => {
				authLogger.warn('promptAsync rejected - Authentication failed', {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.AUTH_REQUIRED,
						siteName: site.name,
						error: authError instanceof Error ? authError.message : String(authError),
					},
				});
			});
	}, [site.name]);

	// ============================================================================
	// EFFECT: Process OAuth response
	// ============================================================================

	React.useEffect(() => {
		if (!response) return;

		// Deduplicate responses using a key based on response content
		const responseKey = response.params?.access_token || response.error || response.type;
		if (processedResponseRef.current === responseKey) {
			return;
		}

		/**
		 * Handle successful OAuth login.
		 * Order is important:
		 * 1. Validate user ID matches expected user
		 * 2. Save tokens BEFORE clearing authFailed
		 */
		const processSuccessfulLogin = async () => {
			processedResponseRef.current = responseKey;

			try {
				// Security check: Validate returned user ID matches expected user
				const returnedUserId = response.params?.id;
				const expectedUserId = wpCredentials.id;

				if (returnedUserId && expectedUserId && String(returnedUserId) !== String(expectedUserId)) {
					authLogger.error('Security: Logged in as different user than expected', {
						showToast: true,
						saveToDb: true,
						context: {
							errorCode: ERROR_CODES.INVALID_CREDENTIALS,
							expectedUserId,
							returnedUserId,
							siteName: site.name,
						},
					});

					// Trigger logout callback if provided
					if (onUserMismatch) {
						onUserMismatch();
					}
					return;
				}

				// 1. Save tokens to database
				await handleLoginSuccess({ params: response.params } as any);

				// 2. Set the new token in memory for immediate use
				// This avoids the race condition where RxDB hasn't persisted yet
				if (response.params?.access_token) {
					requestStateManager.setRefreshedToken(response.params.access_token);
				}

				// 3. Clear authFailed AFTER tokens are saved
				// This allows pending requests to proceed with new token
				requestStateManager.setAuthFailed(false);

				authLogger.success('Successfully logged in', {
					showToast: true,
					saveToDb: true,
					context: {
						siteName: site.name,
						userId: wpCredentials.id,
					},
				});
			} catch (error) {
				authLogger.error('Failed to save login credentials', {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						siteName: site.name,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}
		};

		if (response.type === 'success') {
			processSuccessfulLogin();
		} else if (response.type === 'error') {
			// OAuth returned an error (e.g., invalid credentials)
			// authFailed stays true - user needs to try again
			authLogger.warn('Login failed - please check your credentials', {
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
			// User intentionally closed the auth window
			// authFailed stays true - prevents background request spam
			// User must click [Login] or interact with UI to retry
			authLogger.warn('Login cancelled', {
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
	}, [response, handleLoginSuccess, site.name, wpCredentials.id, onUserMismatch]);

	// ============================================================================
	// ERROR HANDLER
	// ============================================================================

	return React.useMemo(
		() => ({
			name: 'fallback-auth-handler',
			priority: 50, // Lower than token-refresh (100) - runs second
			intercepts: true, // Stops error chain when handling

			/**
			 * Check if this handler should process the error.
			 *
			 * Catches:
			 * - Direct 401 errors (backup)
			 * - Pre-flight AUTH_REQUIRED errors
			 * - Errors marked by token-refresh handler as refresh failures
			 */
			canHandle: (error) => {
				const canHandle =
					error.response?.status === 401 ||
					(error as any).errorCode === ERROR_CODES.AUTH_REQUIRED ||
					(error as any).isRefreshTokenInvalid ||
					(error as any).refreshTokenInvalid ||
					(error instanceof Error && error.message === 'REFRESH_TOKEN_INVALID');

				authLogger.debug('Fallback auth handler canHandle check', {
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

			/**
			 * Handle the authentication error.
			 *
			 * Determines whether to auto-launch OAuth or show a toast with [Login] button,
			 * then throws CanceledError to suppress upstream error handling.
			 */
			handle: async (context) => {
				const { error } = context;

				authLogger.debug('Fallback auth handler triggered', {
					context: {
						errorMessage: error instanceof Error ? error.message : String(error),
						errorStatus: (error as any)?.response?.status,
						errorCode: (error as any)?.errorCode,
						hasRefreshTokenInvalidFlag: (error as any)?.isRefreshTokenInvalid,
						hasRefreshTokenInvalidFlag2: (error as any)?.refreshTokenInvalid,
					},
				});

				const isRefreshTokenInvalid =
					(error as any).isRefreshTokenInvalid ||
					(error as any).refreshTokenInvalid ||
					(error instanceof Error && error.message === 'REFRESH_TOKEN_INVALID');

				if (isRefreshTokenInvalid) {
					// Session expired - immediate OAuth is appropriate
					authLogger.debug('Refresh token is invalid, launching OAuth flow');
					triggerAuthFlow();
				} else if ((error as any).errorCode === ERROR_CODES.AUTH_REQUIRED) {
					// Pre-flight block (user may have cancelled previously)
					// Show toast with [Login] button instead of auto-launching
					// This prevents OAuth window spam if user keeps dismissing
					authLogger.debug('Auth required (pre-flight blocked), showing toast');
					authLogger.warn('Please log in to continue', {
						showToast: true,
						saveToDb: true,
						toast: {
							action: {
								label: 'Login',
								onClick: () => triggerAuthFlow(),
							},
						},
						context: {
							errorCode: ERROR_CODES.AUTH_REQUIRED,
							siteName: site.name,
						},
					});
				} else {
					// Unknown auth failure - try OAuth
					authLogger.debug('Token refresh failed, attempting OAuth flow');
					triggerAuthFlow();
				}

				// Notify subscribers of the auth error
				errorSubject.next(context.error);

				// Throw CanceledError to:
				// 1. Stop the error handler chain
				// 2. Prevent upstream error logging (useHttpClient suppresses this)
				// 3. Leave the calling component in "loading" state
				throw new CanceledError('401 - attempting re-authentication');
			},
		}),
		[triggerAuthFlow, site.name]
	);
};

// Export the error subject for other components to subscribe to
export { errorSubject };
