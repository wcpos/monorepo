import { File, Paths } from 'expo-file-system';

import { TILL_ANCHOR_KEY, type TillAnchor } from './till-anchor-key';

export { TILL_ANCHOR_KEY };
export type { TillAnchor };

/**
 * The till anchor: a second copy of the till id (the `register` local document in the
 * user database) kept outside that database, so hydration can tell a database that was
 * copied from another installation. When a register that was anchored finds the anchor
 * missing or holding another id, the database came from somewhere else and the till is
 * re-minted before it sells (`settleRegister` in @wcpos/query). Known limits: the
 * anchor travels with whatever copies it, so a copied browser profile (localStorage
 * included) or a device backup that includes the Documents directory copies the anchor
 * too, and those clones are not detected. What is detected: an OPFS or database-file
 * copy on its own, the E2E snapshot restore (which leaves the anchor out), and a
 * database restored under a different profile. An Electron profile copy is not detected
 * either, for the same reason as a browser profile. On iOS the marker is not written
 * atomically, so a crash mid-write reads as absent or mismatched and costs one extra
 * re-mint, the safe direction.
 *
 * Native has no localStorage, so the anchor is a marker file in the document directory,
 * read and written synchronously like the clear-local-data flag.
 */
const anchorFile = () => new File(Paths.document, TILL_ANCHOR_KEY);

/**
 * null when no anchor is stored; 'unknown' only when the filesystem throws, which the
 * caller must treat as "cannot tell", never as "absent".
 */
export const readTillAnchor = (): TillAnchor => {
	try {
		const file = anchorFile();
		return file.exists ? file.textSync().trim() || null : null;
	} catch {
		return 'unknown';
	}
};

/** Returns false when the marker cannot be written (full or read-only storage). */
export const writeTillAnchor = (id: string): boolean => {
	try {
		anchorFile().writeSync(id);
		return true;
	} catch {
		return false;
	}
};

export const clearTillAnchor = (): void => {
	try {
		const file = anchorFile();
		if (file.exists) {
			file.delete();
		}
	} catch {
		// A surviving anchor beside a cleared database is harmless: the next boot
		// mints a fresh register and overwrites it.
	}
};
