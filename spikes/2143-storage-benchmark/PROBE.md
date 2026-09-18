# Probe: why does premium SQLite's findDocumentsById cost a constant ~2.1 s at 20k products?

Read this file and carry out the task. Do not modify anything outside `spikes/2143-storage-benchmark/`.
Do not touch `bench-entry.mjs`'s cells, `bench.mjs`, `report.mjs`, `run.sh` or `results.chrome.json`.

## Observation (Chrome, results.chrome.json, scale large = 20,000 products of ~2,000 JSON bytes)

`products-findByIds-10` and `products-findByIds-50` on `sqlite-sahpool` take 2,089–2,150 ms per sample,
page-side, regardless of id count; at the small scale (2,000 rows) they take 0.9 / 1.3 ms. The other
engines take < 5 ms. Premium's implementation (`node_modules/rxdb-premium/dist/esm/plugins/storage-sqlite/sqlite-storage-instance.js`,
`findDocumentsById`) runs, per batch of ids:

```sql
SELECT COALESCE('[' || group_concat(data, ',') || ']', '[]') as data
FROM (SELECT data FROM "<table>" WHERE id IN (?, ?, ...) AND deleted = 0)
```

The table is `id TEXT NOT NULL PRIMARY KEY UNIQUE, revision TEXT, deleted BOOLEAN ..., lastWriteTime INTEGER, data json`
plus RxDB's expression indexes. A 10-row primary-key lookup should be microseconds.

## Task

1. Add a guarded `self.addEventListener('message', ...)` handler to `worker-sqlite.mjs` for messages
   with `type: 'spike-2143-probe'` (premium's `exposeWorkerRxStorage` ignores messages without its
   own shape — spike 2145's worker did exactly this; copy that pattern). Actions:
   - `sql`: run `{ query, params }` through `sqliteBasics.all()` on the instance's db for
     `m.collection`, timed with `performance.now()` in the worker; reply `{ ms, rows: <row count>, first: <first row, truncated to 200 chars> }`.
   - `explain`: same but prefix `EXPLAIN QUERY PLAN ` and reply the plan rows.
   - `pragma`: run `PRAGMA <m.name>` and reply the value.
   Keep the handler small; it must not run unless the message type matches.
2. Add `globalThis.probeFindByIds = async ({ databaseName })` to `bench-entry.mjs` (export only; do
   not change any existing function) that: opens `sqlite-sahpool` with the products instance,
   seeds the LARGE product fixture (20,000 rows; reuse `fixtures` and `seed`), then measures and
   returns, in order, each timed 5x with the median reported:
   a. page-side `instances.products.findDocumentsById(<10 seeded ids>, false)` (as the bench does);
   b. worker-side, via `sql`: premium's exact statement above with those 10 ids;
   c. worker-side: the inner statement alone (`SELECT data FROM "<table>" WHERE id IN (...) AND deleted = 0`);
   d. worker-side: the inner statement without `AND deleted = 0`;
   e. worker-side: `SELECT id FROM "<table>" WHERE id IN (...)`;
   f. `explain` for (b) and (c);
   g. `pragma` `cache_size`, `page_size`, `page_count`, `journal_mode`, `locking_mode`;
   h. page-side `findDocumentsById` again after (b)–(g) (to see whether the cost is stateful);
   i. page-side `instances.products.query(<prepared find of the same 10 ids via uuid $in, sorted by uuid>)`.
   The table name is `instance.tableName` on the worker side; send it back to the page in the first
   reply so the page can build statements, or resolve it in the worker from `m.collection`.
   The worker needs the storage instance for the collection: keep the `instances` map that the
   `createStorageInstance` wrapper can fill (2145 pattern).
3. Write `probe.mjs` (Node + Playwright only): launches Chrome (`channel: 'chrome'`), serves
   `.build/` exactly as `bench.mjs` does (copy its routing), calls `probeFindByIds`, prints the
   returned object as JSON, exits non-zero on page errors.
4. Rebuild with `bash spikes/2143-storage-benchmark/run.sh --build-only` (bundles must build; that
   works in your sandbox). Do not run the browser — your sandbox cannot launch it. Report the one
   command the operator runs.

Budget: under 150 added lines total. No retries, no new dependencies, no env vars.
