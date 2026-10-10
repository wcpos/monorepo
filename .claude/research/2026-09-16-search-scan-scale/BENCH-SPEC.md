# Bench spec: catalogue search at scale — FlexSearch index vs storage scan

Context: wcpos/monorepo#2073. We need numbers at realistic catalogue sizes for three ways of
searching the `products` collection, on two real storages, so the issue can be answered with
measurements rather than extrapolation. This is an env-gated bench test, not a CI gate.

## Deliverable

One new file: `packages/database/src/catalogue-search-scale.bench.test.ts`. Model it on the
existing `packages/database/src/logs-volume.bench.test.ts` (same harness traps: `setPremiumFlag()`,
`addRxPlugin(RxDBFlexSearchPlugin)`, `addRxPlugin(RxDBMigrationSchemaPlugin)`, `addRxPlugin(searchPlugin)`,
`multiInstance: false`, the `jest.mock('@wcpos/utils/logger', …)` stub, streaming progress to
`PROBE_PROGRESS=<file>` because jest buffers console output). Gate it with
`const describeBench = process.env.CATALOGUE_SCALE_BENCH ? describe : describe.skip;`.

No production code changes. No new dependencies. No CI wiring. Do not touch any other file.

## Seed

`PROBE_ROWS` = comma list of catalogue sizes, default `2000,20000`. For each size N, seed N synthetic
products with a deterministic PRNG (seeded, so runs are reproducible) into a bench-local collection
`products` with this schema (version 0, primaryKey `uuid`):

```
uuid: string maxLength 128
searchFold: { name: string, sku: string, barcode: string }   // the #2082 "folded column" pattern
payload: object additionalProperties true
indexes: []   // keep it simple; add nothing
```

`payload` must look like a WooCommerce product so stored bytes are realistic. Include: `id`, `name`
(2–5 words drawn from a word list of ~300 words mixing English, German, Finnish, French, Spanish,
INCLUDING compound words such as `Kuorintasaippua`, `Edelstahltrinkflasche`, `Regenschirm`,
`Kaffeemaschine`, so mid-word substring queries have real targets), `slug`, `sku` like
`SKU-000123-AB`, `barcode` 13 digits (put it at `payload.barcode`), `price`, `regular_price`,
`stock_status`, `type`, `description` ~600 chars of prose from the same word list,
`short_description` ~150 chars, `images` 1–3 entries with `src` URLs ~80 chars each, `categories` 1–3
entries `{id,name,slug}`, `attributes` 0–2 entries, `meta_data` 4–6 entries `{id,key,value}`. Report
the measured average `JSON.stringify(doc).length` per stored row — the point is that the scan cost is
proportional to these bytes.

`searchFold.name/sku/barcode` = `foldSearchText(payload.name)` etc. (import `foldSearchText` from
`@wcpos/sync-core`).

Also seed a **sidecar** collection `productSearch` (version 0, primaryKey `uuid`) with ONE row per
product: `{ uuid, fold: string maxLength 600 }` where `fold` = folded `name + ' ' + sku + ' ' + barcode`.
No indexes.

Set `products` collection `options: { searchFields: ['payload.name', 'payload.sku', 'payload.barcode'] }`
so the real `searchPlugin` (`packages/database/src/plugins/search.ts`) builds its index exactly the
way production does (`tokenize:'full'`, our `encodeSearchText` encoder, `minlength` 3).

Insert in `bulkInsert` batches of 500.

## Storages

Run the whole matrix on two storages, selected by `PROBE_STORAGE` = comma list, default `memory,fs`:

- `memory`: `getRxStorageMemory()` from `rxdb/plugins/storage-memory`.
- `fs`: `getRxStorageFilesystemNode({ basePath })` from `rxdb-premium/plugins/storage-filesystem-node`
  with a fresh temp dir per run (see `apps/electron/src/main/opfs-targeted-recovery.test.mjs` around
  lines 505–560 for how it is constructed). This is the storage the Electron main process runs, and it
  shares its query path (`storage-abstract-filesystem`) with OPFS on web and the Expo filesystem on
  native, so its scan numbers are the ones that matter. Remove the temp dir in `afterAll`.

Use a fresh database per (storage, N) cell; `await db.remove()` after each cell.

## Measurements per (storage, N)

Queries — measure each with 1 warm-up then median and max of 5 runs, `performance.now()`:

- `common`: a word that appears in ~5–10% of names (pick one from the word list and report its hit count)
- `midword`: `saippua` (a substring inside the compound `Kuorintasaippua`; report hit count)
- `rare`: a 6-character fragment of one seeded SKU (1 hit expected)
- `two-terms`: `common` + ` ` + a second word (AND semantics; report hit count)

Paths:

A. **Index (today's path).** `const instance = await collection.initSearch('en'); await instance.pipeline.awaitIdle();`
   Record build wall time and heap delta (`process.memoryUsage().heapUsed`, after `global.gc?.()` before
   and after; run jest with `--expose-gc` so it exists). Then for each query:
   `instance.find(term, { limit: Number.MAX_SAFE_INTEGER })` (products use that limit in
   `packages/query/src/engine-query.ts`). Record ms and hit count. Then close the instance
   (`collection.closeSearch?.()` or whatever the plugin exposes — read `search.ts`; if there is no
   public close, leave it and note that).

B. **Inline folded-column scan (the #2082 pattern).** Selector: `$and` over terms of `$or` over the
   three `searchFold.*` fields of `{ $regex: escapeRegex(term) }` (import `escapeRegex` from
   `@wcpos/sync-core`; `buildScanSearchSelector` from the same package builds exactly this shape when
   given `rawFields` — you may use it with `foldedField` unset and `rawFields` = the three
   `searchFold.*` paths, but note it adds `$options:'i'` on raw fields; either is fine, say which).
   Measure: `find({selector, limit: 20}).exec()` (first page), `find({selector}).exec()` (full, report
   count), and `count({selector}).exec()` — if RxDB refuses the slow count, set `allowSlowCount: true`
   on `createRxDatabase` and say so in the output.

C. **Sidecar scan.** Same selector shape on `productSearch.fold` (single field, so `$and` of `$regex`).
   Measure `find({selector, limit: 20})`, full `find`, and then `products.findByIds(first 20 ids).exec()`
   as the page materialisation cost. Report the three separately.

Also record, per cell: seeding time; average stored bytes per product row; for `fs`, the size in bytes
of the storage directory after seeding (`du`-style walk with `fs.statSync`) split by collection if the
file layout makes that possible.

## Output

Print one Markdown table per storage to stdout AND append it to `PROBE_PROGRESS` if set. Columns:
`N | path | query | hits | median ms | max ms`. Plus a per-cell header line with build ms, heap delta MB,
avg row bytes, dir bytes. Make the table copy-pasteable into a GitHub comment.

The test must not assert on timings. Assert only that every path returned the same hit set for the same
query (compare sorted uuid arrays; A vs B vs C must agree exactly — a mismatch is a real finding, print
the differing ids and fail).

## Stakes and scope

Bench code only; nothing ships to a merchant. The worst case is a wrong number, which the orchestrator
reviews. Treat concurrency, partial failure and cleanup edge cases as accepted risks — do not add
locking, retries, timeouts, fallbacks, feature flags or config files.

Out of scope: changing any production file; adding dependencies; per-field tokenizers; `forward`/`strict`
tokenizers; any placement (worker/main) experiment; OPFS; CI wiring.

Budget: at most 340 ADDED lines total, all in the one new file. If you are about to exceed it, finish
the file anyway and report the overrun with the reason rather than stopping.

## How to run (and what to run before finishing)

Memory rules on this machine: run this suite ALONE, never in parallel with another test run.

```sh
cd /Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-search-scan-scale
CATALOGUE_SCALE_BENCH=1 PROBE_ROWS=2000 PROBE_STORAGE=memory,fs \
NODE_OPTIONS="--max-old-space-size=6144 --expose-gc" \
pnpm --filter @wcpos/database test -- --maxWorkers=1 --coverage=false catalogue-search-scale
```

First get the 2,000-row cell green on both storages. Then run the default matrix
(`PROBE_ROWS=2000,20000`, both storages) with `PROBE_PROGRESS=/Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-search-scan-scale/.claude/research/2026-09-16-search-scan-scale/bench-output.md`
and leave that file in place. Also run `pnpm --filter @wcpos/database exec eslint src/catalogue-search-scale.bench.test.ts`
and fix what it reports. Finally confirm the file is skipped when the env var is unset
(`pnpm --filter @wcpos/database test -- --maxWorkers=1 --coverage=false catalogue-search-scale` reports skipped).

Report: the tables, the avg row bytes, anything the harness fought you on, and any hit-set mismatch.
