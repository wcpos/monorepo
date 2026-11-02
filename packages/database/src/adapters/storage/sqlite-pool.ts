// sqlite-wasm's SAHPool constructor uses options.directory || "." + vfsName.
// With no directory option, name "wcpos-sqlite" owns OPFS root ".wcpos-sqlite".
export const SQLITE_POOL_NAME = 'wcpos-sqlite';
export const SQLITE_POOL_DIRECTORY = `.${SQLITE_POOL_NAME}`;
// One batch avoids paying the sync-access-handle acquisition cost per open (#2242 Windows).
export const SQLITE_POOL_GROWTH_STEP = 16;
export const SQLITE_POOL_FILES_PER_DATABASE = 2; // Database file and its WAL.
// Fresh till: user + store (including logs) + scope = 3 pairs, plus one growth batch.
export const SQLITE_POOL_INITIAL_CAPACITY =
	3 * SQLITE_POOL_FILES_PER_DATABASE + SQLITE_POOL_GROWTH_STEP;
// WebKit allows 253 OPFS sync access handles per browsing context; the 254th throws
// "Invalid platform file handle" (Safari 27, #2242). SAHPool holds one handle per slot
// and no others, so cap at 22 + 14 * 16 = 246, keeping 7 handles of headroom.
export const SQLITE_POOL_MAX_CAPACITY = SQLITE_POOL_INITIAL_CAPACITY + 14 * SQLITE_POOL_GROWTH_STEP;
