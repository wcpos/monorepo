export const CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY = 'wcpos.clearLocalDataOnNextLoad';

export type ClearLocalDataFlag = 'scheduled' | 'not-scheduled' | 'unknown';

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

/**
 * A storage sandbox that throws on read also throws on write, so it can never
 * hold an armed flag — read failures report 'not-scheduled' rather than
 * 'unknown', otherwise storage-restricted embedded browsers (which worked via
 * the direct-clear fallback before the flag existed) would block on startup
 * forever.
 */
export const readClearLocalDataOnNextLoadFlag = (): ClearLocalDataFlag => {
	try {
		return window.localStorage.getItem(CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY) === '1'
			? 'scheduled'
			: 'not-scheduled';
	} catch {
		return 'not-scheduled';
	}
};

export const unscheduleClearLocalDataOnNextLoad = (): void => {
	try {
		window.localStorage.removeItem(CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY);
	} catch {
		// A removal failure is observable: the caller's post-clear verification
		// read still sees 'scheduled' and refuses to hydrate.
	}
};
