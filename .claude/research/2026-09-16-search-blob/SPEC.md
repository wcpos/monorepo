# Catalogue search blob — implementation spec (monorepo#2073, branch `feat/search-blob` → `main`)

## Why

Local product/variation search is served by a FlexSearch index with `tokenize:'full'` (every
substring of every term). Measured 2026-09-16: 7.3 KiB of renderer heap per product row, 143 MiB
and ~8 s to build at 20k products. The enshrined contract (`packages/sync-core/src/searchFixtureCatalogue.ts`)
is "every whitespace-split term of ANY length is a literal substring of folded name/sku/barcode,
any order, across fields" — a grep, not a fulltext problem. A flat folded-text blob per collection
(~1 MiB of text at 20k rows, +2 MB heap, <1 ms build, <1 ms per query) answers the same contract
and is pinned against every fixture trap on the research branch. This change ships it for
`products` and `variations` only. Every other collection keeps FlexSearch unchanged.

`logs` already refuse the index (`options.searchIndex === false`) and scan instead; this is the
same opt-out with a fast in-memory scan structure behind it.

## Stakes

Till search: a wrong result set means a cashier cannot find a product (the fixture pins
correctness); a missed change event means a stale result until the next event. No money path.
The blob is per-tab renderer state built from the local collection; every tab/window builds its
own. Treat multi-tab coordination, leader election, partial-failure and concurrency findings as
accepted, not defects.

## Design (do exactly this — the primitives already exist)

### 1. New: `packages/query/src/catalogue-search-blob.ts`

```ts
export type CatalogueSearchBlob = {
  ready: Promise<void>;          // resolves after the initial load
  changes$: Observable<void>;    // emits once ready, then after every applied change (trailing-throttled with SEARCH_SCAN_RETHROTTLE_MS from engine-query)
  search(terms: string[]): string[]; // primary ids whose folded row contains EVERY term; [] when terms is empty
  dispose(): void;
};
export function catalogueSearchBlobFor(
  collection: SearchableCollection /* from ./search-shared, or a minimal structural type: find().exec(), $, onClose */,
  searchFields: string[],
  documentSnapshot: (document: EngineRxDocument) => Record<string, unknown>
): CatalogueSearchBlob;
```

- **Row text** = `foldSearchText(searchFields.map((f) => String(get(snapshot, f) ?? '')).join(' '))` — identical to what `fieldsMatchTokens` in `search-match.ts` folds today, so results are identical to the current post-filter.
- **Terms** come from the caller via `searchTerms()` in `search-match.ts` (= `encodeSearchText`: fold, split on whitespace/control, strip wrapping punctuation, keep 1- and 2-char terms). Do NOT re-implement the term rule and do NOT change `encodeSearchText` or `FLEXSEARCH_MIN_TERM_LENGTH`.
- **Structure**: `Map<primary, row>`; a lazily rebuilt `{ text: string; offsets: Uint32Array; ids: string[] }` (rows joined with `'\n'`, a trailing `'\n'`), rebuilt on the next `search()` after any change (cost ≈1 ms at 20k rows — no incremental patching of the string). A term can never contain `'\n'` (the encoder splits on `\p{C}`), so the separator is safe.
- **search()**: sort terms longest first; for each term walk `text.indexOf(term, from)`; map a hit position to its row by binary search over `offsets`; continue from the next row's offset; intersect the row sets; return ids. Reference implementation: `git show origin/research/search-scan-scale:packages/sync-core/src/searchFixtureCatalogue.blob.test.ts` (functions `buildBlob`, `rowAt`, `termRows`, `blobSearch`) — port those four, typed for string ids.
- **Freshness**: subscribe to `collection.$` (rxdb 17 `RxChangeEvent`: check `node_modules/rxdb/dist/types/types/rx-change-event.d.ts` for the exact field names — `operation` INSERT/UPDATE/DELETE, `documentId`, `documentData`). Subscribe BEFORE the initial `collection.find().exec()`, buffer events until the load completes, then apply the buffer; afterwards apply live. DELETE removes the row. UPDATE/INSERT recompute the row from `documentSnapshot(document)` — the snapshot helper takes an `EngineRxDocument`; if the change event only carries plain `documentData`, build the row from the plain data the same way (check what `legacySearchSnapshot` reads; if it needs an RxDocument, use `collection.findByIds([id])` once per event — but prefer plain data).
- **Registry**: memoise per collection instance in a `WeakMap<object, CatalogueSearchBlob>`; every panel on the same collection shares one blob. Dispose (unsubscribe, clear the map) when the collection closes — rxdb 17 exposes an `onClose` hook array on `RxCollection` (verify the name in `node_modules/rxdb/dist/types/rx-collection.d.ts`); also drop the WeakMap entry then.
- **Memory**: retain only folded rows + blob text. Never retain documents or snapshots.
- Errors from `find().exec()` propagate through `ready` and `changes$` (a read failure must stay eligible for the existing storage recovery in `observeEngineQuery`, exactly as the scan lane's comment says today).

### 2. `packages/query/src/engine-query.ts` — `matchingSelectors$`

For `phraseSearch` collections (`products`, `variations`) the whole existing routing (anchor/short-term scan, index lane, deadline scan lane, false-hit audit, terms post-filter) is replaced by ONE lane:

```ts
if (phraseSearch) {
  const terms = searchTerms(search);
  if (terms.length === 0) return of({ selector, hitIds: [] }); // matches today's behaviour: no usable term selects nothing
  const blob = catalogueSearchBlobFor(collection, searchFields, documentSnapshot);
  return blob.changes$.pipe(map(() => ({ selector, hitIds: blob.search(terms) })));
}
```

Keep the `foldedSearch` guard above it (folds-away-entirely → `hitIds: null`). `searchFields` resolve exactly as today (`descriptor.read?.searchFields ?? descriptor.searchFields ?? collection.options?.searchFields ?? []`). Non-phrase collections keep their code byte-for-byte. Remove the now-dead phrase branches (`phraseSearchAnchor`, `indexSearch`, the `limit: Number.MAX_SAFE_INTEGER` find, the terms post-filter). If `phraseSearchAnchor` has no other caller after this, delete it and its tests.

The result ids feed `executeAdapterQuery({ hitIds })` (#2086), which hydrates by `findByIds` — unchanged.

### 3. `packages/query/src/search-readiness.ts`

- Warm-up for `TILL_COLLECTIONS` = `catalogueSearchBlobFor(...).ready` instead of `collection.initSearch(...)`. The secondary tier still starts when the till pair reports ready or the head-start cap fires, as today.
- The audit (`auditCollection`) samples only the secondary (FlexSearch) collections: products and variations are removed from the audit set. The audit exists to catch an index that cannot find its own content; the blob is the content.

### 4. `packages/sync-engine/src/collections/engine-collections.ts`

`CollectionCreator` gains `options?: Record<string, unknown>`; the `products` and `variations` creators get `options: { searchIndex: false }` with a short comment citing the measurement above and #2073. Effect: the search plugin's `createRxCollection.after` hook (`packages/database/src/plugins/search.ts`, `removePersistedSearchIndexes`) sweeps the persisted `products-search-v5-*_flexsearch` / `variations-search-v5-*_flexsearch` collections from disk on the next open, and `initSearch` refuses these collections if anything still calls it. Options are not part of the schema hash, so no DB6.

### 5. Tests (vitest in `packages/query`, the package's existing runner elsewhere)

- `packages/query/tests/catalogue-search-blob.test.ts`
  - Contract: build the blob from `SEARCH_FIXTURE_PRODUCTS` (snapshot = `{ name, sku, barcode }`, id = `String(id)`) and for EVERY query in `SEARCH_FIXTURE_TRAPS` plus the four wrapped-punctuation queries `'RED-1,'`, `'(banana berry)'`, `'skoda.'`, `'"k2"'`, assert the id SET returned by `search(searchTerms(query))` equals `searchFixtureExpectedIds(query)` (import both from `@wcpos/sync-core`; sort both sides). Ordering is the consumer's job — do not assert it here.
  - Change stream: with a fake collection (`find().exec()` + an rxjs `Subject` as `$`), an INSERT / UPDATE / DELETE event changes the next `search()` result after `changes$` emits.
  - Events that arrive during the initial load are applied, not lost.
  - `dispose()` unsubscribes and a second `catalogueSearchBlobFor` call after close returns a fresh blob.
- `packages/query/tests/engine-query.test.ts`: existing products/variations search tests must keep asserting the same RESULTS, but must no longer expect `initSearch`/index `find` calls for those collections. Add one test: a products search with three keystrokes performs exactly one `find` on the collection (the blob build) and otherwise only `findByIds`. Non-product tests untouched.
- `packages/query/tests/search-readiness.test.ts` (or wherever readiness is tested): warm-up no longer calls `initSearch` for products/variations; the audit never samples them.
- `packages/sync-engine`: a test that `engineCollectionCreators().products.options` and `.variations.options` carry `searchIndex: false`.
- **Mutation check, then revert**: make `search()` return the first term's rows without intersecting → the fixture contract test must fail (report which cases). Restore the code before finishing.

## Out of scope — do not add

Persisting the blob or sidecar rows; touching any other collection's FlexSearch; worker/off-thread placement; changing `encodeSearchText`, `foldSearchText` or `FLEXSEARCH_MIN_TERM_LENGTH`; a barcode/SKU equality index; environment variables; feature flags; new logger error codes; retries, locking, leader election; bench files; plan files; changes under `apps/`.

## Budget (added lines; deletions do not count)

≤ 320 added non-test lines, ≤ 1,000 added lines total. If you are about to exceed either, finish the current step, then STOP and report why instead of continuing. Splitting the work into more files does not raise the budget.

## Run before finishing (one suite at a time, worker-capped — the machine has 24 GB and a hook blocks uncapped runs)

```
pnpm -C packages/query test -- --maxWorkers=2
pnpm -C packages/sync-engine test -- --maxWorkers=2
pnpm -C packages/database test -- --maxWorkers=2
pnpm -C packages/query exec tsc --noEmit -p tsconfig.json
pnpm -C packages/sync-engine exec tsc --noEmit -p tsconfig.json
pnpm -C packages/query exec eslint --fix src tests
```

(Check each package's `package.json` for the actual test script name and tsconfig path; use what exists.) Do not `git commit` — report the diff summary, test output and the mutation-check result instead.
