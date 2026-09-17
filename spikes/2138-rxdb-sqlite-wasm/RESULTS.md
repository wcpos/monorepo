# Spike 2138 — results

Measured 2026-09-17 on this Mac. Node v24.14.0, npm 11.9.0, rxdb + rxdb-premium 17.4.0,
`@sqlite.org/sqlite-wasm` 3.53.4-build1 (SQLite 3.53.4, `ENABLE_FTS5`, `MAX_VARIABLE_NUMBER=32766`,
`THREADSAFE=0`), Google Chrome 154.0.8037.44, esbuild 0.28.2. The rxdb clone is tag `17.4.0`,
self-linked as its own `rxdb` so exactly one rxdb and one rxjs were in the process
(`rxdb/plugins/core` resolved to `.rxdb-src/dist/esm/index.js`, see `setup.log`).

## Verdict

**Yes, it works.** rxdb-premium's `getRxStorageSQLite` runs on the official SQLite wasm build over a
32-line `oo1.DB` adapter, and it passes RxDB's own storage conformance suite:

| Run | Result | Evidence |
|---|---|---|
| Node, whole rxdb unit suite (`DEFAULT_STORAGE=custom`, `replication-webrtc` excluded) | **1416 passing, 0 failing, exit 0** (2 min) | `node-conformance-summary.log` |
| Chrome, dedicated worker, `opfs-sahpool`, `init.test.ts` + `rx-storage-implementations.test.ts` | **65 of 65 SUCCESS, exit 0** (1.9 s), one test excluded for a clock artefact explained below | `browser-conformance.log` |

Node covered every block of the conformance file (62 tests: creation, bulkWrite, prepareQuery,
sort comparator, query matcher, query, count, findDocumentsById, getChangedDocumentsSince,
changeStream, attachments, cleanup, close, remove, multiInstance, migration) plus
query-correctness, attachments, migration-storage, replication, cleanup and the rest of the
suite. The browser run covered the same conformance blocks through premium's worker storage.

The WebRTC exclusion is unrelated to storage: `replication-webrtc.test.ts` needs the
`node-datachannel` native addon, which the clone never built. Mocha runs with `bail: true`, so
that one failure had ended the first Node run at 1098 passing (`node-run1.log`).

**WAL is real on this build.** `PRAGMA journal_mode = WAL` answers `wal` in Node and in the
worker on the pool VFS — but only after `PRAGMA locking_mode = exclusive`, which must come first.
Without it the same pragma silently answers `delete` (first Node run). The adapter now sets
exclusive locking inside `open()`, and the Node log shows `WAL wal` on every one of 1505 opens.

## What had to be worked around — every one is an input to the topology and adapter tickets

1. **The worker must call `exposeWorkerRxStorage` synchronously at module evaluation.** The
   first entry awaited `sqlite3InitModule()` and `installOpfsSAHPoolVfs()` at top level before
   exposing. The worker loaded without error, but the page's first `create` request was never
   answered and `createStorageInstance` hung forever — every karma run stalled at the first test
   that opened a database, and premium surfaces nothing (its page side pushes worker `error`
   events into an array it never reads). Reproduced and fixed outside karma with the Playwright
   probe (`page-probe.mjs`): expose first, await the wasm init lazily inside `open()`.
   This is the #891 "stuck worker" class in miniature: a worker-side failure is a silent hang.
2. **One long-lived worker per page: `mode: 'one'`.** Premium's default (`mode: 'storage'`)
   closes the message channel when the last instance on it closes, and the next instance spawns
   a new worker. The page side's `close()` only removes listeners — it never terminates the old
   worker — so the old pool VFS keeps its OPFS sync access handles and the new worker's
   `installOpfsSAHPoolVfs` fails with `NoModificationAllowedError: Access Handles cannot be
   created if there is another open Access Handle` ("open many instances on the same database
   name", `browser-run4-mode-storage.log`). With `mode: 'one'` the channel is kept alive and the
   block passes. Consequence for the design: the SQLite worker is a singleton per tab, and
   whoever owns the leader tab's worker must never let a second one install the same pool.
3. **`storeAttachmentsAsBase64String: true`.** Premium's binary attachment path calls Node's
   `Buffer`, which a browser worker does not have (`Buffer is not defined`,
   `browser-run5-buffer.log`). The documented option fixes it; all six attachment tests pass.
4. **Cleanup and rxdb's `now()` drift (the one excluded browser test).** "should clean up all
   deleted documents when multiple are deleted" writes deletes stamped with the page's `now()`,
   then calls `cleanup(0)` once (premium always returns `true`). Premium's cleanup deletes rows
   with `lastWriteTime < Date.now() - minimumDeletedTime` evaluated in the worker. rxdb's `now()`
   advances one millisecond for every 99 calls inside a millisecond, so a fast suite runs it
   ahead of wall-clock; the probe measured **+50.51 ms after 5,000 calls**, after which a
   fresh delete survived `cleanup(0)` twice. Not a storage defect and irrelevant at production
   `minimumDeletedTime` values (minutes), but it is a cross-realm contract quirk worth knowing:
   lwt is stamped by the caller's realm, cleanup is judged by the worker's.
5. **Harness only, not design:** the rxdb tag ships no lockfile (`npm install`, not `npm ci`);
   the worker bundle must not live under `test/` (babel transpiles that tree and rejects the
   bundle's private class fields); the static server serves `docs-src/static/files`, not
   `test/static/files`; `TMPDIR` must not be moved into the clone (broadcast-channel's Node
   backend listens on a Unix socket and the path exceeds macOS's 104-byte limit); and karma's
   `MOCHA_GREP` must keep `init.test.ts` or the storage is never initialised.

## Adapter

`sqlite-basics-oo1.mjs` (32 lines; the journal-mode `console.info` lines are instrumentation):

```js
import { boolParamsToInt } from 'rxdb-premium/plugins/storage-sqlite';

export function getSQLiteBasicsOo1({ openDb, journalMode }) {
  return {
    async open(name) {
      const db = await openDb(name);
      db.exec('PRAGMA locking_mode = exclusive'); // WAL needs it first on this build
      return db;
    },
    async all(db, q) {
      return db.exec({ sql: q.query, bind: boolParamsToInt(q.params), rowMode: 'object', returnValue: 'resultRows' });
    },
    async run(db, q) { db.exec({ sql: q.query, bind: boolParamsToInt(q.params) }); },
    async setPragma(db, key, value) { db.exec('PRAGMA ' + key + ' = ' + value); },
    async close(db) { db.close(); },
    journalMode,
  };
}
```

`oo1.DB` is synchronous, so there is no serialising queue: the queue in rxdb's own
`getSQLiteBasicsWasm` was a wa-sqlite workaround and is not needed here.

Worker entry (`sqlite-worker-entry.mjs`): `installOpfsSAHPoolVfs({ name, initialCapacity: 64 })`,
`openDb = name => new poolUtil.OpfsSAHPoolDb('/' + name)`, `journalMode: 'WAL'`,
`storeAttachmentsAsBase64String: true`, expose synchronously. Page side
(`custom-storage.ts`): `getRxStorageWorker({ workerInput, workerOptions: { type: 'module' }, mode: 'one' })`.

## Not measured here (deliberately)

Performance, crash survival, FTS5, the two WHERE-dropping query paths, multi-tab leadership. Those
are the blocked tickets; this spike only answers whether the path works at all.

## Reproduce

```
bash spikes/2138-rxdb-sqlite-wasm/run-conformance.sh node        # ~5 min first time (clone install + build), 2 min after
MOCHA_GREP='init.test.ts|rx-storage-implementations' bash spikes/2138-rxdb-sqlite-wasm/run-conformance.sh browser
node spikes/2138-rxdb-sqlite-wasm/page-probe.mjs                   # the worker probe, headless Chromium
```

Node suite: pass `MOCHA_GREP=replication-webrtc MOCHA_INVERT=1` to skip the unbuilt native addon.
The rxdb clone lives in `.rxdb-src/` (gitignored); `git clone --depth 1 --branch 17.4.0
https://github.com/pubkey/rxdb.git .rxdb-src` recreates it.
