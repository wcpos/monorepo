import * as React from 'react';

import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { useWcposAuth } from '../../../../hooks/use-wcpos-auth';
import { useLoginHandler } from '../../../auth/hooks/use-login-handler';

import type { Site, WPCredentials } from './types';

const authLogger = getLogger(['wcpos', 'auth', 'error']);

export const useSessionLoginFlow = (
	site: Site,
	wpCredentials: WPCredentials,
	onUserMismatch?: () => void | Promise<void>
): { triggerAuthFlow: () => void } => {
	const { handleLoginSuccess } = useLoginHandler(site as any);
	const t = useT();

	/**
	 * Ref to track processed OAuth responses.
	 * Prevents double-processing when response object changes but content is same.
	 */
	const processedResponseRef = React.useRef<string | null>(null);

	// Setup OAuth flow via platform-specific useWcposAuth hook. The narrow site
	// object matches the auth-screen caller idiom (see add-user-button); memoized
	// so the config's site identity stays stable across renders like the document
	// it replaces.
	const authSite = React.useMemo(
		() => ({ wcpos_login_url: site.wcpos_login_url ?? '', name: site.name ?? '' }),
		[site.wcpos_login_url, site.name]
	);
	const { response, promptAsync } = useWcposAuth({ site: authSite });

	// Keep a ref so the error handler always calls the latest promptAsync.
	// The ref write is done in an effect (not during render) to avoid mutating a
	// ref during render.
	const authFlowInFlightRef = React.useRef(false);
	const promptAsyncRef = React.useRef(promptAsync);
	React.useEffect(() => {
		promptAsyncRef.current = promptAsync;
	}, [promptAsync]);

	/**
	 * Trigger OAuth flow directly — no state-as-trigger intermediate
	 */
	const triggerAuthFlow = React.useCallback(() => {
		if (authFlowInFlightRef.current) {
			authLogger.debug('OAuth flow already in flight, skipping');
			return;
		}
		authFlowInFlightRef.current = true;
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
					code: ERROR_CODES.AUTH_UNEXPECTED,
					context: {
						siteName: site.name,
						error: getErrorMessage(authError),
					},
				});
			})
			.finally(() => {
				authFlowInFlightRef.current = false;
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
						code: ERROR_CODES.SIGNED_IN_AS_WRONG_USER,
						context: {
							expectedUserId,
							returnedUserId,
							siteName: site.name,
						},
					});

					// Trigger logout callback if provided. This is the security-critical
					// force-logout on a user mismatch, so a rejection must be reported
					// rather than surfacing as an unhandled rejection.
					if (onUserMismatch) {
						// Promise.resolve().then(...) also catches a synchronous throw from the
						// callback, which Promise.resolve(onUserMismatch()) would let escape to
						// the outer catch and be mislabelled LOCAL_DB_WRITE_FAILED.
						await Promise.resolve()
							.then(() => onUserMismatch())
							.catch((error) => {
								// The cashier is still signed in as the wrong user — that must be
								// visible at the till, not only in the log pipeline.
								authLogger.error('Forced logout after user mismatch failed', {
									showToast: true,
									code: ERROR_CODES.SIGNED_IN_AS_WRONG_USER,
									toast: { title: t('auth.forced_logout_failed') },
									context: { siteName: site.name, error },
								});
							});
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

				// The silent refresh path already tells the cashier
				// “Session renewed automatically” (auth.session_renewed_automatically),
				// so the interactive path must use the same noun: one mechanism, one
				// story. The log message stays as it is — that string is the
				// developer's, and it is correct.
				authLogger.success('Successfully logged in', {
					showToast: true,
					toast: { title: t('auth.session_renewed') },
					context: {
						siteName: site.name,
						userId: wpCredentials.id,
					},
				});
			} catch (error) {
				authLogger.error('Failed to save login credentials', {
					showToast: true,
					code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
					context: {
						siteName: site.name,
						error: getErrorMessage(error),
					},
				});
			}
		};

		if (response.type === 'success') {
			void processSuccessfulLogin();
		} else if (response.type === 'error') {
			// OAuth returned an error (e.g., invalid credentials)
			// authFailed stays true - user needs to try again
			authLogger.warn('Login failed - please check your credentials', {
				showToast: true,
				code: ERROR_CODES.CREDENTIALS_REJECTED,
				context: {
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
			// `warn`, not `info`, and not “Login cancelled”: this branch also fires on
			// `locked` — the device screen locking, which the cashier never chose — so
			// “cancelled” is factually wrong for one of its three triggers. And while
			// `authFailed` stays latched, every request to the store fails immediately
			// with AUTH_REQUIRED (see request-state-manager.ts). The cashier knows the
			// window closed; what they do not know is that the store is now
			// unreachable, and that consequence is the load-bearing information.
			authLogger.warn('Login cancelled', {
				showToast: true,
				toast: { title: t('auth.session_expired') },
				context: {
					siteName: site.name,
					status: response.type,
				},
			});
			processedResponseRef.current = responseKey;
		}
	}, [response, handleLoginSuccess, site.name, wpCredentials.id, onUserMismatch, t]);

	return { triggerAuthFlow };
};
