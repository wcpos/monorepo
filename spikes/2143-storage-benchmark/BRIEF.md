# Spike 2143 — is wasm SQLite faster than the engine we ship today, on our workload?

Read this file, then carry out the task it describes. Ticket: wcpos/monorepo#2143.
Everything you need is in this repo. Do not modify anything outside `spikes/2143-storage-benchmark/`
and `.github/workflows/spike-2143-benchmark.yml`.

## The question

Speed is decision criterion 1 for the 2.0 storage engine and it is the only axis with no number for
the leading candidate. This harness produces that number: the same workload, the same schemas, the
same browser, against three storage engines, reported as distributions. It decides nothing itself.

## The three engines (rows)

All three run inside a dedicated worker and are driven from the page through rxdb-premium's
`getRxStorageWorker` (`rxdb-premium/plugins/storage-worker`), exactly as the app drives storage on
web. Page-side timing through that RPC is the app-visible number and is the ONLY timing reported —
it is the one thing all three rows share.

| Row | Worker | Notes |
|---|---|---|
| `opfs-shipped` | `apps/main/public/opfs.worker.js`, served **verbatim** from this repo (do not rebuild or modify it) | The engine we ship today: premium OPFS filesystem storage plus this repo's patches. Pass `workerOptions: { name: 'spike-2143-opfs' }` — the worker reads `self.name`. |
| `sqlite-sahpool` | `worker-sqlite.mjs` (you write it) | premium `getRxStorageSQLite` on `@sqlite.org/sqlite-wasm` 3.53.4-build1 with the `opfs-sahpool` VFS, WAL, `PRAGMA locking_mode = exclusive` set before WAL, `storeAttachmentsAsBase64String: true`. Copy `spikes/2145-query-paths/sqlite-basics-oo1.mjs` and the `predicate()` translator and `queryModifier` from `spikes/2145-query-paths/sqlite-worker-entry.mjs`. |
| `indexeddb-premium` | `worker-indexeddb.mjs` (you write it) | premium `getRxStorageIndexedDB` from `rxdb-premium/plugins/storage-indexeddb`, default settings (it hardcodes relaxed transaction durability; record that in RESULTS, do not change it). Raw IndexedDB is a birchill anchor, not a candidate. |

**`sqlite-sahpool` must run the fully translated shape, not premium's shipped fallback.** Spike 2145
measured the shipped fallback (a WHERE-less page loop plus a JS matcher) and the `queryModifier`;
both are known and neither is what a 2.0 engine would ship. In `worker-sqlite.mjs`, wrap each
storage instance's `query()` and `count()` (as 2145 wraps them for timing) so that when the selector
is translatable by `predicate()` the wrapper runs ONE statement through `sqliteBasics.all()` —
`SELECT data FROM "<table>" WHERE <predicate> ORDER BY <sort> LIMIT n` / `SELECT COUNT(1)` — and
returns `{ documents }` / `{ count }` in the shape premium's own methods return (read
`node_modules/rxdb-premium/dist/esm/plugins/storage-sqlite/sqlite-storage-instance.js` for the
table name, primary column, `deleted` column and the return shapes; it is minified, one line).
Untranslatable selectors fall through to premium. This is the in-harness equivalent of the ~20-line
premium patch 2145 recommended; RESULTS must say so. Sort fields map as in 2145's direct mode
(`id` for the primary key, `JSON_EXTRACT(data,'$.<path>')` otherwise). Add `deleted = 0` to every
predicate; RxDB's normalized selector carries `_deleted: false`.

## Schemas (declare the missing indexes — free here)

Throwaway schemas, `fillWithDefaultSettings`, primary `uuid` (maxLength 128). Same schemas for all
three rows.

- **products** — copy the top-level field set of `packages/sync-engine/src/collections/product-schema.ts`
  (promoted fields plus `payload`, `sync`, `local`). Declare `indexes`:
  `['stockStatus', 'price', ['type','stockStatus'], 'remoteId', 'payload.status', ['payload.status','stockStatus'], 'payload.name']`
  with `maxLength` on every indexed string (`payload.name` 200, `payload.status` 16, `remoteId` 64).
  If RxDB rejects a nested index path in a filled schema, promote `payload.status`/`payload.name`
  to top-level mirrors (`status`, `name`) in the harness documents and index those instead, and say
  so in RESULTS — the query shapes below then use the mirror.
- **orders** — copy `spikes/2145-query-paths/bench-entry.mjs`'s order schema and generator
  (`uuid, remoteId, number, dateCreatedGmt, status, total, customerId, payload, sync, local`; indexes
  `['dateCreatedGmt']`, `['status','dateCreatedGmt']`) and add `'remoteId'`.
- **mutations** — a small queue collection: `{ id (primary, 64), collection, operation, createdAt,
  payload }`, no indexes.

## Data (deterministic; seeded PRNG; fresh database name per engine per run)

Two scales, run one after the other: **small** (2,000 products, 2,000 orders) and **large**
(20,000 products, 20,000 orders). Report both.

- **products**: payload shaped like `searchFixturePayload()` in
  `packages/sync-core/src/searchFixtureCatalogue.ts` (a full Woo product: name, sku,
  `global_unique_id`, price, status, stock_status, type, one category, one image, one
  `_woocommerce_pos_uuid` meta entry, description) padded to a mean of ~2,000 JSON bytes. 90%
  `status: publish`, 85% `stock_status: instock`, 80% `type: simple` / 20% `variable`; names are
  two random dictionary words plus a number so the sort is non-trivial. `remoteId` = 1..N.
- **orders**: 2145's generator — 6–10 `payload.meta_data` entries always including `_pos_user`
  (4 cashiers) and `_pos_store` (2 stores), five statuses — plus `payload.line_items`: 1–8 lines of
  ~400 JSON bytes each (id, name, product_id, quantity, price, subtotal, total, sku, tax_class,
  taxes[], meta_data with `_woocommerce_pos_uuid` and a `_woocommerce_pos_data` object). Mean
  document ~800 B + ~400 B per line.
- Seed through `bulkWrite` in batches of 1,000 (what the app does). Seeding is untimed EXCEPT the
  cell `seed-products` below.

## Cells (the workload)

Every `find` selector includes `_deleted: false`; normalize with `normalizeMangoQuery` and prepare
with `prepareQuery` as 2145 does. `count` queries are normalized as RxQuery does for `count` (no
sort). Every timed cell verifies its result against the other two rows on the same run: identical
ordered primary keys for finds, identical integer for counts, identical `_rev`-independent document
content for reads. A mismatch fails the run.

Products, as the POS products grid actually issues them (`packages/query/src/engine-adapter/execute-query.ts`
does not push sort or limit for `products` because `name` sorts through `payload.name`):

1. `products-grid-asShipped` — `find({ selector: { $and: [{ 'payload.status': 'publish' }, { stockStatus: 'instock' }] } })`, no sort, no limit: the whole matching set to JS. This is the real grid cost today.
2. `products-grid-pushed` — the same selector with `sort: [{ 'payload.name': 'asc' }, { uuid: 'asc' }]` and `limit: 10`, then `limit: 50`: what the grid would cost if the query layer pushed the sort (label it as hypothetical in the report).
3. `products-catalogue-blob` — `find({ selector: { _deleted: false } })`, no sort, no limit: the full read `catalogue-search-blob.ts:160` performs on every open to build the search index.
4. `products-findByIds` — `findDocumentsById(ids, false)` for 10 and for 50 ids chosen at random from the seed: the search hit fetch.
5. `products-remoteId-in` — `find({ selector: { remoteId: { $in: <100 ids> } }, sort: [{ uuid: 'asc' }] })` AND `count({ selector: { remoteId: { $in: <100 ids> } } })`: the parent lookup and every reconciliation query.
6. `seed-products` — the timed `bulkWrite` of the whole product seed in 1,000-row batches (a cold resync), reported once per scale.

Orders, as the Orders screen issues them (pushed; spike 2145 shape):

7. `orders-default-find` — `find({ selector: { $and: [{ 'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '<cashier 1>' } } }, { 'payload.meta_data': { $elemMatch: { key: '_pos_store', value: '<store 1>' } } }] }, sort: [{ dateCreatedGmt: 'desc' }], limit: 10 })` and at `limit: 50`.
8. `orders-default-count` — `count()` of the same selector (the live pain; the app sets `allowSlowCount`).
9. `orders-open-status` — `find({ selector: { status: { $in: ['pos-open','pos-partial','pending'] } } })`, no sort, no limit: the POS cart tabs' open-orders resource.

Writes, as one cart line add actually lands (`use-local-mutation.ts`: whole-document
`incrementalModify`, a mutation-queue insert, then a second `incrementalModify` dirty mark):

10. `order-line-add` — on a random persisted order with 5 lines: `bulkWrite([{ previous, document: <same order with a 6th line appended and date_modified_gmt bumped> }])`, then `bulkWrite([{ document: <one mutations row> }])` on the mutations instance, then `bulkWrite([{ previous, document: <order with local.dirty = true> }])`. The three calls in sequence, serial, are one sample. This is where IndexedDB wins by an order of magnitude in birchill's data and where a POS lives; sample it more (see N below).
11. `order-create` — `bulkWrite` inserting one new order with 1 line, then one mutations row.

Cold boot (the wasm payload and open cost, on a database that already holds the LARGE seed):

12. `cold-open-first-read` — after seeding, `page.reload()` (same browser context, so OPFS/IndexedDB persist), then time from `getRxStorageWorker(...)` + `createStorageInstance` for products through the first `findDocumentsById([one id])` resolving. Report the worker script and wasm bytes fetched next to it (`sqlite3.wasm` and the worker bundles' sizes; read them from disk in `bench.mjs`).
13. `storage-estimate` — `navigator.storage.estimate().usage` after the large seed, per engine, from the page (the disk footprint; note the API's granularity).

## Sampling

One discarded warm-up then **N = 7** samples per cell, except `order-line-add` and `order-create`
(**N = 25**) and `seed-products` / `cold-open-first-read` (**N = 3**). Report p50, p95 and max per
cell (compute p95 by nearest-rank). Cells run in the order listed, all cells for one engine before
the next engine, engines in a fixed order; between engines close every instance and terminate the
worker. Rows returned to JS are counted per cell where the method returns documents.

## Browsers (the bracket)

`bench.mjs` takes `--browser chrome|firefox|webkit` and writes `results.<browser>.json`
(`chrome` = Playwright `chromium.launch({ channel: 'chrome' })`; `firefox`/`webkit` = Playwright's
builds; all three are installed on the operator's Mac). Playwright is in this repo's root
`node_modules`. Serve the bundles with `page.route` as `spikes/2145-query-paths/bench.mjs` does,
from a directory passed as `--bundles <dir>` (default `spikes/2143-storage-benchmark/.build/`),
and serve `opfs.worker.js` from that same directory (`run.sh` copies it there). **`bench.mjs` must
depend only on `playwright` and Node built-ins** so it also runs on a Windows CI runner that has
nothing else installed. Take `--out <file>` for the results path and `--scale small|large|both`
(default both).

`report.mjs` merges every `results.*.json` present into `RESULTS.md` between `<!-- generated:start -->`
and `<!-- generated:end -->`: one table per browser per scale (rows = cells, columns = engines,
each cell `p50 / p95` ms), then a **bracket table**: per cell per scale, the winning engine in each
browser, with a `straddles` flag when the winner differs between browsers. Mark the prose above the
markers stale if the `measuredAt` set changes.

## Windows run (GitHub Actions)

Create `.github/workflows/spike-2143-benchmark.yml`, `workflow_dispatch` only, two jobs:

1. `bundle` on `ubuntu-latest`: `actions/checkout`, `./.github/actions/setup-monorepo` with the
   same two secrets `test.yml` passes it, then `bash spikes/2143-storage-benchmark/run.sh --build-only`,
   then upload `spikes/2143-storage-benchmark/.build/` and `bench.mjs` as artifact `spike-2143-bundles`.
2. `bench-windows` on `windows-latest`, `needs: bundle`: download the artifact, `actions/setup-node`
   (Node 22), `npm install --no-save playwright@<the version in this repo's root package.json>` (no
   browser download — Chrome is preinstalled on the runner and `channel: 'chrome'` uses it), then
   `node bench.mjs --browser chrome --bundles <dir> --out results.windows-chrome.json --scale both`,
   and upload `results.windows-chrome.json` as artifact `spike-2143-results-windows`. Timeout 120 min.

The operator downloads that artifact next to the Mac results and runs `report.mjs`. The report's
bracket table must treat `windows-chrome` as a fourth browser column.

## Build (`run.sh`)

- `@sqlite.org/sqlite-wasm` is NOT a repo dependency. It is installed under
  `spikes/2143-storage-benchmark/.deps/node_modules/` (already present on the operator's Mac at
  3.53.4-build1; `run.sh` runs `npm install --no-save --no-package-lock @sqlite.org/sqlite-wasm@3.53.4-build1`
  in `.deps/` when the directory is missing, so CI gets it too). Bundle with this repo's root
  `node_modules/.bin/esbuild` (0.28.2), `--bundle --format=esm --platform=browser`, aliasing
  `@sqlite.org/sqlite-wasm` to the `.deps` copy (`--alias:` or an esbuild `nodePaths` entry —
  whichever resolves cleanly). `rxdb` and `rxdb-premium` resolve from the root `node_modules`.
- Outputs into `.build/`: `worker-sqlite.js`, `worker-indexeddb.js`, `bench.js`, `sqlite3.wasm`,
  and a verbatim copy of `apps/main/public/opfs.worker.js`. Assert each is > 10,000 bytes.
- `.gitignore` in the spike: `.deps/`, `.build/`.
- `run.sh [--build-only] [--browser X]` builds, then (unless build-only) runs `bench.mjs` for the
  requested browser (default: all three, sequentially) and then `report.mjs`.

## Execution split — you build, the operator runs the browsers

Your sandbox cannot launch a browser (Playwright's Chromium dies with SIGABRT at launch in it —
spike 2145 verified this; do not try, do not report it as a result). Instead:

1. Write every file: `worker-sqlite.mjs`, `worker-indexeddb.mjs`, `bench-entry.mjs` (page side),
   `bench.mjs` (Playwright driver), `report.mjs`, `run.sh`, `.gitignore`, the workflow, and
   `RESULTS.md` with the environment lines as placeholders, the generated section marked "filled by
   `node report.mjs`", and the answer paragraphs left as TODO for the operator.
2. Run `bash spikes/2143-storage-benchmark/run.sh --build-only` to prove the bundles build; print
   the sizes.
3. Run `node --check` on every `.mjs` and `node report.mjs` against an empty results set (it must
   succeed and write an "no results yet" section, not crash).
4. Report exactly what the operator must run and what each command writes.

## Constraints

- Stakes: a throwaway measurement harness under `spikes/`. Nothing ships. A wrong number is the
  only real failure, so the cross-engine equality checks are not optional and a mismatch must fail
  the run loudly rather than be skipped or loosened. Style nits, lint and typecheck do not apply
  under `spikes/` (it is excluded from the workspace); do not run `pnpm lint` or `pnpm typecheck`.
- Do not add: retries, feature flags, env-var knobs (constants in code with a comment), a config
  file format, a results database, charts, TypeScript, tests for the harness, or any change to
  `node_modules`, `patches/`, the app, or `apps/main/public/opfs.worker.js`.
- Budget: about 1,200 added lines across the harness files excluding `RESULTS.md` and generated
  content; the whole diff under 1,600 lines. If you are about to exceed either, STOP and report why
  instead of continuing.
- Do not run any Jest or Vitest suite.

## Deliverable

The files above, committed by the operator. `RESULTS.md` will carry: the environment lines per
browser (browser version, OS, CPU, `rxdb`/`rxdb-premium`/`@sqlite.org/sqlite-wasm`/`esbuild`
versions, `measuredAt`), the generated tables, and three answer paragraphs the operator writes:
(1) which engine wins each cell family and by how much, per browser; (2) whether the Mac bracket
straddles and what the Windows run says; (3) what the numbers do and do not decide, including the
cost of the wasm payload on cold open and the three-write cart line add.
