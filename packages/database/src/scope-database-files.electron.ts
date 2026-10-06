/**
 * Electron: no file access for the drain. The SQLite files belong to the main
 * process, and the renderer reaches storage only through rxdb's IPC storage
 * (`adapters/storage/index.electron.ts`); the main process exposes no channel
 * to list or delete one database's files. The drain therefore opens to check,
 * and removal drops tables; the file remains. See `scope-database-files.ts`.
 */
import type { ScopeDatabaseFiles } from './scope-database-files';

export type { ScopeDatabaseFiles };

export const scopeDatabaseFiles: ScopeDatabaseFiles | null = null;
