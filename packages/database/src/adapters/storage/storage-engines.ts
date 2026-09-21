/**
 * Which storage engine each platform runs, and the `multiInstance` value that
 * engine REQUIRES. The two are not independent settings — see the Decision
 * section of `../default/README.md`.
 *
 * This module is deliberately dependency-free so the ruling test can import it
 * without pulling in rxdb, rxdb-premium or a worker bundle.
 */

/**
 * Web storage engines, past and planned.
 *
 * - `opfs-filesystem` — what ships today: rxdb-premium's abstract-filesystem
 *   storage over OPFS, one dedicated worker PER TAB against the same files.
 * - `sqlite-sahpool` — the 2.0 target (monorepo#2137): SQLite wasm on the
 *   official `@sqlite.org/sqlite-wasm` build over the `opfs-sahpool` VFS, in
 *   WAL, in ONE dedicated worker owned by the one live tab.
 */
export type WebStorageEngine = 'opfs-filesystem' | 'sqlite-sahpool';

/** The engine the web adapter runs right now. Changing this is the 2.0 migration. */
export const WEB_STORAGE_ENGINE: WebStorageEngine = 'opfs-filesystem';

/**
 * The worker bundle each engine is served by. Kept beside the engine id so the
 * constant is load-bearing rather than decorative: changing the engine changes
 * which worker the page fetches.
 *
 * `opfs.worker.js` ships from `apps/main/public/` and inlines patched premium —
 * see `../../../../../apps/main/public/opfs.worker.js` and the repo's memory note
 * on verifying it by marker count.
 */
export const WEB_WORKER_PATH_BY_ENGINE: Record<WebStorageEngine, string> = {
	'opfs-filesystem': '/opfs.worker.js',
	'sqlite-sahpool': '/sqlite.worker.js',
};

/**
 * `multiInstance` is a CONSEQUENCE of the engine, not a preference. Pinned as a
 * pair by `../default/multi-instance-ruling.test.ts`: change one without the
 * other and that test goes red, naming the half you forgot.
 *
 * - `opfs-filesystem` → **true**. Ruling 2026-08-06 (#1057, closes #1045/#1055):
 *   multi-tab of one store is first-class. Every tab opens its own storage over
 *   the same files, so `true` is what gives followers a coherent read view over
 *   BroadcastChannel and gives RxDB's leader election a single tab to run
 *   cleanup and recovery in. `false` on this engine lets two tabs each repair the
 *   same OPFS file — a proven data-loss path (#1049, two adversarial passes).
 *
 * - `sqlite-sahpool` → **false**. Ruling 2026-09-21 (#2146): `opfs-sahpool` holds
 *   EXCLUSIVE OPFS access handles for the origin, so a second tab cannot open
 *   storage at all. Exactly one live tab per store; a second tab gets the
 *   take-over screen and never opens a database. The #1049 route cannot exist
 *   because there is never a second storage to race.
 */
export const REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE: Record<WebStorageEngine, boolean> = {
	'opfs-filesystem': true,
	'sqlite-sahpool': false,
};

/**
 * Electron and native are `false` in every era: one storage per process, behind
 * an IPC bridge or directly. No engine change moves them.
 */
export const REQUIRED_MULTI_INSTANCE_ELECTRON = false;
export const REQUIRED_MULTI_INSTANCE_NATIVE = false;
