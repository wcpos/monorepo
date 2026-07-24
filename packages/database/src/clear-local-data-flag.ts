export const CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY = 'wcpos.clearLocalDataOnNextLoad';

/**
 * Schedule a pre-hydration full reset: the app root checks this flag on the
 * next load and clears databases before anything re-opens them.
 *
 * Returns false when the flag cannot be persisted (storage-restricted
 * embedded browsers, quota exhaustion) so callers can fall back to a direct
 * clear instead of reloading into a no-op.
 */
export const scheduleClearLocalDataOnNextLoad = (): boolean => {
	try {
		window.localStorage.setItem(CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY, '1');
		return true;
	} catch {
		return false;
	}
};
