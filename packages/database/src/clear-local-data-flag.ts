import { File, Paths } from 'expo-file-system';

export const CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY = 'wcpos.clearLocalDataOnNextLoad';

export type ClearLocalDataFlag = 'scheduled' | 'not-scheduled' | 'unknown';

/**
 * Native has no localStorage, so the flag is a marker file in the app's
 * document directory, readable synchronously before hydration. It lives
 * outside the database directories on purpose: clearAllDB must never delete
 * the flag mid-flow.
 */
const markerFile = () => new File(Paths.document, CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY);

/**
 * Schedule a pre-hydration full reset: the app root checks this flag on the
 * next load and clears databases before anything re-opens them.
 *
 * Returns false when the marker cannot be written (full or read-only storage)
 * so callers can refuse instead of reloading into a no-op.
 */
export const scheduleClearLocalDataOnNextLoad = (): boolean => {
	try {
		markerFile().write('1');
		return true;
	} catch {
		return false;
	}
};

/**
 * `File.exists` is non-throwing by contract (it reports false without read
 * access), so 'unknown' should never happen — but if the filesystem layer does
 * throw, an armed marker may be hiding behind the error, and hydrating anyway
 * would let a later launch destroy everything sold in between. Callers must
 * treat 'unknown' as "do not open the databases".
 */
export const readClearLocalDataOnNextLoadFlag = (): ClearLocalDataFlag => {
	try {
		return markerFile().exists ? 'scheduled' : 'not-scheduled';
	} catch {
		return 'unknown';
	}
};

export const unscheduleClearLocalDataOnNextLoad = (): void => {
	try {
		const file = markerFile();
		if (file.exists) {
			file.delete();
		}
	} catch {
		// A removal failure is observable: the caller's post-clear verification
		// read still sees 'scheduled' (or 'unknown') and refuses to hydrate.
	}
};
