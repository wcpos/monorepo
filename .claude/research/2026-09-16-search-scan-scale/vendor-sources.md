# Vendored-source facts for #2073 (search index sizing vs. storage scan)

Primary sources only: the installed `rxdb-premium@17.4.0`, `rxdb@17.4.0` and `flexsearch@0.7.43`
under `/Users/kilbot/Projects/monorepo-v2/.worktrees/coupon-folded-scan/node_modules/`, and our own
code at `origin/main` (`eb47d3ac68d0965537cd0b8027587890a4469682`) in
`/Users/kilbot/Projects/monorepo-v2/.claude/worktrees/research-search-scan-scale`. No doc pages, no
memory notes.

## How to reproduce the line numbering

The `dist` files are minified single lines, so every vendor citation below is against a
**pretty-printed copy**. `prettier` refuses paths under `node_modules` on the command line, so the
file is piped through stdin. Per file:

```sh
WT=/Users/kilbot/Projects/monorepo-v2/.worktrees/coupon-folded-scan
OUT=/private/tmp/claude-501/-Users-kilbot-Projects-monorepo-v2/eab12ed4-cb7a-455e-8cc9-705b2b85b7d9/scratchpad/pretty
mkdir -p "$(dirname "$OUT/<relpath>")"
cat "$WT/<relpath>" | npx --prefix "$WT" prettier --parser babel > "$OUT/<relpath>"
```

`<relpath>` is the path shown in each citation, relative to the worktree root. The same command was
run on `flexsearch/src/*.js`, which ship unminified — prettier still **reformats** them, so the line
numbers below do **not** match the raw `src` files. Re-run the command to get the numbering used
here.

Our own `.ts` files are cited at their real, unformatted line numbers (no pretty-printing).

Three small read-only probes were run with `node` against the same installed packages to confirm
source readings that are easy to get wrong (FlexSearch presets, index shape, RxDB query plans).
They are labelled **PROBE** and are corroboration, never the primary claim.

---

## 1. How the abstract-filesystem storage evaluates a selector no index satisfies

**Answer.** All three platform storages are the same code: `getRxStorageOPFS`,
`getRxStorageFilesystemNode` and `getRxStorageExpoAsync` each call
`getRxStorageAbstractFilesystem(...)` and differ only in the filesystem object, the lock and the
`inWorker` flag. When `queryPlan.selectorSatisfiedByIndex` is false, `abstractFilesystemQuery` builds
a mingo matcher, slices the index rows between the plan's start/end bounds — which for a `$regex` or
a `$and` is the **entire live collection** (§4) — and then reads and `JSON.parse`s **every document
in that range** before the matcher sees it. `skip`/`limit` are applied only *after* matching and
sorting, so a limit never reduces the read. Reads go through `getDocumentsJson`, which batches index
rows at 1,000 and JSON-parses each batch.

The `wholeDocumentsFileContent` buffer is **per read-run, not per instance**. It is created on a
context object built fresh inside each `TaskQueue.triggerReadTasks` lock acquisition, shared by every
read task drained into that run, and dropped when the run ends (a run ends once no new read task
arrives within ~10 ms). Writes never share a read run's context and additionally clear the field
explicitly before each write task. **So a repeated full scan re-reads the documents file from
OPFS/disk and re-parses it on every run** — it is both I/O-bound and parse-bound, and nothing is
amortized between keystrokes.

A second, sharper limit: the whole-file shortcut only fires when the *requested batch* exceeds 15 %
of the collection, and `getDocumentsJson` caps batches at 1,000 rows. `total * 0.15 < 1000` means
**the shortcut is unreachable for any collection above ~6,667 documents** — a 20,000-row catalogue
scans through grouped ranged reads instead.

### Evidence

All three storages extend the same abstract filesystem:

- `node_modules/rxdb-premium/dist/esm/plugins/storage-opfs/index.js:5-12` —
  `getRxStorageOPFS(t = {}) { return r({ name: RX_STORAGE_NAME_OPFS, abstractFilesystem: new e(), abstractLock: navigator.locks, inWorker: !t.usesRxDatabaseInWorker }); }`
- `node_modules/rxdb-premium/dist/esm/plugins/storage-filesystem-node/index.js:7-14` —
  `getRxStorageFilesystemNode(t) { return e({ name: RX_STORAGE_NAME_FILESYSTEM_NODE, abstractFilesystem: new NodeFilesystem(t.basePath), abstractLock: r.locks, inWorker: !1 }); }`
- `node_modules/rxdb-premium/dist/esm/plugins/storage-filesystem-expo/index.js:13-22` —
  `getRxStorageExpoAsync() { return e({ name: RX_STORAGE_NAME_EXPO_OPFS, abstractFilesystem: new t(!0), ... inWorker: !1, settings: a }); }`

The query itself, `node_modules/rxdb-premium/dist/esm/plugins/storage-abstract-filesystem/query.js:21-59`
(`p` = storage instance, `v` = prepared query, `y` = the read-run context):

```js
q.selectorSatisfiedByIndex || (b = r(p.schema, v.query));      // line 32  — r = getQueryMatcher
var k = !q.sortSatisfiedByIndex,
  ...
  E = (q.inclusiveStart ? o : n)(g.rows, [F], d),              // 38 — lower bound in index rows
  H = (q.inclusiveEnd ? l : m)(g.rows, [K], d),                // 39 — upper bound
  Q = await a(h.documentFileHandle, y),                        // 40 — getAccessHandle(fileHandle, run)
if (b) {
  var A = H >= E ? g.rows.slice(E, H + 1) : [];                // 43 — the WHOLE ranged slice
  if (A.length > 0)
    for (var C = await u(h, Q, y, A), D = 0; D < C.length; D++) // 45 — u = getDocumentsJson
      b(C[D]) && z.push(C[D]);                                  // 46 — matcher AFTER parse
}
...
return ((z = z.slice(j, S)), Promise.resolve({ documents: z })); // 59 — skip/limit applied last
```

Line 26 is the only early exit: `if (0 === g.rows.length) return { documents: [] };`.
Note lines 49-52: the `skip`/`limit` slice *before* reading (`G = G.slice(j, S)`) happens **only** on
the `else` branch — i.e. only when there is no matcher.

Batching and parsing,
`node_modules/rxdb-premium/dist/esm/plugins/storage-abstract-filesystem/documents-file.js:49-62`:

```js
export async function getDocumentsJson(t, n, r, a) {
  var o = [], s = e(a, 1e3);                     // 51 — batchArray(rows, 1000)
  return (await Promise.all(s.map(async (e) => {
      var a = await getDocumentsJsonString(t, n, r, e),
        s = JSON.parse(a);                        // 56 — JSON.parse per batch
      o = 0 === o.length ? s : o.concat(s);
  })), o);
}
```

The 15 % whole-file rule, same file, lines 63-75:

```js
async function o(e, t, n, r) {
  if (!t.wholeDocumentsFileContent) {
    var o = 0.15;
    if (a(e) * o < r && a(e) > 1) {               // 66 — getTotalDocumentCount(state) * 0.15 < requested
      var s = await n.read(0);                    // 67 — read the ENTIRE documents file
      t.wholeDocumentsFileContent = s;            // 68 — cached on the RUN context `t`
    }
  }
}
export async function getDocumentsJsonString(e, n, r, a) {
  var i = a.length;
  i > 2 && (await o(e, r, n, i));                 // 74 — only considered for >2 rows
```

`getTotalDocumentCount` is the whole-collection row count:
`node_modules/rxdb-premium/dist/esm/plugins/storage-abstract-filesystem/helpers.js:412-414` —
`export function getTotalDocumentCount(e) { return e.firstIdx.rows.length; }`

When the buffer is absent, reads are grouped by proximity —
`documents-file.js:95-101` (`batchIndexRowReads(a, 25)`, then one ranged read per group) and
`documents-file.js:139-156` (groups rows whose byte gap is under `25 × average doc size`; a
contiguous full-range scan therefore collapses to roughly one ranged read per 1,000-row batch).

**Lifetime of `wholeDocumentsFileContent`** —
`node_modules/rxdb-premium/dist/esm/plugins/storage-abstract-filesystem/task-queue.js`:

```js
var e = {                                         // 89-95 — a NEW context object per lock acquisition
  type: "READ",
  storageInstance: t(this.storageInstance),
  accessHandlers: new Map(),
  touchedWriteDocuments: new Set(),
  knownChangesContent: [],
};
await this.beforeTaskReadOrWrite(e);
for (var s = !1; !s;) {                           // 97-110 — drain loop
  var r = this.readTasks;
  ((this.readTasks = []),
    1 === r.length ? await r[0](e) : await Promise.all(r.map((t) => t(e))),
    0 === this.readTasks.length &&
      (await Promise.race([ a(10), n(this.writeTaskAdded$), n(this.readTaskAdded$) ])),
    0 === this.readTasks.length && (s = !0));     // 109 — run ends when nothing new within ~10ms
}
} finally { if (e) await this.cleanupAfterRun(e); } // 112 — handles closed, context discarded
```

`cleanupAfterRun` closes every access handle (`task-queue.js:246-252`); `getAccessHandle` memoizes
handles on that same per-run map (`task-queue.js:262-265`). Writes never reuse a read context and
clear the buffer explicitly: `task-queue.js:174` — `(s.wholeDocumentsFileContent = void 0)` inside
the per-write-task closure of `triggerWriteTasks` (`task-queue.js:164-177`).

There is **no instance-level or state-level cache of parsed documents** anywhere in this plugin;
`RxStorageInstanceAbstractFilesystem` holds only `changes$`, `readQueueEntries`, encoder/decoder and
the task queue (`storage-instance.js:29-51`).

Minor: `getDocumentsJson` issues its 1,000-row batches with `Promise.all` (documents-file.js:53-59),
and `o()` checks then awaits `n.read(0)` without a lock, so on a collection between ~1,001 and 6,666
rows several concurrent batches can each issue a full-file read before the first one publishes it.

---

## 2. What `count()` does for such a selector

**Answer.** `abstractFilesystemCount` never applies a matcher — it returns the arithmetic width of
the index range and always reports `mode: 'fast'`. The premium storage instance therefore does not
call it at all when the selector is not index-satisfied: it runs the **full query** and returns
`documents.length` with `mode: 'slow'`. RxDB core then throws `QU14` unless
`database.allowSlowCount` is true. We set `allowSlowCount: true`, so every `count()` over a regex or
`$and` selector silently runs a second complete scan — read, parse and match every document again.

### Evidence

`node_modules/rxdb-premium/dist/esm/plugins/storage-abstract-filesystem/count.js:14-29` — no matcher
anywhere in the function:

```js
export async function abstractFilesystemCount(d, l, u) {
  ...
  P = (y.inclusiveStart ? i : o)(x.rows, [v], t),
  j = (y.inclusiveEnd ? n : a)(x.rows, [b], t);
  return { count: j >= P ? j - P + 1 : 0, mode: "fast" };   // 28
}
```

The instance routes around it —
`node_modules/rxdb-premium/dist/esm/plugins/storage-abstract-filesystem/storage-instance.js:86-90`:

```js
(r.count = async function (e) {
  return e.queryPlan.selectorSatisfiedByIndex
    ? this.taskQueue.runRead(async (t) => await w(this, e, t))
    : { count: (await this.query(e)).documents.length, mode: "slow" };
}),
```

RxDB core, `node_modules/rxdb/dist/esm/rx-query.js:167-184`:

```js
} else if (this.op === "count") {
  var preparedQuery = this.getPreparedQuery();
  var countResult = await this.collection.storageInstance.count(preparedQuery);
  if (countResult.mode === "slow" && !this.collection.database.allowSlowCount) {
    throw newRxError("QU14", { collection: this.collection, queryObj: this.mangoQuery });
  } else {
    result = { result: countResult.count, ... };
  }
}
```

`allowSlowCount` does not change *how* the count is produced — the slow count has already run the
full query by the time core inspects `mode`. It only decides whether the result is returned or
rejected.

We enable it: `packages/database/src/create-db.ts:59` — `allowSlowCount: true` (also
`packages/sync-engine/src/create-rxdb-sync-engine.ts:1093`, and the test/bench harnesses).

`use-local-query.ts` subscribes to both a `find` and a `count` on the same selector
(`packages/query/src/use-local-query.ts:150-159`), so the logs scan pays this twice per emission.

---

## 3. Which thread/process pays for the scan, per platform

**Answer.**

- **Web** — the scan runs inside the dedicated OPFS worker. Our worker entry exposes only the
  storage, so the *query* (read, `JSON.parse`, mingo matcher, sort) executes off the main thread; the
  result then crosses `postMessage`. Because we do **not** pass `usesRxDatabaseInWorker`,
  `inWorker` is `true`, which means index-satisfied query results are returned to the renderer as a
  raw **JSON string** the renderer parses; a matcher scan, however, returns a parsed array from the
  worker and is structured-cloned.
- **Electron** — `getRxStorageIpcRenderer({ mode: 'storage' })` is RxDB's remote storage over IPC;
  the storage (and therefore the scan) runs in the **main process**, which is where
  `exposeIpcMainRxStorage` is installed.
- **Native** — `getRxStorageExpoAsync()` runs with `inWorker: false` and its filesystem is
  `expo-opfs`, a JS shim over `expo-file-system`. There is no worker and no second JS realm: the
  ranged reads are native-module calls, but the loop, the `JSON.parse`, the mingo matcher and the
  sort all execute on the **React Native JS thread — the same thread as the UI JS**.

### Evidence

Web: `scripts/opfs-worker-entry.mjs:1-8`:

```js
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';
import { getRxStorageOPFS } from 'rxdb-premium/plugins/storage-opfs';
import { withTargetedOpfsRecovery } from './opfs-targeted-recovery.mjs';
exposeWorkerRxStorage({ storage: withTargetedOpfsRecovery(getRxStorageOPFS()) });
```

`packages/database/src/adapters/storage/index.web.ts:11-15` —
`getRxStorageWorker({ workerInput: getWebStorageWorkerPaths().targetOpfsWorker })`.
`exposeWorkerRxStorage` forwards only `{ storage, messages$, send }` to
`exposeRxStorageRemote` (`node_modules/rxdb-premium/dist/esm/plugins/storage-worker/in-worker.js:4-36`).

`getRxStorageOPFS()` with no argument ⇒ `inWorker: !undefined === true`
(`storage-opfs/index.js:10`), and `inWorker: true` **skips** the JSON-parsing wrapper:
`node_modules/rxdb-premium/dist/esm/plugins/storage-abstract-filesystem/index.js:19-30`:

```js
if (!this.inWorker) {
  ["findDocumentsById", "query", "bulkWrite"].forEach((t) => {
    var r = n[t].bind(n);
    n[t] = async (t, e, s, i, n) => {
      var a = await r(t, e, s, i, n);
      return ("string" == typeof a && (a = JSON.parse(a)), a);
    };
  });
```

That string-return path only exists on the *non-matcher* branch of the query
(`query.js:50-51`, `return Promise.resolve('{"documents": ' + J + "}")`); the matcher branch returns
an object (`query.js:59`), so a scan is parsed in the worker and structured-cloned to the renderer.

Electron: `packages/database/src/adapters/storage/index.electron.ts:16-22` —
`getRxStorageIpcRenderer({ key: MAIN_STORAGE_KEY, mode: 'storage', ipcRenderer: getIpcRenderer() })`,
which is `getRxStorageRemote({ identifier: 'electron-ipc-renderer', mode: settings.mode, ... })`
(`node_modules/rxdb/dist/esm/plugins/electron/rx-storage-ipc-renderer.js:5-29`); the peer is
`exposeIpcMainRxStorage`, whose file header reads *"This file contains everything that is supposed to
run inside of the electron main process"*
(`node_modules/rxdb/dist/esm/plugins/electron/rx-storage-ipc-main.js:1-4, 9-37`).

Native: `packages/database/src/adapters/storage/index.ts:9-13` calls `getRxStorageExpoAsync()`,
which passes `inWorker: !1` (`storage-filesystem-expo/index.js:19`). Its filesystem is
`node_modules/rxdb-premium/dist/esm/plugins/storage-filesystem-expo/filesystem-expo.js:1` —
`import { opfs as e } from "expo-opfs";` — and `expo-opfs` is a pure-JS OPFS shim over Expo's
file API: `node_modules/expo-opfs/src/index.ts:1` —
`import { File as ExpoFile, Directory as ExpoDirectory, Paths } from 'expo-file-system';`
(`expo-opfs@1.0.9`). The async access handle's `read` slices a `File` and calls `arrayBuffer()`
(`filesystem-expo.js:131-138`), i.e. the bytes land in the RN JS heap and are decoded there.

---

## 4. The RxDB query planner and `$regex`, `$in`, `$and`

**Answer.** `$regex` can **never** make `selectorSatisfiedByIndex` true, and it can never narrow an
index range: the planner only translates `$eq/$gt/$gte/$lt/$lte` and `$in` into bounds, so an
operator it does not recognise leaves the field at `INDEX_MIN..INDEX_MAX`. A regex scan is therefore
always over the full index range for the chosen index (bounded in practice only by
`_deleted: {$eq:false}`, which RxDB injects at the top level of every prepared query).

`$in` *can* narrow a range — to `[min(values), max(values)]` — but only for the index position it
occupies, and it never satisfies the selector (the matcher still runs). Crucially, for our schemas
the primary key is the **last** field of every composite index (RxDB prefixes `_deleted` and appends
the primary key), so a `uuid: {$in: [...]}` bound sits behind an unbounded middle field and buys
nothing.

An `$and` is worse still: `isSelectorSatisfiedByIndex` returns false immediately on `$and`/`$or`, and
the per-index-field bound loop reads `selector[indexField]` at the **top level** — an `$and` wrapper
hides every field from it, so *no* field gets a bound. `withSearchSelector` in `engine-query.ts`
produces exactly that shape whenever a filter is active, so the indexed-hit `$in` list does not even
narrow the read.

### Evidence

`node_modules/rxdb/dist/esm/query-planner.js:72-97` — bounds come only from `LOGICAL_OPERATORS` and
`$in`; anything else leaves `matcherOpts` empty:

```js
var opts = index.map((indexField) => {
  var matcher = selector[indexField];                 // 73 — TOP-LEVEL lookup only
  var operators = matcher ? Object.keys(matcher) : [];
  var matcherOpts = {};
  if (!matcher || !operators.length) { ... full range ... }
  else {
    operators.forEach((operator) => {
      if (LOGICAL_OPERATORS.has(operator)) { ... }     // 86
      else if (operator === "$in") { ... getInQueryRangeOpts ... }   // 90-95
    });
  }
  if (typeof matcherOpts.startKey === "undefined") matcherOpts.startKey = INDEX_MIN;  // 100-102
  if (typeof matcherOpts.endKey === "undefined") matcherOpts.endKey = INDEX_MAX;      // 103-105
```

`query-planner.js:198` — `export var LOGICAL_OPERATORS = new Set(["$eq", "$gt", "$gte", "$lt", "$lte"]);`
(`$regex` is absent).

`query-planner.js:201-212` — `$and`/`$or` short-circuit:

```js
export function isSelectorSatisfiedByIndex(index, selector, startKeys, endKeys) {
  if (selector.$and || selector.$or) { return false; }   // 210-212
```

`query-planner.js:234-237` — any non-logical operator (including `$regex` and `$in`) disqualifies:

```js
for (var op of operationKeys) {
  if (!LOGICAL_OPERATORS.has(op)) { return false; }
```

`query-planner.js:298-339` — `$in` narrows but never satisfies; the vendor comment says so:

```
 * $in can use an index by scanning the range between the
 * smallest and the largest of the given values.
 * That range can contain non-matching documents, so the
 * selector is never satisfied by the index alone and the
 * query matcher must still filter the results.
```

`_deleted` is always injected at the top level:
`node_modules/rxdb/dist/esm/rx-query.js:280-291`:

```js
_proto.getPreparedQuery = function getPreparedQuery() {
  var hookInput = { rxQuery: this, mangoQuery: clone(this.normalizedQuery) };
  hookInput.mangoQuery.selector._deleted = { $eq: false };   // 286-288
```

`normalizeMangoQuery` does **not** flatten `$and` — it only rewrites shorthand values and recurses
into `$and`/`$or`/`$nor`/`$not`
(`node_modules/rxdb/dist/esm/rx-query-helper.js:18`, `:286` `SELECTOR_ARRAY_OPERATORS`).
The matcher is mingo over the raw selector:
`rx-query-helper.js:245-254` — `var mingoQuery = getMingoQuery(query.selector); ... return mingoQuery.test(doc);`

Our shape: `packages/query/src/engine-query.ts:141-146`:

```ts
function withSearchSelector(selector: LegacyMangoSelector, ids: string[]): LegacyMangoSelector {
	const searchSelector = { uuid: { $in: ids } } as LegacyMangoSelector;
	return Object.keys(selector).length === 0
		? searchSelector
		: ({ $and: [selector, searchSelector] } as LegacyMangoSelector);
}
```

**PROBE** (`node`, `getQueryPlan` + `normalizeMangoQuery` from the installed `rxdb`, on the real
product schema `indexes: ['stockStatus','price',['type','stockStatus']]` after
`fillWithDefaultSettings`, with `_deleted: {$eq:false}` added as `getPreparedQuery` does). Filled
indexes: `[["_deleted","stockStatus","uuid"],["_deleted","price","uuid"],["_deleted","type","stockStatus","uuid"],["_meta.lwt","uuid"]]`.

| selector | chosen index | startKeys | endKeys | satisfied |
|---|---|---|---|---|
| `{uuid:{$in:['b','d','c']}}` | `_deleted,stockStatus,uuid` | `[false, MIN, "b"]` | `[false, "￿", "d"]` | false |
| `{$and:[{stockStatus:{$eq:'instock'}},{uuid:{$in:[…]}}]}` | same | `[false, MIN, MIN]` | `[false, "￿", "￿"]` | false |
| `{'context.fold':{$regex:'abc'}}` | same | `[false, MIN, MIN]` | `[false, "￿", "￿"]` | false |

All three range the whole live collection: even the bare `$in` is useless here because `stockStatus`
sits between `_deleted` and `uuid` and is unbounded.

---

## 5. The premium FlexSearch adapter (`plugins/flexsearch/rx-fulltext-search.js`)

**Answer.**

(a) `find(term, opts)` forwards `opts` straight to `index.search` as its **second positional**
argument and then hydrates: `sourceCollection.findByIds(ids).exec()`, returning RxDocuments (not
ids). With no second argument, FlexSearch's own default caps the result at **100** (§6).

(b) Initialization replays persisted state in the constructor path of `addFulltextSearch`: every
`type:'index'` document is `index.import(name, dataStr)`-ed and every `type:'append'` document's
entries are re-added, as one promise `c` that `find()` and the pipeline handler both await.

(c) `cleanup()` waits for the queue and the pipeline, exports the four FlexSearch keys
(`reg`, `cfg`, `map`, `ctx`) as `type:'index'` upserts into the destination collection, then
bulk-removes all `type:'append'` rows.

(d) Confirmed: the adapter destructures `Index` only and constructs `new Index(a.indexOptions)`.
`Document` is never imported or referenced, and the typing accepts `IndexOptions<any>`. **Per-field
tokenizers are not reachable through this adapter.**

(e) The pipeline is `collection.addPipeline({ destination, batchSize, identifier, handler })`. A
throwing handler sets `RxPipeline.error`, which stops the loop **before** the checkpoint is written
and makes `awaitIdle()` throw forever — so `find()` throws from then on. RxDB's own comment states
the contract.

**Extra finding:** `initialization: 'lazy'` **does nothing in 17.4.0.** The option exists in the
typings but the implementation never reads it — `grep -c initialization` returns `0` for both
`dist/esm/plugins/flexsearch/rx-fulltext-search.js` and the `dist/cjs` build. The index is
constructed and the persisted-state replay promise is started eagerly inside `addFulltextSearch`, and
`addPipeline` is awaited before it returns.

### Evidence

`node_modules/rxdb-premium/dist/esm/plugins/flexsearch/rx-fulltext-search.js:189-190`:

```js
import n from "flexsearch";
var { Index: r } = n;
```

(a) lines 222-227:

```js
(t.find = async function (e, t) {
  (await this.queue, await this.pipeline.awaitIdle());
  var a = this.index.search(e, t),
    i = await this.sourceCollection.findByIds(a).exec();
  return Array.from(i.values());
}),
```

`findByIds` resolves from the document cache first and only then reads storage
(`node_modules/rxdb/dist/esm/rx-query.js:134-166`).

(b) lines 271-293:

```js
var n = a.identifier + "_flexsearch",
  s = (await a.collection.database.addCollections({ [n]: { schema: t(a.collection.schema.jsonSchema) } }))[n],
  o = new r(a.indexOptions),                      // 277 — new Index(indexOptions)
  c = (async () => {
    var e = await s.find().exec(),
      t = e.filter((e) => "index" === e.type);
    (await Promise.all(t.map((e) => { e.dataStr && o.import(e.name, e.dataStr); })),   // 283
      e.filter((e) => "append" === e.type).forEach((e) => {
        e.dataAr.forEach((e) => { __wcposIndexSearchText(o, e.id, e.searchable); });   // 290
      }));
  })(),
```

(c) lines 228-246:

```js
(t.cleanup = async function () {
  (await this.queue, await this.pipeline.awaitIdle());
  var e = new Set(["reg", "cfg", "map", "ctx"]),
    t = await this.collection.find({ selector: { type: "append" } }).exec();
  0 !== t.length && (await new Promise((t) => {
      this.index.export(async (a, i) => {
        (e.delete(a),
          await this.collection.upsert({ type: "index", token: ..., name: a + "", dataStr: i }),
          0 === e.size && t());
      });
    }),
    await this.collection.bulkRemove(t.map((e) => e.primary)));
}),
```

The destination schema stores those as one string column:
`node_modules/rxdb-premium/dist/esm/plugins/flexsearch/schema.js:12-19` —
`properties: { ..., dataStr: { type: "string" }, dataAr: { type: "array" } }`.

(d) Typing: `node_modules/rxdb-premium/dist/types/plugins/flexsearch/types.d.ts:2,13` —
`import type { IndexOptions } from 'flexsearch';` / `indexOptions?: IndexOptions<any>;`
Lines 7-12 of the same file declare `initialization?: 'lazy' | 'instant';` with a doc comment —
the option the implementation ignores.

(e) lines 294-320:

```js
l = await a.collection.addPipeline({
  destination: ((s.__wcposAppendIndex = o), s),
  batchSize: a.batchSize,
  identifier: a.identifier + "FlexSearch",
  handler: async (t) => {
    await c;                                       // 299 — every batch waits on replay
    ...
    i = wcposChangedSearchEntries(s.__wcposAppendIndex, i);   // 307 (our churn patch)
    if (!i.length) return;
    ...
    await s.upsert(p);                             // 318 — one `append` row per batch
  },
}),
```

Pipeline failure semantics, `node_modules/rxdb/dist/esm/plugins/pipeline/rx-pipeline.js:22-27`:

```
   * The handler of the pipeline must never throw.
   * If it did anyway, the pipeline will be stuck and always
   * throw the previous error on all operations.
```

and `:136-150`, `:169-178`, `:184-193`:

```js
try { await FLAGGED_FUNCTIONS[fnKey](() => _this.handler(rxDocuments)); }
catch (err) { _this2.error = err; }
finally { releaseFlaggedFunctionKey(fnKey); }
if (_this2.error) { return { v: void 0 }; }        // 146-150 — returns BEFORE setCheckpointDoc (155)
...
while (!done && !this.stopped && !this.destination.closed && !this.source.closed && !this.error)
...
_proto.awaitIdle = async function awaitIdle() {
  if (this.error) { throw this.error; }            // 185-187
```

Our own use: `packages/database/src/plugins/search.ts:377-390` reads the `type:'append'` rows back to
decide whether the persisted index is oversized and must be rebuilt, and
`packages/database/src/plugins/search.ts:31, 376, 389` cap the destination's change-event history
(`SEARCH_EXPORT_HISTORY_LIMIT = 1`).

---

## 6. FlexSearch 0.7.43 memory shape under `tokenize: 'full'`

**Answer.** `Index.prototype.add` encodes the content into terms, and for `full` emits **every
substring of every term of length ≥ minlength** — an O(n²) explosion per term. Each distinct
substring gets its own key in a per-score bucket object and its own `[]` posting array; with
`fastupdate` on (the default) each push *also* appends a reference to `register[id]`, so one document
holds an array with one entry per posting it created. That is why retained bytes per entry track the
number of **distinct substrings**, not the byte length of the text, and why the registry is per-id:
`register` is keyed by document id and holds either `1` or a per-id array of posting references.

`context` (the `ctx` map) is **unreachable in our configuration for two independent reasons**:
`this.depth` is only truthy when `tokenize === 'strict'`, and `preset: 'performance'` passed as an
*object property* is a no-op in 0.7.43 because `apply_preset` shadows its own preset table with the
string value. So we run at the default `resolution: 9`, default `optimize: true`,
default `fastupdate: true`, `depth: false`, empty `ctx`.

`Index.prototype.search`'s limit default is **100**, and when an options object is supplied the limit
is read from it unconditionally — passing `{offset: n}` without a `limit` silently resets it to 100.

### Evidence

Constructor defaults, `node_modules/flexsearch/src/index.js` (pretty-printed):

```js
this.resolution = resolution = options["resolution"] || 9;              // 84
this.tokenize = tmp = (charset && charset.tokenize) || options["tokenize"] || "strict";  // 85-86
this.depth = tmp === "strict" && context["depth"];                      // 87  <-- context ONLY for strict
this.optimize = optimize = parse_option(options["optimize"], true);     // 89
this.fastupdate = parse_option(options["fastupdate"], true);            // 90
this.minlength = options["minlength"] || 1;                             // 91
this.map = optimize ? create_object_array(resolution) : create_object();// 96
this.resolution_ctx = resolution = context["resolution"] || 1;          // 97
this.ctx = optimize ? create_object_array(resolution) : create_object();// 98
```

The tokenizer loop, `flexsearch/src/index.js:138-292`:

```js
for (let i = 0; i < length; i++) {
  let term = content[this.rtl ? length - 1 - i : i];
  let term_length = term.length;
  if (term && term_length >= this.minlength && (depth || !dupes[term])) {   // 161 — minlength gate
    let score = get_score(resolution, length, i);
    let token = "";
    switch (this.tokenize) {
      case "full":
        if (term_length > 2) {
          for (let x = 0; x < term_length; x++) {
            for (let y = term_length; y > x; y--) {                        // 168-169 — O(n^2)
              if (y - x >= this.minlength) {                               // 170
                const partial_score = get_score(resolution, length, i, term_length, x);
                token = term.substring(x, y);                              // 178
                this.push_index(dupes, token, partial_score, id, _append);  // 179
              }
            }
          }
          break;
        }
      case "reverse":                                                       // 189-209
        if (term_length > 1) {
          for (let x = term_length - 1; x > 0; x--) {
            token = term[x] + token;
            if (token.length >= this.minlength) { ... this.push_index(...); }   // 196-204
          }
          token = "";
        }
      case "forward":                                                       // 213-224
        if (term_length > 1) {
          for (let x = 0; x < term_length; x++) {
            token += term[x];
            if (token.length >= this.minlength) { this.push_index(dupes, token, score, id, _append); }  // 218-219
          }
          break;
        }
      default:  // "strict"                                                 // 228-238
        ...
        this.push_index(dupes, term, score, id, _append);                   // 238
        if (depth) { ... this.push_index(dupes_ctx, ..., keyword); }        // 242-282 — ctx, strict only
    }
  }
}
this.fastupdate || (this.register[id] = 1);                                  // 287
```

Where the bytes land, `flexsearch/src/index.js:341-382`:

```js
Index.prototype.push_index = function (dupes, value, score, id, append, keyword) {
  let arr = keyword ? this.ctx : this.map;                    // 349
  if (!dupes[value] || (keyword && !dupes[value][keyword])) {
    if (this.optimize) { arr = arr[score]; }                  // 352-354 — one of `resolution` buckets
    ...
    arr = arr[value] || (arr[value] = []);                    // 365 — NEW key + NEW array per substring
    if (!this.optimize) { arr = arr[score] || (arr[score] = []); }
    if (!append || !arr.includes(id)) {
      arr[arr.length] = id;                                   // 372
      if (this.fastupdate) {
        const tmp = this.register[id] || (this.register[id] = []);
        tmp[tmp.length] = arr;                                // 378 — one REFERENCE per posting, per id
      }
    }
  }
};
```

So the retained cost of one row is: (number of distinct substrings) × (one string key in a bucket
object + one `Array` object holding the id) + (with `fastupdate`) one `Array` of that same length in
`register[id]`. The text's byte length only matters through the substring count.

`register` is per-id by construction — it is indexed by `id` at lines 140 (`this.register[id]`), 287
and 377, and the serializer walks it as a map of ids:
`node_modules/flexsearch/src/serialize.js:36-52`:

```js
case 0:
  key = "reg";
  if (this.fastupdate) { data = create_object(); for (let key in this.register) { data[key] = 1; } }
  else { data = this.register; }
```

Note the asymmetry on restore — `serialize.js:104-109`:

```js
case "reg":
  // fastupdate isn't supported by import
  this.fastupdate = false;
  this.register = data;
```

A freshly built index runs with `fastupdate: true` (per-id arrays of posting references); an index
restored from a persisted export runs with `fastupdate: false` (`register[id] === 1`). The same
catalogue therefore costs measurably more on the build that creates the index than on the sessions
that reopen it.

The preset bug, `node_modules/flexsearch/src/preset.js:21-34` and `:72-96`:

```js
performance: {
  resolution: 3,
  minlength: 3,
  optimize: false,
  context: { depth: 2, resolution: 1 },
},
...
export default function apply_preset(options) {
  if (is_string(options)) { ... options = preset[options]; }
  else {
    const preset = options["preset"];                 // 80 — SHADOWS the module-level `preset` map
    if (preset) {
      options = Object.assign({}, preset[preset], options);   // 89 — 'performance'['performance'] === undefined
    }
  }
  return options;
}
```

**PROBE** (`node`, importing the actually-loaded bundle
`flexsearch/dist/flexsearch.bundle.module.min.js` — `package.json` `main`/`module` point at `dist`,
not `src`): `new Index({preset:'performance', tokenize:'full', minlength:2})` and
`new Index({tokenize:'full', minlength:2})` produce identical `depth === false`; only
`new Index('performance')` (preset as a *string*) yields `depth === 2`. Our call site passes the
object form.

**PROBE** (same bundle, our real `encodeSearchText` encoder, `minlength: 3`), one 154-byte
mixed-language description, 19 encoder terms:

| tokenize | distinct map postings | `register[1]` length |
|---|---:|---:|
| `full` (today) | 499 | 499 |
| `forward` | 95 | 95 |
| `strict` | 19 | 19 |

and after `export()` → `import()` into a fresh Index, `register[1] === 1` (fastupdate disabled on
import, as `serialize.js:107` requires).

Per-field indexes in a `Document`, `node_modules/flexsearch/src/document.js:101-133` (the prior run's
"100-138" is this block; the precise field loop is 109-133, the two load-bearing lines are 117 and
128):

```js
function parse_descriptor(options, document) {
  const index = create_object();
  let field = document["index"] || document["field"] || document;
  if (is_string(field)) { field = [field]; }
  for (let i = 0, key, opt; i < field.length; i++) {
    key = field[i];
    if (!is_string(key)) { opt = key; key = key["field"]; }
    opt = is_object(opt) ? Object.assign({}, options, opt) : options;   // 117 — per-field merged options
    if (SUPPORT_WORKER && this.worker) { ... }
    if (!this.worker) { index[key] = new Index(opt, this.register); }   // 128 — one Index per field, SHARED register
    this.tree[i] = parse_tree(key, this.marker);
    this.field[i] = key;
  }
```

So 0.7.43 genuinely supports `code: full` + `description: forward` — through `Document`, which the
premium adapter never constructs (§5d).

Search limit, `flexsearch/src/index.js:391-451`:

```js
Index.prototype.search = function (query, limit, options) {
  if (!options) {
    if (!limit && is_object(query)) { options = query; query = options["query"]; }
    else if (is_object(limit)) { options = limit; }            // 396-398
  }
  ...
  if (options) {
    query = options["query"] || query;
    limit = options["limit"];                                  // 409 — UNCONDITIONAL reassignment
    offset = options["offset"] || 0;
    ...
  }
  ...
  limit || (limit = 100);                                      // 451 — the default cap
```

---

## 7. `usesRxDatabaseInWorker` (short — placement is #2026)

The OPFS settings type is a single flag: `node_modules/rxdb-premium/dist/types/plugins/storage-opfs/index.d.ts:1-8`
— *"Set this to true when you use the OPFS storage to not only create a RxDataase on the main thread
but also create a RxDatabase INSIDE of the worker."* Its only effect is
`inWorker: !t.usesRxDatabaseInWorker` (`storage-opfs/index.js:10`), which flips the JSON-string
passthrough described in §3: with `usesRxDatabaseInWorker: true` the storage instance parses its own
`query`/`findDocumentsById`/`bulkWrite` results and `changeStream` payloads instead of handing
strings to a remote peer (`storage-abstract-filesystem/index.js:19-30`). We do not pass it
(`scripts/opfs-worker-entry.mjs:7` calls `getRxStorageOPFS()` bare), so our worker is in
string-passthrough mode and hosts storage only.

---

## 8. Our own code on `origin/main`

### (a) `packages/database/src/plugins/search.ts` — index construction

`createSearchInstance` (lines 299-397). The options, lines 347-371:

```ts
const searchOptions: Parameters<typeof addFulltextSearch>[0] = {
	identifier: getSearchIdentifier(collection.name, locale),
	collection,
	docToString: (doc: any) => {
		const snapshot = documentSnapshot(doc);
		return searchFields.map((field: string) => get(snapshot, field) || '').join(' ');
	},
	initialization: 'lazy',
	indexOptions: {
		preset: 'performance',
		tokenize: 'full',
		encode: encodeSearchText,
		minlength: FLEXSEARCH_MIN_TERM_LENGTH,
		language: locale,
	},
};
```

Two of those five index options do nothing in the vendored versions: `initialization: 'lazy'` is
never read by rxdb-premium 17.4.0 (§5), and `preset: 'performance'` is swallowed by
`apply_preset`'s shadowing bug (§6). The effective configuration is `tokenize: 'full'`,
`resolution: 9`, `optimize: true`, `fastupdate: true`, `depth: false`,
`minlength: 3`, plus our encoder.

Oversized-index rebuild check, lines 377-390:

```ts
const appendDocs = await searchInstance.collection.find({ selector: { type: 'append' } }).exec();
const appendedEntries = appendDocs.reduce((total, doc) => total + doc.get('dataAr').length, 0);
const sourceCount = await collection.count().exec();
if (appendedEntries > sourceCount) {
	searchLogger.info('Rebuilding oversized search index', { ... });
	await searchInstance.close();
	await searchInstance.pipeline.close();
	await resetPipelineCheckpoint();
	await searchInstance.collection.remove();
	searchInstance = (await addFulltextSearch(searchOptions)) as typeof searchInstance;
```

`SEARCH_EXPORT_HISTORY_LIMIT = 1` at line 31 (with its rationale), applied at lines 376 and 389.
`MAX_CACHED_LOCALES = 3` at line 26. `SEARCH_INDEX_VERSION = 'v5'` at line 100 with the explanation
that an option change is **not** retroactive (lines 86-99): the pipeline resumes from a checkpoint
and rehydrates via `import()`, so changing `tokenize` in place would only affect newly synced
documents — any tokenizer change is a forced full rebuild of every catalogue.
`refusesSearchIndex` at lines 166-169, enforced in `initSearch` at lines 477-479.

### (b) `packages/query/src/engine-query.ts` — what actually runs per keystroke

- **No-anchor / short-term path loads the whole collection into the renderer and filters in JS**,
  lines 203-231:

  ```ts
  if (phraseSearch ? !anchor : foldedSearch.length < FLEXSEARCH_MIN_TERM_LENGTH) {
  	...
  	return collection.$.pipe(
  		startWith(null),
  		switchMap(() => from(collection.find().exec())),      // 215 — every document
  		map((documents) => withSearchSelector(selector, documents.filter(...).map(d => d.primary)))
  	);
  }
  ```

  `phraseSearch` is `descriptor.collection === 'products' || descriptor.collection === 'variations'`
  (lines 197-198), so **any product/variation search whose folded text yields no indexable anchor
  takes this path**.

- **The scan fallback does the same**, lines 159-174:

  ```ts
  const documents = await collection.find().exec();          // 168
  return documents.filter((document) => { ... });
  ```

  driven by `scanAnswers$()` at lines 267-277 with a 500 ms throttle
  (`SEARCH_SCAN_RETHROTTLE_MS`, line 72).

- **Indexed hits become `{uuid: {$in: ids}}`**, wrapped in `$and` when any filter is present —
  lines 141-146 (quoted in §4) — applied at lines 216-229 and 374-389.

- **Products pass an unbounded limit; other collections do not**, lines 313-315:

  ```ts
  phraseSearch
  	? activeSearch.find(indexSearch, { limit: Number.MAX_SAFE_INTEGER })
  	: activeSearch.find(search)
  ```

  The second branch reaches `Index.prototype.search(query, undefined, undefined)` and is therefore
  capped at FlexSearch's default **100** results (§6) — coupons, customers, orders, categories,
  tags and brands all take it.

- **The 250 ms deadline scan lane**, `SEARCH_INDEX_ANSWER_DEADLINE_MS = 250` at line 70 with its
  reasoning, and the lane itself at lines 366-371:

  ```ts
  const deadlineScanLane$ = timer(SEARCH_INDEX_ANSWER_DEADLINE_MS).pipe(
  	tap(() => logIndexNotAnswering()),
  	switchMap(() => scanAnswers$()),
  	takeUntil(indexAnswered$)
  );
  return merge(indexedLane$, deadlineScanLane$);
  ```

  A `catchError` on the indexed lane also hands the binding to `scanAnswers$()` permanently
  (lines 360-364).

- The divergence check only inspects **returned** documents (`findFalseHits`, lines 234-244, used at
  lines 318-334) — it cannot see a document the index failed to return.

### (c) The scan path: `scanSearchSelector.ts` + `use-local-query.ts`

`packages/sync-core/src/scanSearchSelector.ts:36-56` builds
`{$and: terms.map(term => ({$or: fields.map(...)}))}` where each arm is
`{[field]: {$regex: escapeRegex(term)}}` (folded field) or the same with `$options: 'i'` (raw
fallback fields). `scanSearchTerms` (lines 23-25) drops terms shorter than
`FLEXSEARCH_MIN_TERM_LENGTH`; `null` means "select nothing" (line 46). The header comment (lines
14-15) states the intent: *"builds a mango selector the storage evaluates (in the OPFS worker on web,
off the main thread), bounded by the caller's own limit."* §1/§2/§4 qualify that: the selector is a
top-level `$and` of `$or`s, so it is never index-satisfied, its range is the whole live collection,
and the parallel `count()` runs the scan a second time.

`packages/query/src/use-local-query.ts:85-104` (`scanSelector$`) reads
`options.searchFoldedField` / `options.searchFields` off the collection; lines 117-122 route to it
only when `collection.options.searchIndex === false`; lines 150-159 subscribe to the `find` and the
`count` on the same selector.

Logs is the only collection on that path:
`packages/database/src/collections/index.ts:429-447` —
`searchFields: ['message','context.error','context.errorCode','context.search']`,
`searchIndex: false`, `searchFoldedField: 'context.fold'`.

### (d) Product and variation schemas

`packages/sync-engine/src/collections/product-schema.ts:14-38, 56`:

- Indexed: `indexes: ['stockStatus', 'price', ['type', 'stockStatus']]` — RxDB expands these to
  `[['_deleted','stockStatus','uuid'], ['_deleted','price','uuid'], ['_deleted','type','stockStatus','uuid'], ['_meta.lwt','uuid']]` (PROBE, §4). **No searchable text field is indexed.**
- Promoted top-level columns: `uuid`, `remoteId`, `price`, `stockStatus`, `type`, `categoryIds`,
  `brandIds`, `onSale`, `featured`, `stockQuantity`.
- Everything else lives in `payload: { type: 'object', additionalProperties: true }` (line 35).

`packages/sync-engine/src/collections/variation-schema.ts:69-110`: same shape plus
`parentRemoteId` and `attributes`; **no `indexes` key at all**.

`searchFields` are not on the schemas — they live in
`packages/query/src/engine-adapter/collection-map.ts:33-58`:
`products: ['name','sku','barcode']`, `variations: ['sku','barcode']`,
`coupons: ['code','description']`, plus orders/customers/categories/tags/brands.
Those names resolve against a **flattened payload snapshot**:
`packages/query/src/engine-adapter/search-snapshot.ts:22-28` spreads `document.payload` to the top
level.

**Stored document size.** `payload` is the untouched WooCommerce REST object —
`packages/sync-core/src/protocol.ts:23-26` (`WooProductPayload = Record<string, unknown> & {id?, date_modified_gmt?}`),
`:163-167` (`ProductDocument.payload: WooProductPayload`) and `:151-155`
(`withProductColumns` spreads the promoted columns *alongside* `payload`, adding nothing to and
removing nothing from it). No `_fields`/sparse-fieldset request narrows a product pull. So the
stored document carries `description`, `short_description`, `images`, `meta_data`, `attributes`,
`categories`, `tags`, `related_ids`, `_links` and the rest.

**PROBE** (`node`, on the repo's own Woo fixture
`packages/core/jest/__fixtures__/products.json`, 10 records): `JSON.stringify` length min 2,455 /
median 2,685 / max 3,431 bytes; top-level keys include
`description`, `short_description`, `price_html`, `images`, `meta_data`, `attributes`, `_links`. For
the first record: `description` 286 B, `short_description` 36 B, `images` 280 B, `meta_data` 51 B.
Real stores with full descriptions and several images are larger; **~2.5-3.5 KB is the floor**, so a
20,000-row catalogue is roughly a 50-70 MB documents file that a full scan reads and parses on every
read run.

---

## Facts that bear on the options

1. A selector no index satisfies reads and `JSON.parse`s **every document in the index range** before
   the matcher runs; `skip`/`limit` are applied only after matching and sorting — `storage-abstract-filesystem/query.js:32, 43-46, 59`.
2. `$regex` is not in `LOGICAL_OPERATORS`, so it can neither satisfy an index nor bound one — every
   regex scan covers the whole live collection — `rxdb/dist/esm/query-planner.js:198, 234-237, 100-105`.
3. A top-level `$and` disqualifies the selector **and** hides every field from the bound loop, so
   `{$and:[filter, {uuid:{$in:ids}}]}` — the shape `withSearchSelector` emits — gets no range
   narrowing at all — `query-planner.js:210-212, 73` + `packages/query/src/engine-query.ts:141-146`.
4. `wholeDocumentsFileContent` lives on a per-read-run context that is discarded ~10 ms after the
   last queued read, and writes clear it explicitly, so repeated scans re-read and re-parse the whole
   documents file every time — `storage-abstract-filesystem/task-queue.js:89-95, 97-112, 174, 246-252`.
5. The whole-file shortcut needs a batch larger than 15 % of the collection and batches are capped at
   1,000 rows, so it is unreachable above ~6,667 documents — `documents-file.js:51, 66, 74`.
6. `count()` on a non-index-satisfied selector runs the **entire query again** and returns
   `mode:'slow'`; we set `allowSlowCount: true`, so the second scan happens silently —
   `storage-abstract-filesystem/storage-instance.js:86-90`, `rxdb/dist/esm/rx-query.js:167-184`,
   `packages/database/src/create-db.ts:59`.
7. The scan runs in the OPFS worker on web and the Electron main process, but on native
   `getRxStorageExpoAsync` has `inWorker: false` over a JS `expo-file-system` shim — the parse and
   the matcher execute on the **React Native UI JS thread** —
   `storage-filesystem-expo/index.js:13-22`, `filesystem-expo.js:1, 131-138`, `expo-opfs/src/index.ts:1`.
8. `tokenize:'full'` emits every substring ≥ `minlength` of every term, each one a new object key and
   a new posting array; with the default `fastupdate:true` each push also appends a reference to a
   per-id array — `flexsearch/src/index.js:165-185, 341-382, 376-379`.
9. Measured on one 154-byte description with our encoder: `full` 499 postings and a 499-entry
   register for a single row, `forward` 95, `strict` 19 (PROBE against
   `flexsearch/dist/flexsearch.bundle.module.min.js`).
10. `preset:'performance'` passed as an object property is a no-op in 0.7.43 (`apply_preset` shadows
    its own preset table), and `context` is only ever populated for `tokenize:'strict'` — so we run at
    `resolution: 9`, `optimize: true`, `fastupdate: true`, empty `ctx` —
    `flexsearch/src/preset.js:80, 89` and `flexsearch/src/index.js:87`.
11. `initialization:'lazy'` is declared in rxdb-premium's typings but never read by 17.4.0 (`grep -c
    initialization` = 0 in both `dist/esm` and `dist/cjs` of `plugins/flexsearch/rx-fulltext-search.js`);
    the index and its replay start eagerly — `rx-fulltext-search.js:277-293`,
    `dist/types/plugins/flexsearch/types.d.ts:12`.
12. An index restored from a persisted export runs with `fastupdate:false` (`register[id] === 1`)
    while a freshly built one runs with `fastupdate:true` (a per-id array of posting references), so
    the build session costs more than the reopen sessions — `flexsearch/src/serialize.js:104-109`.
13. Per-field tokenizers are real in 0.7.43 but unreachable through the adapter: `Document` builds one
    `Index` per field with merged options and a shared register, while the premium plugin only
    destructures `Index` and constructs `new Index(indexOptions)` —
    `flexsearch/src/document.js:117, 128` vs `rx-fulltext-search.js:190, 277`.
14. Every non-product search goes through `activeSearch.find(search)` with no limit and is therefore
    capped at FlexSearch's default 100 results — `packages/query/src/engine-query.ts:313-315`,
    `flexsearch/src/index.js:451`.
15. Products and variations already load the whole collection into the renderer and filter in JS on
    the no-anchor path and on every scan takeover — `packages/query/src/engine-query.ts:215, 168`.
16. A throwing pipeline handler stops the pipeline before the checkpoint advances and makes
    `awaitIdle()` — and therefore every later `find()` — throw for the life of the instance —
    `rxdb/dist/esm/plugins/pipeline/rx-pipeline.js:22-27, 136-150, 185-187`.
17. Product/variation schemas index only `stockStatus`, `price` and `['type','stockStatus']` (and
    nothing at all for variations); the whole Woo payload — `description`, `images`, `meta_data`,
    `_links` — is stored verbatim at ~2.5-3.5 KB per product in the repo's own fixtures —
    `product-schema.ts:35, 56`, `variation-schema.ts:69-110`, `protocol.ts:23-26, 151-155, 163-167`.
