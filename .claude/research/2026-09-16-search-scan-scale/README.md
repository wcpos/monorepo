# Search at catalogue scale: the index is the wrong data structure, not a badly tuned one

Research for wcpos/monorepo#2073, 2026-09-16. Companion files in this directory:

- `vendor-sources.md` — primary-source read of rxdb 17.4 / rxdb-premium 17.4.0 / FlexSearch 0.7.43 with
  file:line citations (what the storages do with a non-indexed query, what the premium adapter does,
  how FlexSearch `full` allocates).
- `BENCH-SPEC.md` + `bench-output.md` — the RxDB-level bench (`packages/database/src/catalogue-search-scale.bench.test.ts`,
  gated by `CATALOGUE_SCALE_BENCH=1`) comparing today's index against two storage-side scans on
  memory and filesystem-node storage at 2,000 and 20,000 rows.
- The flat-blob micro-bench is reproduced inline below; its script is `blob-scan-bench.mjs` here.

## 1. Restate the problem before choosing a structure

The contract is enshrined in tests: `packages/sync-core/src/searchFixtureCatalogue.ts` (one
product table, one named trap table, a reference matcher) is asserted against the index
(`search.fixture-contract.test.ts`), the scan fallback (`search-match.test.ts`) and, ported to
PHPUnit, the plugin's SQL. Its header states it: *every whitespace-separated term matches a
substring of name, sku or barcode, in any order and across fields; shared fold and
wrapping-punctuation stripping, no minimum length. Exact SKU / barcode rank first; descriptions
never match.* #2065 (2026-09-15) restored the any-order rule for products after the phrase-search
plan of 2026-09-14 had briefly made the typed string contiguous. Spelled out:

- **substring** match, not prefix and not token: `saippua` must find `Kuorintasaippua`, `count` must
  find `discount`;
- over a handful of **short text fields**: products `name`/`sku`/`barcode` (measured 52 folded chars
  per row on synthetic data; real stores similar), variations `sku`/`barcode`, customers seven contact
  fields, coupons `code`/`description` (~330 chars);
- **AND across terms, OR across fields**, answered within a 250 ms input debounce;
- **one- and two-character terms must match** (owner, 2026-09-16). Products require every typed
  term including short ones as a substring (`searchTerms`/`fieldsMatchAllTerms` in
  `search-match.ts`); a lone short term on other collections matches as a word prefix
  (`fieldsMatchShortPrefix`). The index cannot serve either (`minlength: 3`), so today both are
  served by reading the **whole collection into the renderer** and filtering in JS on every
  keystroke (`engine-query.ts:205-230`). `FLEXSEARCH_MIN_TERM_LENGTH` is the index's floor, not the
  product's;
- **exact parity** with the server, because the app's own divergence checks compare returned
  documents' text and a silent miss is invisible (issue comment, 2026-09-15).

The searchable text of a 20,000-product catalogue is about **1 MiB**. That is the whole corpus. Any
structure whose size is a multiple of that is affordable in the renderer; a structure whose size is a
multiple of *the number of substrings* is not — and `tokenize: 'full'` is by definition the latter:
a 16-character term contributes 105 postings, so the index is quadratic in term length and was
measured at 7.3 KiB per product row and 29.4 KiB per coupon row (issue body), i.e. **140× and 90×
the text it indexes**.

So the question in the issue title — "can description search be preserved for less" — has a
structural answer before any tuning: stop building an inverted index of substrings and search the
text.

## 2. The candidate structures, priced

| Structure | Bytes held for 20k products (1 MiB text) | Query cost | Substring-exact? | Notes |
|---|---:|---|---|---|
| FlexSearch `Index`, `tokenize:'full'` (today) | ~143 MiB (7.3 KiB/row measured) | ~ms once built; **build ~8 s** (0.4 ms/row) | yes | in the renderer, per tab; warmed at boot for every collection |
| FlexSearch `forward` / `strict` | ~29 / ~10 MiB (Codex bench ratios) | ~ms | **no** — loses 52% / 78% of positive pairs | dead: silent misses |
| Trigram postings | ~10–25 MiB (≈ 10–25 B/char) | intersect postings then verify | yes | more memory than the blob for no speed we need |
| Suffix array | ~5–9 MiB (5–9 B/char) | O(m log n) | yes | overkill: the blob is already sub-ms |
| **Flat folded text blob + offsets, `indexOf`** | **~2 MB** (1 MiB text ×2 for UTF-16, + 78 KiB offsets) | **0.4–0.7 ms** per query at 20k, 5–7 ms at 200k | yes | measured below; rebuild 0.8 ms |
| Folded columns inside the document, storage `$regex` scan (#2082 shape) | 0 in the renderer | O(**payload bytes**) per query: every product document read + `JSON.parse`d in the storage thread | yes | see §4 — scales with catalogue *bytes*, not text |
| Sidecar collection `{uuid, fold}`, storage `$regex` scan | 0 in the renderer; ~3 MB on disk | O(rows × ~150 B) per query in the storage thread | yes | bench path C; the persisted form of the blob |

## 3. Measured: the flat blob at catalogue scale

`node --expose-gc blob-scan-bench.mjs` — one string of all folded searchable text with a `\n` per
row and a `Uint32Array` of row starts; a term is resolved by `String.prototype.indexOf`, hopping to
the next row after each hit; AND is set intersection, longest term first. Apple Silicon, Node 22.

| Corpus | Folded text | Heap held | Build | `shirt` (5% of rows) | `saippua` (mid-word) | SKU fragment | two terms AND | miss |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| products × 20,000 | 1.00 MiB | +2 MB | 0.8 ms | 0.46 ms | 0.47 ms | 0.38 ms | 0.66 ms | 0.04 ms |
| products × 50,000 | 2.50 MiB | +5 MB | 2.0 ms | 1.06 ms | 1.09 ms | 0.95 ms | 1.60 ms | 0.11 ms |
| products × 200,000 | 9.99 MiB | +20 MB | 11.4 ms | 4.61 ms | 5.02 ms | 4.07 ms | 6.78 ms | 0.46 ms |
| coupons × 2,500 | 0.79 MiB | +1 MB | 0.3 ms | 0.30 ms | 0.24 ms | 0.18 ms | 0.55 ms | 0.05 ms |
| coupons × 20,000 | 6.33 MiB | +13 MB | 4.6 ms | 3.27 ms | 2.75 ms | 1.48 ms | 5.12 ms | 0.38 ms |
| coupons × 50,000 | 15.83 MiB | +32 MB | 6.1 ms | 8.10 ms | 6.93 ms | 3.64 ms | 13.11 ms | 0.93 ms |

Against the issue's projections for the same rows: products at 20k **2 MB vs 143 MiB**, at 50k
**5 MB vs 357 MiB**; coupons at 50k **32 MB vs 1.4 GiB**. Build is milliseconds, not seconds, so
there is nothing to persist, replay, checkpoint, export, or cap — the whole
append-history/export-history/oversized-rebuild machinery in `search.ts` (#2018, #2020, #2028,
#2070, #1897) exists to manage a structure that costs 8 s to build; a structure that costs 1 ms to
build is simply rebuilt.

Result quality is the contract by construction — the fixture's own term rule (fold, split on
whitespace, strip wrapping punctuation, keep every term) applied to the query, then substring over
the folded fields — with no index-driven `minlength` and no literal-term cap.
`packages/sync-core/src/searchFixtureCatalogue.blob.test.ts` pins a 40-line reference blob against
every named trap in the enshrined table and passes all 17 (over-100 hits, AND across terms,
reordered and gapped terms, accent and Unicode fold, compound substring, exact SKU and barcode first,
short-term substring, a short qualifier that narrows, decimal comma, description never matches,
out-of-stock searched, stock-status field not searched, AND across fields, no match), plus four
wrapped-punctuation queries checked against the fixture's own oracle, because no trap query carries
wrapping punctuation. Mutation-checked: removing the stripping rule fails exactly those four. One- and two-character terms are just shorter `indexOf` needles at the same
cost (the `zzzz` miss rows above are the floor; a short needle with many hits costs the per-hit row
lookup, still sub-ms at 20k), and word-prefix semantics where wanted is a one-character boundary
check before each hit — so the short-term path stops needing its own whole-collection read. The cap's own side effect disappears with it — `example.com` inside a coupon
description is found (the current index splits it and returns 0; Codex bench on the issue).

## 4. Why "scan it in the storage" has a cliff the blob does not

Every platform storage — OPFS in the web worker, filesystem-node in Electron main, filesystem-expo on
native — is the same engine, `storage-abstract-filesystem`. Its query path for a selector the query
planner cannot satisfy from an index (`$regex` never is: it is not a logical operator, so it can
neither satisfy nor bound an index) takes the full primary-index range, reads **every document in it**
from the documents file in 1,000-row batches, `JSON.parse`s each, then runs the Mango matcher in JS,
and only then applies `skip`/`limit`. The whole-file read shortcut needs one batch larger than 15% of
the collection and batches are capped at 1,000 rows, so above ~6,700 documents it is never taken and
the scan is batched reads. Either way the buffer lives on the *read task*, which is discarded ~10 ms
after the last queued read and cleared before every write — so a keystroke re-reads and re-parses
the collection. On native the storage runs with `inWorker: false` over an `expo-file-system` shim, so
that parse and match execute on the React Native UI JS thread. (Citations: `vendor-sources.md`
§1, §3, §4.)

**The same path is already on the hot path today, hidden behind the index.** Indexed search hits
become `{ uuid: { $in: ids } }` merged with the panel's selector as a top-level `$and`
(`withSearchSelector`, `engine-query.ts:141-146`). The planner reads bounds only from top-level
fields, so a top-level `$and` gets no range narrowing at all; and even a top-level `$in` on the
primary key is planned as a single min–max range (`getInQueryRangeOpts`), which for random uuids is
the whole collection. So after the index answers in 0.5 ms, the result query reads and parses every
product document in the storage anyway. That is the fixed per-keystroke cost the bench's inline-scan
row measures (~265 ms on the desktop engine at 20,000 × 2 KB rows), and it is paid whichever search
structure sits in front of it. The fix is independent of the index question: resolve ids with
`findByIds` (point reads through the storage's id map, as the premium plugin's own `find()` does) and
apply the panel's selector to those documents, instead of handing the storage an `$in`.

**Measured directly** (probe: 20,000 rows of ~2 KB with random v4 uuids, `stockStatus` and `price`
indexed, medians of 5, RxQuery cache evicted per run). The executor runs a `find` AND a `count` on
the same selector, so a keystroke pays both:

| 20,000 rows | `$and` + `$in`, find limit 20 sorted | `$and` + `$in`, count | `$in` merged top-level, find | `findByIds` |
|---|---:|---:|---:|---:|
| memory, 20 hits | 32 ms | 30 ms | 0.1 ms | 0.0 ms |
| memory, 1,600 hits | 9 ms | **660 ms** | 53 ms | 0.6 ms |
| **filesystem-node**, 20 hits | **188 ms** | **193 ms** | 0.2 ms | 0.0 ms |
| **filesystem-node**, 1,600 hits | **677 ms** | **683 ms** | 49 ms | 0.9 ms |

So on the desktop engine a common word costs ~1.4 s of storage time per keystroke after the index
has answered, and even a rare one ~0.4 s. Merging the `$in` to top level is not enough (the min–max
range still spans random uuids at 1,600 hits); point reads are. Fix shipped separately for the
1.10.x patch train — see the PR linked from #2073.

Consequence: a folded column stored *inside* the product document costs a parse of every product
**payload** — description, images, meta_data — per query. The searchable text is ~50 bytes of a
~2–5 KB row, so this scan does 40–100× the work the blob does, in the thread the storage owns. On
native that is the JS thread.

Measured (`bench-output.md`, real RxDB 17.4 + real premium plugin, 20,000 synthetic products of
~2.0 KB stored JSON each — real Woo payloads run larger — Apple Silicon, medians of 5 after a
warm-up, RxQuery cache evicted per run):

| 20,000 rows | index `find` | inline folded column, storage `$regex` (full result) | sidecar `{uuid, fold}` scan (full result) |
|---|---:|---:|---:|
| memory storage | 0.1–0.6 ms | 62–66 ms | 15–16 ms |
| **filesystem-node** (Electron main's engine) | 0.1–0.5 ms | **254–284 ms** | 26–28 ms |
| index build / heap delta | 1.2 s / +221 MB (memory), 1.9 s / +328 MB (fs) — includes the storage's own copy of the index documents; the live heap-snapshot figure of 7.3 KiB/row (143 MiB) is the cleaner sizing number | | |

At 2,000 rows the same shape held (fs: inline ~12 ms, sidecar ~2 ms, index ~0.05 ms). So on the
desktop engine the inline scan already exceeds the 250 ms input debounce at 20,000 rows, and is
linear in catalogue bytes. The shape is the finding: cost ∝ catalogue bytes, not searchable text. It
is a fine shape for 2,500 coupons and the wrong shape for a catalogue.

The sidecar `{uuid, fold}` collection removes the payload from the scan (≈150 B a row, 13.7 MB on
disk for 20k in this harness) and is the right **persisted** form of the blob; but a scan through the
storage still pays file read + parse + matcher per keystroke (27 ms on fs at 20k, linear) where the
in-memory blob pays a 0.5 ms `indexOf`.

Two side findings from the same run:

- **The scans diverge from the contract on wrapping punctuation, not the index.** Query `01234-`
  returned 11 index hits (`012340`…`012349` plus the exact SKU) against 1 from every scan, on both
  storages. The enshrined contract strips wrapping punctuation from each term
  (`searchFixtureMatches` in `searchFixtureCatalogue.ts`; `WRAPPING_PUNCTUATION` in the encoder), so
  **11 is the contract-correct answer** and the raw `$regex` scans — the bench's, and any folded-column
  regex that escapes the typed term verbatim — are the ones that diverge. Any replacement structure
  must run the query through the contract's term rule before matching; the blob pin below does
  (`searchFixtureCatalogue.blob.test.ts`). I first wrote this finding the other way round; the
  fixture file corrected me.
- **The harness's "sidecar page" mismatch on fs is an artefact**: a `limit: 20` query without a sort
  was compared against the first 20 *sorted* ids; memory storage happens to return primary order and
  fs does not. Not a search finding.

## 4b. What the vendored source says about the index we run today

From `vendor-sources.md` (rxdb-premium 17.4.0, FlexSearch 0.7.43, pretty-printed citations there):

- `initialization: 'lazy'` is in the premium typings but **never read** by 17.4.0; the import of
  the persisted export and the append replay start eagerly at `addFulltextSearch`. The boot warm-up
  in `search-readiness.ts` then builds every collection's index on top of that. Nothing about the
  index is deferred.
- `preset: 'performance'` passed as an option is a **no-op** in 0.7.43 (`apply_preset` shadows its
  own table); the index runs at `resolution: 9`, `optimize: true`, `fastupdate: true`, with an empty
  `ctx` (context is only populated for `strict`). `fastupdate: true` means every posting push also
  appends a reference to a per-id array — the register — which is why a freshly built index costs
  more than one reopened from an export (`fastupdate: false` after import).
- One 154-byte description through our encoder under `full` produces **499 postings** and a
  499-entry register for that single row; `forward` 95; `strict` 19. That is the 29 KiB/coupon.
- Every non-product search calls `find(search)` with no limit and is capped at FlexSearch's default
  **100 results**; customers, orders, coupons and categories silently truncate above that.
- A throwing pipeline handler halts the pipeline before the checkpoint advances and makes every
  later `find()` throw for the life of the instance (why the stalled-index takeover lane exists).

## 5. Options

### A. Flat folded blob per collection+locale, built in the query layer (recommended)

- `packages/query` keeps, per searched collection, `{ blob, offsets, ids }` built from the folded
  `searchFields` (the existing `foldSearchText` + `LEGACY_SEARCH_FIELDS` + `legacySearchSnapshot`).
  `matchingSelectors$` resolves a term to ids with `indexOf`. The ids should then be applied with
  `findByIds` + an in-JS filter for the panel's selector, **not** as `{ uuid: { $in: ids } }` — §4
  shows the `$in` form reads the whole collection in the storage. (Paging and sorting then happen on
  the resolved set, which is what the index path effectively does today after its own full read.)
- Maintenance: rebuild on the collection's change stream, throttled (the 500 ms `SEARCH_SCAN_RETHROTTLE_MS`
  already exists). A rebuild is 0.8 ms at 20k rows; there is no incremental structure to get wrong.
- Boot: the first build needs each row's searchable fields once. Two ways, in order of preference:
  1. **sidecar rows** written by the sync engine's materialisation step, where the payload is already
     parsed (the same place `promotedProductColumns` runs) — boot reads ~3 MB of tiny docs;
  2. a one-time `find()` over the collection, which is what the short-term fallback in
     `engine-query.ts` does on *every keystroke today*, so once per boot is strictly cheaper than now.
- Memory: 2 MB per tab at 20k products; 32 MB at 50k coupons. `multiInstance: true` costs one blob
  per tab, which at these sizes is fine. Placement (#2026) becomes a question about the *remaining*
  indexes, if any — for the catalogue there is nothing worth moving to a worker.
- What it deletes: `tokenize`, `encode`, `minlength`, the literal cap, `SEARCH_INDEX_VERSION` bumps,
  the append/export history caps, the oversized-index rebuild, the false-miss audit, the 250 ms
  deadline lane and the stalled-index takeover — all of `search.ts`'s FlexSearch lifecycle for the
  collections moved over. The premium plugin stays vendored for anything not moved.
- Cost stated plainly: the query layer holds one string per collection per tab; a search is a linear
  scan of it. At 200k products (10 MiB) a two-term query is 7 ms. That is the ceiling nobody was
  watching, and it is above any WooCommerce store the POS will meet.

### B. Same blob, hosted in the storage worker / main process

Everything in A, with the blob owned where the data is and ids returned over the existing channel.
This is #2026's option 2/1 applied to a 2 MB structure instead of a 143 MiB one. Worth it only if a
measured renderer budget demands it; not first.

### C. Sidecar search collection scanned by the storage (no in-memory structure)

Zero renderer memory; per-keystroke cost = storage read + parse + regex over ~150 B rows. Fine up to
tens of thousands of rows on desktop/web (bench-output.md), but the scan runs on the JS thread on
native, and the sidecar has to exist anyway as A's persisted form. Take C as A's fallback when a blob
has not been built yet, not as the design.

### D. Folded columns inside the document + storage scan (the #2082 shape, generalised)

Right for small, prose-heavy collections whose documents are mostly the searched text (coupons).
Wrong for the catalogue for the reason in §4. If #2082 lands for coupons that is consistent with A:
coupons can also move onto the blob later at 0.79 MiB.

### E. Keep FlexSearch, add the missing ceiling (issue question 5)

If any FlexSearch index remains, `createSearchInstance` should price it before building:
`sourceCount × KIB_PER_ROW[collection]` (7.3 products, 5.0 variations, 3.7 customers, 29.4 coupons,
measured) against a renderer budget constant, refusing (as `searchIndex: false` already does) and
falling back to the scan lane when over. And the boot warm-up in `search-readiness.ts` should not
warm secondary collections unconditionally — `initialization: 'lazy'` is defeated today because every
collection is warmed at startup. This is a stop-gap, not a direction.

### F. Native SQLite for native (`rxdb-premium/plugins/storage-sqlite` is vendored)

`LIKE '%term%'` off the JS thread, natively, over a sidecar column. Only native benefits; not needed
if A holds, but it is the honest answer to "where should search run on a phone" if A's 2 MB ever
matters there.

### G. Separate the code lane from the text lane

A scanned barcode is an equality lookup, not a fulltext query. A schema index on `payload.barcode`
(and `payload.sku`) answers the scanner in microseconds through the storage's own B-tree with no
search structure at all; the text lane then only serves typed searches. Independent of A–F; cheap;
worth doing regardless.

## 6. Recommendation

Build **A** for products and variations first (the two indexes the issue projects at 143 + 98 MiB),
with **G** alongside, and let the coupon question follow whichever of #2082 or the blob lands first.
Keep **E**'s pricing gate only for as long as a FlexSearch index remains anywhere.

Independently of all of the above, and before any of it: **stop handing the storage an `$in` of
search hits** (§4). It is a full collection read per keystroke on every platform today, it is the
part of search latency no index can remove, and it is one function (`withSearchSelector`) plus the
callers that consume the selector.

Decisions this needs from the owner, each with my pick:

1. ~~Term minimum length.~~ Not a decision: 1- and 2-character matches are a requirement the app
   already meets (owner, 2026-09-16), today via the renderer-side whole-collection scan. The blob
   serves them directly; `FLEXSEARCH_MIN_TERM_LENGTH` goes with the index.
2. **Where the searchable text comes from at boot.** Sidecar rows written by the sync engine (adds a
   write per materialised product) vs a one-time full read per boot. Pick: sidecar, because it also
   gives C for free and keeps boot off the payloads.
3. **Whether search should stay in the renderer at all.** At 2 MB the answer for the catalogue is
   yes; #2026 should be re-scoped to whatever indexes survive.

## 7. Questions from the issue, answered

1. *Tokenizer options* — priced on the issue by Codex: `forward`/`strict` lose 52%/78% of positive
   pairs silently. Not viable. The literal cap only trades memory for misses on long tokens.
2. *Per-field tokenizers* — FlexSearch 0.7.43 `Document` supports them (`document.js`, one `Index`
   per field with merged options); the premium adapter destructures only `Index` and constructs
   `new Index(indexOptions)` (`vendor-sources.md` §5d), so it is integration work, and it still loses
   recall on the cheaper field.
3. *The scan alternative* — depends on **what** is scanned: whole documents (cliff, §4) or the folded
   text (§3, sub-ms at 20k, 7 ms at 200k).
4. *Where the cost lives* — both, and the source says why: under `full` every substring ≥ 3 of
   every term is a new map key with its own posting array plus a register entry per id
   (499 postings for one 154-byte description), so retained bytes track distinct substrings, i.e.
   text volume; the pipeline's per-row append persistence is a second, content-independent cost on
   top. Neither is paid by a structure that is rebuilt in 1 ms.
5. *The ceiling* — with A there is no ceiling within reach; with FlexSearch retained, gate on
   `count × KiB/row` (E).

## Method notes

- Blob heap deltas are `process.memoryUsage().heapUsed` after `global.gc()` with the row array
  released; they include V8 string overhead. UTF-16 doubles ASCII text; a `Uint8Array` + `TextDecoder`
  variant would halve it, at the cost of byte-offset bookkeeping — not worth it at these sizes.
- The synthetic corpus over-represents mid-word hits (compound words are 10% of the vocabulary), so
  hit counts are high; timings are dominated by `indexOf` over the blob, which does not depend on hit
  density except through the per-hit row lookup (binary search over offsets).
