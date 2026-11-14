import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';
import { getSQLiteBasicsOo1 } from './sqlite-basics-oo1.mjs';

// Reserve the brief's 64 sync access handles for the conformance run.
const INITIAL_CAPACITY = 64;
const JOURNAL_MODE = 'WAL';
// exposeWorkerRxStorage must attach its message listener synchronously at module
// evaluation: a top-level await before it lost the page's first request and the
// instance never resolved (measured with the Playwright probe). The wasm init and
// the pool VFS install are awaited lazily on the first open() instead.
const ready = (async () => {
  const sqlite3 = await sqlite3InitModule();
  return sqlite3.installOpfsSAHPoolVfs({ name: 'spike-2138', initialCapacity: INITIAL_CAPACITY });
})();
const sqliteBasics = getSQLiteBasicsOo1({
  journalMode: JOURNAL_MODE,
  openDb: async (name) => new (await ready).OpfsSAHPoolDb('/' + name),
});
// A browser worker has no Buffer; premium's binary attachment path needs it
// ("Buffer is not defined" in the attachments conformance test), so store base64.
exposeWorkerRxStorage({ storage: getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true }) });
