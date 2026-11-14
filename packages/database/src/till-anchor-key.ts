/**
 * Where the till anchor lives: the localStorage key on web and Electron, the marker
 * file name in the document directory on native. Dependency-free so the web E2E
 * harness (plain Node under Playwright) can import it without pulling in
 * `expo-file-system`.
 */
export const TILL_ANCHOR_KEY = 'wcpos.tillId';

/** The anchored till id; null when none is stored; 'unknown' when storage cannot be read. */
export type TillAnchor = string | null | 'unknown';
