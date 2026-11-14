/**
 * Web: no file access for the drain. The live data is in the SQLite wasm
 * `opfs-sahpool` VFS, which runs inside the storage worker (`sqlite.worker.js`)
 * and holds EXCLUSIVE sync access handles on every pool file — the page can
 * neither list the pool's database names (the pool's `getFileNames()` lives in
 * the worker, which exposes only rxdb's storage protocol) nor delete a file.
 * The drain therefore opens to check, and removal drops tables; the pool slot
 * the file occupies remains. See `scope-database-files.ts`.
 */
import type { ScopeDatabaseFiles } from './scope-database-files';

export type { ScopeDatabaseFiles };

export const scopeDatabaseFiles: ScopeDatabaseFiles | null = null;
