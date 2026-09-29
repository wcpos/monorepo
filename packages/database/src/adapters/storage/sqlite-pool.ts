// sqlite-wasm's SAHPool constructor uses options.directory || "." + vfsName.
// With no directory option, name "wcpos-sqlite" owns OPFS root ".wcpos-sqlite".
export const SQLITE_POOL_NAME = 'wcpos-sqlite';
export const SQLITE_POOL_DIRECTORY = `.${SQLITE_POOL_NAME}`;
// First store: one user + one store (including logs) + one scope = 3 DBs.
// DB + exclusive-locking WAL = 2 files each: 6 handles + 58 headroom = 64.
// Retained scopes/stores have no bound; this fixed pool fits 32 DB/WAL pairs,
// not every possible session history. Temporary DBs are in memory (#2242).
export const SQLITE_POOL_INITIAL_CAPACITY = 64;
