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
 *    `authFailed = true`. The error has `blockCode: PREFLIGHT_BLOCK.AUTH_REQUIRED`.
 *
 * 3. **Direct 401**: A 401 that somehow bypassed token-refresh (shouldn't happen
 *    in normal flow, but handled for safety).
 *
 * ## Behavior Based on Error Type
 *
 * | Error Type | Behavior | Rationale |
 * |------------|----------|-----------|
 * | `isRefreshTokenInvalid` | Auto-launch OAuth | Session expired, needs immediate action |
 * | auth-required pre-flight block | Show toast with [Login] button | User may have cancelled intentionally |
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
 * - **cancel/dismiss/locked**: Warn that the session expired (authFailed stays true)
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

import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { HttpErrorHandler } from '@wcpos/hooks/use-http-client';
import { PREFLIGHT_BLOCK } from '@wcpos/hooks/use-http-client';

import { useSessionLoginFlow } from './use-session-login-flow';

import type { Site, WPCredentials } from './types';

const authLogger = getLogger(['wcpos', 'auth', 'error']);

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
	onUserMismatch?: () => void | Promise<void>
): HttpErrorHandler => {
	const { triggerAuthFlow } = useSessionLoginFlow(site, wpCredentials, onUserMismatch);

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
			 * - Pre-flight auth-required blocks (blockCode)
			 * - Errors marked by token-refresh handler as refresh failures
			 */
			canHandle: (error) => {
				const canHandle =
					error.response?.status === 401 ||
					(error as any).blockCode === PREFLIGHT_BLOCK.AUTH_REQUIRED ||
					(error as any).isRefreshTokenInvalid ||
					(error as any).refreshTokenInvalid ||
					(error instanceof Error && error.message === 'REFRESH_TOKEN_INVALID');

				authLogger.debug('Fallback auth handler canHandle check', {
					context: {
						canHandle,
						errorStatus: error.response?.status,
						blockCode: (error as any).blockCode,
						hasRefreshTokenInvalidFlag: (error as any).isRefreshTokenInvalid,
						hasRefreshTokenInvalidFlag2: (error as any).refreshTokenInvalid,
						errorMessage: getErrorMessage(error),
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
						errorMessage: getErrorMessage(error),
						errorStatus: (error as any)?.response?.status,
						blockCode: (error as any)?.blockCode,
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
				} else if ((error as any).blockCode === PREFLIGHT_BLOCK.AUTH_REQUIRED) {
					// Pre-flight block (user may have cancelled previously)
					// Show toast with [Login] button instead of auto-launching
					// This prevents OAuth window spam if user keeps dismissing
					authLogger.debug('Auth required (pre-flight blocked), showing toast');
					authLogger.warn('Please log in to continue', {
						showToast: true,
						toast: {
							action: {
								label: 'Login',
								onClick: () => triggerAuthFlow(),
							},
						},
						code: ERROR_CODES.SESSION_EXPIRED,
						context: {
							siteName: site.name,
						},
					});
				} else {
					// Unknown auth failure - try OAuth
					authLogger.debug('Token refresh failed, attempting OAuth flow');
					triggerAuthFlow();
				}
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
