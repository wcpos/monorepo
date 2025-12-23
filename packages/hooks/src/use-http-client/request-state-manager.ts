/**
 * Request State Manager
 *
 * A singleton that coordinates global HTTP request state across all components
 * and hook instances in the application.
 *
 * ## Purpose
 *
 * Without centralized coordination, multiple concurrent 401 errors would each
 * trigger independent token refresh attempts, causing race conditions and
 * wasted requests. This manager ensures:
 *
 * 1. **Single Token Refresh**: Only one refresh happens at a time
 * 2. **Request Blocking**: Requests wait or fail-fast based on global state
 * 3. **State Synchronization**: All hook instances share the same state
 *
 * ## State Flags
 *
 * | Flag | When Set | Effect |
 * |------|----------|--------|
 * | `offline` | Device loses network | Requests fail immediately with DEVICE_OFFLINE |
 * | `authFailed` | Token refresh fails | Requests fail immediately with AUTH_REQUIRED |
 * | `isRefreshing` | Token refresh in progress | Requests wait for completion |
 * | `requestsPaused` | Manual pause (recovery) | Requests fail with SERVICE_UNAVAILABLE |
 *
 * ## Token Refresh Coordination
 *
 * Uses a shared promise pattern to prevent race conditions:
 *
 * ```
 * Request A: 401 → startTokenRefresh() → Creates promise, starts refresh
 * Request B: 401 → isTokenRefreshing() → true → awaitTokenRefresh() → Waits
 * Request C: 401 → isTokenRefreshing() → true → awaitTokenRefresh() → Waits
 *
 * Refresh completes → Promise resolves → All requests get new token
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { requestStateManager } from '@wcpos/hooks/use-http-client';
 *
 * // Pre-flight check (used by useHttpClient)
 * const { ok, reason, errorCode } = requestStateManager.checkCanProceed();
 * if (!ok) throw new Error(reason);
 *
 * // Token refresh coordination (used by token-refresh handler)
 * if (requestStateManager.isTokenRefreshing()) {
 *   await requestStateManager.awaitTokenRefresh();
 *   const newToken = requestStateManager.getRefreshedToken();
 * } else {
 *   await requestStateManager.startTokenRefresh(async () => {
 *     const token = await refreshFromServer();
 *     return token;
 *   });
 * }
 *
 * // State management (used by useRestHttpClient, auth handlers)
 * requestStateManager.setOffline(true);
 * requestStateManager.setAuthFailed(true);
 * ```
 *
 * @see README.md - Full architecture documentation
 */

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

/**
 * Result of pre-flight check
 */
interface CanProceedResult {
	/** Whether the request can proceed */
	ok: boolean;
	/** Human-readable reason if blocked */
	reason?: string;
	/** Machine-readable error code if blocked */
	errorCode?: string;
}

/**
 * Singleton class that manages global HTTP request state across the application.
 * Coordinates token refresh, handles offline status, and prevents redundant requests.
 */
class RequestStateManager {
	private static instance: RequestStateManager;

	// Token refresh coordination
	private tokenRefreshPromise: Promise<void> | null = null;
	private isRefreshing = false;
	private refreshedToken: string | null = null;

	// Global state flags
	private offline = false;
	private authFailed = false;
	private requestsPaused = false;

	// Visibility/sleep coordination
	private isSleeping = false;
	private wakeCallbacks: (() => void)[] = [];
	private visibilityCleanup: (() => void) | null = null;

	// Private constructor for singleton pattern
	private constructor() {
		this.setupVisibilityListener();
	}

	/**
	 * Set up visibility change listener for web/Electron.
	 * When app goes to background, we mark as sleeping.
	 * When app wakes, we clear stale state before allowing requests.
	 */
	private setupVisibilityListener(): void {
		if (typeof document === 'undefined' || !document.addEventListener) {
			return;
		}

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'hidden') {
				this.handleSleep();
			} else if (document.visibilityState === 'visible') {
				this.handleWake();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);
		this.visibilityCleanup = () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}

	/**
	 * Called when app goes to background/sleep.
	 * Marks the manager as sleeping to prevent request pile-up.
	 */
	private handleSleep(): void {
		if (!this.isSleeping) {
			this.isSleeping = true;
		}
	}

	/**
	 * Called when app wakes from background.
	 * Clears any stale state and notifies listeners.
	 */
	private handleWake(): void {
		if (this.isSleeping) {
			this.isSleeping = false;

			// Notify any registered wake callbacks (e.g., queue clearing)
			for (const callback of this.wakeCallbacks) {
				try {
					callback();
				} catch (e) {
					// Silently ignore wake callback errors
				}
			}
		}
	}

	/**
	 * Register a callback to be called when app wakes from sleep.
	 * Used by request queue to clear stale requests.
	 *
	 * @param callback - Function to call on wake
	 * @returns Cleanup function to unregister the callback
	 */
	onWake(callback: () => void): () => void {
		this.wakeCallbacks.push(callback);
		return () => {
			this.wakeCallbacks = this.wakeCallbacks.filter((cb) => cb !== callback);
		};
	}

	/**
	 * Check if app is currently sleeping (in background).
	 */
	isAppSleeping(): boolean {
		return this.isSleeping;
	}

	/**
	 * Get the singleton instance
	 */
	static getInstance(): RequestStateManager {
		if (!RequestStateManager.instance) {
			RequestStateManager.instance = new RequestStateManager();
		}
		return RequestStateManager.instance;
	}

	// ============================================================================
	// PRE-FLIGHT CHECKS
	// ============================================================================

	/**
	 * Check if a request can proceed based on current global state.
	 *
	 * This is called before every request to fail-fast when we know
	 * the request cannot succeed.
	 *
	 * Order of checks:
	 * 1. Sleeping - App is in background, don't queue more requests
	 * 2. Offline - No point trying if there's no network
	 * 3. Auth Failed - No point trying if we need re-authentication
	 * 4. Paused - System is in recovery mode
	 *
	 * @returns Object with `ok` boolean and optional error details
	 */
	checkCanProceed(): CanProceedResult {
		// Don't queue new requests while app is sleeping
		// This prevents pile-up during sleep
		if (this.isSleeping) {
			return {
				ok: false,
				reason: 'App is in background',
				errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
				// Special flag so callers can handle this silently
				isSleeping: true,
			} as CanProceedResult & { isSleeping: boolean };
		}

		if (this.offline) {
			return {
				ok: false,
				reason: 'No internet connection',
				errorCode: ERROR_CODES.DEVICE_OFFLINE,
			};
		}

		if (this.authFailed) {
			return {
				ok: false,
				reason: 'Please log in to continue',
				errorCode: ERROR_CODES.AUTH_REQUIRED,
			};
		}

		if (this.requestsPaused) {
			log.debug('Request blocked: Requests paused for recovery');
			return {
				ok: false,
				reason: 'System is recovering - please wait',
				errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
			};
		}

		return { ok: true };
	}

	// ============================================================================
	// TOKEN REFRESH COORDINATION
	// ============================================================================

	/**
	 * Check if a token refresh is currently in progress.
	 *
	 * Used by token-refresh handler to decide whether to:
	 * - Start a new refresh (if false)
	 * - Wait for existing refresh (if true)
	 */
	isTokenRefreshing(): boolean {
		return this.isRefreshing;
	}

	/**
	 * Start a token refresh operation.
	 *
	 * Only the first caller actually performs the refresh. Subsequent callers
	 * (while refresh is in progress) will receive the same promise via
	 * `awaitTokenRefresh()`.
	 *
	 * The refresh function should:
	 * 1. Call the auth/refresh endpoint
	 * 2. Save new token to database
	 * 3. Return the new access token string
	 *
	 * @param refreshFn - Async function that performs the token refresh
	 * @returns Promise that resolves when refresh is complete
	 *
	 * @example
	 * await requestStateManager.startTokenRefresh(async () => {
	 *   const response = await fetch('/auth/refresh', { ... });
	 *   const { access_token } = await response.json();
	 *   await wpUser.incrementalPatch({ access_token });
	 *   return access_token;
	 * });
	 */
	async startTokenRefresh(refreshFn: () => Promise<string>): Promise<void> {
		// If refresh is already in progress, return the existing promise
		// Check BOTH flags to be safe against race conditions
		if (this.tokenRefreshPromise || this.isRefreshing) {
			log.debug('Token refresh already in progress, awaiting existing operation', {
				context: {
					hasPromise: !!this.tokenRefreshPromise,
					isRefreshing: this.isRefreshing,
				},
			});
			// If we have a promise, await it; otherwise just return (edge case)
			if (this.tokenRefreshPromise) {
				return this.tokenRefreshPromise;
			}
			return;
		}

		// Set the flag FIRST before any async operations
		// This prevents race conditions where multiple handlers check simultaneously
		this.isRefreshing = true;
		this.refreshedToken = null;

		log.debug('Starting coordinated token refresh (lock acquired)');

		// Create and store the promise so other callers can await it
		this.tokenRefreshPromise = refreshFn()
			.then((newToken) => {
				log.debug('Token refresh completed successfully');
				this.refreshedToken = newToken;
				this.isRefreshing = false;
				this.authFailed = false; // Clear auth failed on successful refresh
				this.tokenRefreshPromise = null;
			})
			.catch((error) => {
				log.debug('Token refresh operation failed', {
					context: {
						error: error instanceof Error ? error.message : String(error),
					},
				});
				this.refreshedToken = null;
				this.isRefreshing = false;
				this.tokenRefreshPromise = null;
				throw error;
			});

		return this.tokenRefreshPromise;
	}

	/**
	 * Wait for an in-progress token refresh to complete.
	 *
	 * Called by requests that encounter a 401 while a refresh is already
	 * in progress. They wait for the refresh to complete, then retry
	 * with the new token.
	 *
	 * @throws If the token refresh fails
	 */
	async awaitTokenRefresh(): Promise<void> {
		if (!this.tokenRefreshPromise) {
			log.debug('No token refresh in progress, nothing to await');
			return;
		}

		log.debug('Awaiting in-progress token refresh');
		try {
			await this.tokenRefreshPromise;
			log.debug('Token refresh completed, request can proceed');
		} catch (error) {
			log.debug('Token refresh failed while awaiting', {
				context: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
			throw error;
		}
	}

	/**
	 * Get the token that was obtained from the last successful refresh.
	 *
	 * This is used by waiting requests to get the new token without having
	 * to re-read from the database (which might have async delays).
	 *
	 * @returns The refreshed access token, or null if refresh hasn't completed
	 */
	getRefreshedToken(): string | null {
		return this.refreshedToken;
	}

	/**
	 * Set the refreshed token directly.
	 *
	 * This is used by OAuth login to immediately make the new token available
	 * to pending requests, without waiting for RxDB to persist.
	 *
	 * @param token - The new access token from OAuth login
	 */
	setRefreshedToken(token: string): void {
		log.debug('Setting refreshed token directly (from OAuth login)');
		this.refreshedToken = token;
	}

	/**
	 * Clear the stored refreshed token.
	 *
	 * Called after the token has been used or on logout.
	 */
	clearRefreshedToken(): void {
		this.refreshedToken = null;
	}

	// ============================================================================
	// STATE MANAGEMENT
	// ============================================================================

	/**
	 * Pause all requests.
	 *
	 * This is a manual override for external control (e.g., during system recovery).
	 * Paused requests fail immediately with SERVICE_UNAVAILABLE.
	 *
	 * Note: Token refresh coordination does NOT use this flag. It relies on the
	 * shared promise pattern instead, which allows requests to wait rather than fail.
	 */
	pauseRequests(): void {
		if (!this.requestsPaused) {
			log.debug('Pausing all requests via state manager');
			this.requestsPaused = true;
		}
	}

	/**
	 * Resume all requests after pause.
	 */
	resumeRequests(): void {
		if (this.requestsPaused) {
			log.debug('Resuming all requests via state manager');
			this.requestsPaused = false;
		}
	}

	/**
	 * Set offline status.
	 *
	 * Called by useRestHttpClient when online status changes.
	 * When offline, all requests fail immediately with DEVICE_OFFLINE.
	 *
	 * @param isOffline - True if device is offline
	 */
	setOffline(isOffline: boolean): void {
		if (this.offline !== isOffline) {
			this.offline = isOffline;
			if (isOffline) {
				log.debug('Device is now offline - requests will be blocked');
			} else {
				log.debug('Device is back online - requests can proceed');
			}
		}
	}

	/**
	 * Set authentication failed status.
	 *
	 * Called when:
	 * - Token refresh fails with invalid refresh token
	 * - User cancels OAuth flow (stays true - requires explicit login)
	 *
	 * Cleared when:
	 * - Token refresh succeeds
	 * - OAuth login succeeds
	 *
	 * When true, all requests fail immediately with AUTH_REQUIRED.
	 * This prevents background polling from spamming failed requests.
	 *
	 * @param failed - True if authentication has failed
	 */
	setAuthFailed(failed: boolean): void {
		if (this.authFailed !== failed) {
			this.authFailed = failed;
			if (failed) {
				log.debug('Authentication failed - requests will be blocked until re-auth');
			} else {
				log.debug('Authentication restored - requests can proceed');
			}
		}
	}

	// ============================================================================
	// STATE GETTERS
	// ============================================================================

	/**
	 * Get current offline status.
	 */
	isOffline(): boolean {
		return this.offline;
	}

	/**
	 * Get current auth failed status.
	 */
	isAuthFailed(): boolean {
		return this.authFailed;
	}

	/**
	 * Check if requests are currently paused.
	 */
	areRequestsPaused(): boolean {
		return this.requestsPaused;
	}

	// ============================================================================
	// RESET
	// ============================================================================

	/**
	 * Reset all state to initial values.
	 *
	 * Used for:
	 * - Logout (clear all state)
	 * - Testing (ensure clean state between tests)
	 * - Recovery from stuck states
	 */
	reset(): void {
		log.debug('Resetting request state manager');
		this.tokenRefreshPromise = null;
		this.isRefreshing = false;
		this.refreshedToken = null;
		this.offline = false;
		this.authFailed = false;
		this.requestsPaused = false;
	}
}

// Export singleton instance
export const requestStateManager = RequestStateManager.getInstance();
