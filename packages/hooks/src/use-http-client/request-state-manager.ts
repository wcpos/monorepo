import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

/**
 * Singleton class that manages global HTTP request state across the application.
 * Coordinates token refresh, handles offline status, and prevents redundant requests.
 */
class RequestStateManager {
	private static instance: RequestStateManager;

	// Token refresh coordination
	private tokenRefreshPromise: Promise<void> | null = null;
	private isRefreshing = false;
	private refreshedToken: string | null = null; // Store the new token for waiting requests

	// Global state flags
	private offline = false;
	private authFailed = false;
	private requestsPaused = false;

	// Private constructor for singleton pattern
	private constructor() {}

	/**
	 * Get the singleton instance
	 */
	static getInstance(): RequestStateManager {
		if (!RequestStateManager.instance) {
			RequestStateManager.instance = new RequestStateManager();
		}
		return RequestStateManager.instance;
	}

	/**
	 * Check if a request can proceed based on current global state
	 */
	checkCanProceed(): { ok: boolean; reason?: string; errorCode?: string } {
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

	/**
	 * Check if a token refresh is currently in progress
	 */
	isTokenRefreshing(): boolean {
		return this.isRefreshing;
	}

	/**
	 * Start a token refresh operation. Only the first caller proceeds with refresh,
	 * subsequent callers await the same promise.
	 */
	async startTokenRefresh(refreshFn: () => Promise<string>): Promise<void> {
		if (this.tokenRefreshPromise) {
			log.debug('Token refresh already in progress, awaiting existing operation');
			return this.tokenRefreshPromise;
		}

		log.debug('Starting coordinated token refresh');
		this.isRefreshing = true;
		this.refreshedToken = null; // Clear any previous token

		this.tokenRefreshPromise = refreshFn()
			.then((newToken) => {
				log.debug('Token refresh completed successfully');
				this.refreshedToken = newToken; // Store the new token for waiting requests
				this.isRefreshing = false;
				this.authFailed = false; // Clear auth failed state on success
				this.tokenRefreshPromise = null;
			})
			.catch((error) => {
				// Error already logged by token refresh handler
				log.debug('Token refresh operation failed', {
					context: {
						error: error instanceof Error ? error.message : String(error),
					},
				});
				this.refreshedToken = null; // Clear token on failure
				this.isRefreshing = false;
				this.tokenRefreshPromise = null;
				throw error;
			});

		return this.tokenRefreshPromise;
	}

	/**
	 * Await an in-progress token refresh
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
	 * Pause all requests (for external control or future use)
	 * Note: Currently not used by token refresh - it relies on shared promises instead.
	 * This flag can be set externally to block all requests via pre-flight checks.
	 */
	pauseRequests(): void {
		if (!this.requestsPaused) {
			log.debug('Pausing all requests via state manager');
			this.requestsPaused = true;
		}
	}

	/**
	 * Resume all requests after pause
	 */
	resumeRequests(): void {
		if (this.requestsPaused) {
			log.debug('Resuming all requests via state manager');
			this.requestsPaused = false;
		}
	}

	/**
	 * Set offline status
	 */
	setOffline(isOffline: boolean): void {
		if (this.offline !== isOffline) {
			this.offline = isOffline;
			// Log significant state changes
			if (isOffline) {
				log.debug('Device is now offline - requests will be blocked');
			} else {
				log.debug('Device is back online - requests can proceed');
			}
		}
	}

	/**
	 * Set authentication failed status
	 */
	setAuthFailed(failed: boolean): void {
		if (this.authFailed !== failed) {
			this.authFailed = failed;
			// Log significant state changes
			if (failed) {
				log.debug('Authentication failed - requests will be blocked until re-auth');
			} else {
				log.debug('Authentication restored - requests can proceed');
			}
		}
	}

	/**
	 * Get current offline status
	 */
	isOffline(): boolean {
		return this.offline;
	}

	/**
	 * Get current auth failed status
	 */
	isAuthFailed(): boolean {
		return this.authFailed;
	}

	/**
	 * Check if requests are currently paused
	 */
	areRequestsPaused(): boolean {
		return this.requestsPaused;
	}

	/**
	 * Get the refreshed token (only available after successful refresh)
	 */
	getRefreshedToken(): string | null {
		return this.refreshedToken;
	}

	/**
	 * Clear the refreshed token
	 */
	clearRefreshedToken(): void {
		this.refreshedToken = null;
	}

	/**
	 * Reset all state (useful for testing or logout)
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
