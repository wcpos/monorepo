import { File, Paths } from 'expo-file-system';

export const CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY = 'wcpos.clearLocalDataOnNextLoad';

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

export const isClearLocalDataOnNextLoadScheduled = (): boolean => {
	try {
		return markerFile().exists;
	} catch {
		return false;
	}
};

export const unscheduleClearLocalDataOnNextLoad = (): void => {
	try {
		const file = markerFile();
		if (file.exists) {
			file.delete();
		}
	} catch {
		// Best-effort: a flag that cannot be removed re-triggers a harmless clear.
	}
};
