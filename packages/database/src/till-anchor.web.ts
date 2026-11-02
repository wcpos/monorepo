import { TILL_ANCHOR_KEY, type TillAnchor } from './till-anchor-key';

export { TILL_ANCHOR_KEY };
export type { TillAnchor };

/**
 * The till id as last written outside the database (see till-anchor.ts). null when
 * no anchor is stored; 'unknown' only when storage itself throws on read, which the
 * caller must treat as "cannot tell", never as "absent".
 */
export const readTillAnchor = (): TillAnchor => {
	try {
		return window.localStorage.getItem(TILL_ANCHOR_KEY) || null;
	} catch {
		return 'unknown';
	}
};

/** Returns false when the anchor cannot be persisted (quota, restricted storage). */
export const writeTillAnchor = (id: string): boolean => {
	try {
		window.localStorage.setItem(TILL_ANCHOR_KEY, id);
		return true;
	} catch {
		return false;
	}
};

export const clearTillAnchor = (): void => {
	try {
		window.localStorage.removeItem(TILL_ANCHOR_KEY);
	} catch {
		// Storage that cannot be written held no anchor this installation could rely on.
	}
};
