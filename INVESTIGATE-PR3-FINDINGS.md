# PR 3 investigation — web SQLite storage (#2242)

## Scope and evidence

- **Observed:** read-only source investigation at monorepo `513ac45f8c8b6288b2ad7e6ddd6a4fceadb588be`; initialized `apps/web` submodule at `ce4ebc85704412b89ad56659051145e285999a11`. Paths/line numbers refer to these local files, including installed dependencies, not a freshly fetched upstream revision.
- Only this report was created. No tests, builds, installs, pulls, commits, runtime experiments, or migrations were run. Test outcomes below are **Inferred** from assertions, not observed failures. Spike measurements are historical evidence, not rerun results.
- **Stakes:** persisted storage and checkout are high (data/money loss); this task changes no application code. Recommendations stay within the requested engine migration; no new recovery subsystem is proposed.
- **Important corrections to the brief:** `.github/scripts/check-opfs-worker-drift.sh` is absent; no current workflow rebuilds the worker. The checked-out `apps/web` build script does **not** rewrite `opfsWorker` to a CDN URL. Native prevents deleting the six abstract-filesystem postinstall patches or shared targeted recovery. See §§1–4.

## 1. The web storage adapter today

### Runtime path and built artifact

| Source | Observed role |
|---|---|
| `packages/database/src/adapters/storage/storage-engines.ts:18–52,73–83` | `WEB_STORAGE_ENGINE = 'opfs-filesystem'`; maps engines to `/opfs.worker.js` / `/sqlite.worker.js` and basenames; required web flags are true / false respectively; Electron/native remain false. |
| `packages/database/src/adapters/default/README.md:13–31,49–78` | Binding two-era decision: switch engine and flag together; one live SQLite tab, cooperative takeover, close DBs → terminate worker → release lock; reload on dead worker, no in-place restart. Its opening platform descriptions predate PR2 (Electron is now SQLite). |
| `packages/database/src/adapters/default/index.web.ts:1–27,29–51` | Module-level `getWebNewStorage()`, registration of `createRepairOwnershipPlugin`, error wrapper, optional wrapped timing probe, development ZSchema validation; explicit `multiInstance: true`. |
| `packages/database/src/adapters/storage/index.web.ts:14–48,50–58` | `getWebStorageWorkerPaths()` accepts `globalThis.opfsWorker` only if basename matches selected engine, stripping query/hash; wrong basename logs and falls back. `getWebNewStorage()` calls `getRxStorageWorker` with URL and `workerOptions.name = getRepairOwnershipChannelName()`; optional raw timing probe. No explicit `mode`, Worker factory, or error listener. |
| `apps/main/app/+html.tsx:26–32` | Static HTML bootstrap sets `window.opfsWorker = "/opfs.worker.js"`. |
| `apps/main/public/index.html:26–31` | Second bootstrap sets the same path except under Electron user agent. On a browser window this is the `globalThis` property. |
| `scripts/opfs-worker-entry.mjs:1–15` | OPFS storage plus repair-ownership and targeted-recovery wrapper; synchronous `exposeWorkerRxStorage`. |
| `scripts/build-opfs-worker.mjs:7–25` | esbuild browser IIFE, bundled/minified, no legal comments, targeted-recovery banner; then `patchOpfsWorker`; default output `apps/main/public/opfs.worker.js`, optional argv output override. |
| `scripts/patch-opfs-worker.mjs:4–44,47–65` | Idempotent complete-write shim on `FileSystemSyncAccessHandle.prototype.write`; CLI writes via temporary file/rename. This is a post-bundle patch; premium patches instead modify inputs before bundling. |
| `apps/main/public/opfs.worker.js:1–40,53–55` | Tracked generated artifact: complete-write shim at line 1, targeted-recovery banner at 36, minified premium/recovery code at 53–55. Do not mistake installed premium changes for rebuilding this file. |

Shared wrappers and creation path are covered in §§4–6. Search found no other maintained page bootstrap assignment in `apps/main`/`packages`; the submodule's generated `apps/web/build/index.html:27–30` also contains the old assignment, and its generated entry bundle reads `globalThis.opfsWorker` (`apps/web/build/_expo/static/js/web/entry-a9c57d8674560127212c3132fa260f04.js:3966`).

### Build scripts and CI

- `package.json:10`: **only worker build script**, `build:opfs-worker = node scripts/build-opfs-worker.mjs`. `postinstall` at :36 runs eight premium input patchers, not this build. `test:scripts` at :17 runs `node --test scripts/*.test.mjs` among other checks.
- `apps/main/package.json:20–24`: `build` exports all platforms; `build:web` exports `web-build`; `build:electron` exports `electron-build`; no worker prebuild hook. `apps/web/package.json:7` runs `node scripts/build.js`.
- **Absent:** `.github/scripts/check-opfs-worker-drift.sh`; repository search of `.github` finds no `build:opfs-worker`, `build-opfs-worker`, or worker drift invocation. Do not plan to rename a nonexistent CI step.
- `.github/actions/setup-monorepo/action.yml:69–92` initializes `apps/web`, then frozen install (ordinary install runs postinstall; Dependabot's skip flag uses `--ignore-scripts`). This patches dependencies but does not regenerate the checked-in worker.
- `.github/workflows/test.yml:61–62` runs script tests, including shipped-worker marker assertions; :94–127 runs database/query tests and later the other package lanes. Marker assertions are not a byte-for-byte drift check.
- `.github/workflows/build.yml:63`, `deploy.yml:159`, `publish-mobile-update.yml:94` run `pnpm run -w build:main`; the export scripts above still do not regenerate the worker.
- `scripts/ci-plan.mjs:89–105,277–292,329–334` classifies worker source/build/patch scripts as `scripts` and widens ordinary script changes to all units/full web (and cache-hit native via `all`, :250–255). Public worker changes are `app-src`. `scripts/ci-plan.test.mjs:314–330`, **`script sub-paths classify conservatively`**, explicitly lists build/patch OPFS scripts. These are routing fixtures, not existence/drift checks.

### Publishing and CDN boundary

- **`apps/web` is a git submodule, not merely an untracked build directory.** `.gitmodules:1–4` names `https://github.com/wcpos/web-bundle`, branch `main`; `git ls-files --stage apps/web` reports mode `160000` at the SHA above. The superproject tracks the gitlink; the submodule tracks `scripts/build.js`, its tests, generated `build/index.html`, `build/opfs.worker.js`, JS/CSS/assets, and metadata. Its working tree was clean when inspected.
- `.github/workflows/publish-web-bundle.yml:95–121` checks out requested monorepo ref, initializes submodule before workspace install, then runs `pnpm web build`. At :165–192 it copies `apps/web/build/.` into a **fresh clone** of the requested web-bundle branch and commits/pushes there. At :194–203 it purges only `metadata.json` and `index.html` from jsDelivr.
- `apps/web/scripts/build.js:7–13,33–60,337–345,380–384,418–425`: export `apps/main` web with external maps, copy export into `build`, preserving only legacy `indexeddb.worker.js`. The OPFS worker comes from the fresh export, not the preserved-file list. Static-public export behavior is in §8.
- **No `opfsWorker` CDN rewrite exists in this checked-out build script.** Its replacements at `apps/web/scripts/build.js:93–204,442–450` target `_expo`, `assets`, and the generated baseURL placeholder, using `window.cdnBaseUrl` / `window.baseUrl`. `apps/web/build/index.html:29` still says `/opfs.worker.js`. Thus comments claiming the bundle rewrites this value (`storage-engines.ts:41–46`; bootstrap test :5–8) are not implementation evidence. A host-supplied override is supported by the adapter, but who sets it in the deployed WordPress host is **Unverified here**; no companion host repository was inspected.
- **Inferred PR3 consequence:** shipping `sqlite.worker.js` and its `.wasm` through export/copy is only half the task; page/host URLs and wasm resolution must agree. Do not assume the submodule currently performs that rewrite.

### Tests pinning this path

- `packages/database/src/adapters/storage/index.web.test.ts:19–36`: **`exposes only the OPFS worker path`**, **`creates the storage client with the OPFS worker`**; literal old path and repair-channel worker name.
- `apps/main/lib/storage-worker-bootstrap.test.ts:30–62`: **`%s sets window.opfsWorker to the engine’s worker`** (both HTML files), **`no bootstrap file names a worker belonging to a different engine`**.
- `packages/database/src/adapters/default/multi-instance-ruling.test.ts:47–97`: **`web matches what its CURRENT engine requires`**, **`every web engine declares the multiInstance it requires`**, **`the two web eras disagree — the coupling is real, not decorative`**, Electron/native false and explicit-flag tests. This is already a two-era test, not a literal-web-true test.
- `packages/database/src/adapters/default/error-handler-wrapping.test.ts:17–47`: parameterized **`exports the real error handler rather than the raw platform storage`**. Keep the wrapper; it need not go red merely because the engine changes.
- `packages/database/src/adapters/default/storage-timing-probe-wiring.test.ts:42–85`: per-platform **`wraps raw and wrapped layers when EXPO_PUBLIC_WCPOS_STORAGE_PROBE=1`**, **`leaves the chain untouched when the flag is unset`**. Keep both timing boundaries.
- `scripts/patch-opfs-worker.test.mjs:15,55,78,92,106,133,151–169`: shim partial-write/invalid-progress/symlink/no-handle/native-option/non-buffer tests, and **`shipped OPFS worker contains the complete-write shim exactly once`**, **`shipped OPFS worker contains targeted record recovery exactly once`**, **`shipped OPFS worker contains changelog identity protection exactly once`**.
- `apps/web/tests/sync-build-artifacts.test.js:30–61`: **`preserves legacy indexeddb worker while updating opfs worker from fresh export`**. Synthetic copy fixture, not a check of real export contents; the submodule package `test` script is a failing placeholder (`package.json:11`), and no monorepo workflow explicitly runs this test.
- Repair, recovery, leadership, and app-engine tests appear in §§3–5 and the consolidated impact inventory in §9.

## 2. Worker contents and premium contracts

### Patch reachability / deletion matrix

All dist paths in this table are relative to `node_modules/rxdb-premium/dist/{esm,cjs}/plugins/`; both formats are patched. Root invocation is `package.json:36`.

| Patcher under `scripts/` | Edited premium files; patcher source lines | Reachable through SQLite / generic worker? | PR3 decision |
|---|---|---|---|
| `patch-rxdb-premium-resurrection-leak.mjs` | `storage-abstract-filesystem/bulk-write.js`; :92–105 | No, unless worker is given abstract-filesystem storage | **STAY: native** |
| `patch-rxdb-premium-task-queue-containment.mjs` | `storage-abstract-filesystem/task-queue.js`; :308–318 | No | **STAY: native** |
| `patch-rxdb-premium-changelog-replay-safety.mjs` | `storage-abstract-filesystem/{changelog,cleanup,helpers}.js`; :143–254,432–445 | No | **STAY: native** |
| `patch-rxdb-premium-cleanup-compaction-batch.mjs` | `storage-abstract-filesystem/cleanup.js`; :44–78,124–137 | No | **STAY: native** |
| `patch-rxdb-premium-changes-file-salvage.mjs` | `storage-abstract-filesystem/bulk-write.js`; :271–283 | No | **STAY: native** |
| `patch-rxdb-premium-changelog-identity.mjs` | `storage-abstract-filesystem/{index-state,cleanup,helpers}.js`; :119–173,309–315 | No | **STAY: native shared engine/local changelog operations** |
| `patch-rxdb-premium-flexsearch-churn.mjs` | `flexsearch/rx-fulltext-search.js`; :356–366 | Not itself a SQLite/worker dependency; shared app search uses it independently | **STAY: all platforms' search** |
| `patch-rxdb-premium-sqlite-query-translation.mjs` | `storage-sqlite/sqlite-query.js`; :170–188 | Yes, new SQLite worker; Electron SQLite also needs equivalent patched implementation | **STAY: SQLite** |

**Observed import proof:** `packages/database/src/adapters/storage/index.ts:1–13` constructs `getRxStorageExpoAsync()` plus targeted recovery. Installed `dist/esm/plugins/storage-filesystem-expo/index.js:1` and `storage-opfs/index.js:1` both import/call `getRxStorageAbstractFilesystem`. `storage-sqlite/index.js:1` routes to SQLite's own instance; `storage-worker/in-worker.js:1` supplies generic remote RPC, not filesystem logic. Shared FlexSearch registration is `packages/database/src/plugins/index.ts:12,54–57` and `search.ts:11`. Electron renderer proxies IPC (`adapters/storage/index.electron.ts:21–29`); its main-process implementation is outside this repo.

**Inferred decision:** none of the eight postinstall patchers can be deleted in PR3. The first six disappear from the new web worker's runtime graph, not from native's runtime graph. Only the old worker-specific post-bundle shim and ownership wiring become deletion candidates (§4).

### `workerInput`, errors, and lifecycle

Exact declaration at `node_modules/rxdb-premium/dist/types/plugins/storage-worker/non-worker-worker.d.ts:2`:

```ts
export declare function getRxStorageWorker(settings: RxStorageWorkerSettings<Worker>): RxStorageWorker;
```

Relevant members at `node_modules/rxdb-premium/dist/types/plugins/storage-worker/worker-types.d.ts:2–10,40` (intervening options/comments elided):

```ts
export type WorkerCreator<WorkerType> = () => WorkerType;
export type RxStorageWorkerSettings<WorkerType> = {
    workerInput: string | WorkerCreator<WorkerType> | any;
    mode?: RxStorageRemoteSettings['mode'];
};
```

- **Yes, a function factory is accepted.** Page implementation `node_modules/rxdb-premium/dist/esm/plugins/storage-worker/non-worker-worker.js:1` evaluates `"function"==typeof n.workerInput?n.workerInput():new t(...)` and validates the result with `instanceof` its imported `web-worker` constructor.
- Same minified line installs `var s=[],i=e=>{s.push(e)};r.addEventListener("error",i)`: the array is never read. **There is no `messageerror` listener.** Message events forward `event.data` to an RxJS Subject. `close()` only removes message/error listeners and resolves; **no `terminate()`**.
- `node_modules/rxdb/dist/types/plugins/storage-remote/storage-remote-types.d.ts:49` declares `mode?: 'one' | 'storage' | 'database' | 'collection'`. Default is `storage` (`dist/esm/plugins/storage-remote/rx-storage-remote.js:201`).
- **`mode: 'one'` is real and eager:** `rx-storage-remote.js:11–13,20–33` obtains one keep-alive channel at storage construction and reuses it across instances. `message-channel-cache.js:8–36` closes only at zero references when not keepAlive. This is per remote-storage/channel identity, not cross-tab ownership. Gate storage construction before parked tabs can call it, not merely database opening.
- Historical spike `spikes/2138-rxdb-sqlite-wasm/RESULTS.md:40–59` documents lost first request when exposure followed top-level await, and leaked pool handles under default `storage` mode. `custom-storage.ts:29–39` chooses `mode:'one'` and module worker options. No new run was performed.

### SQLite helper exports and required adapter

`node_modules/rxdb-premium/dist/types/plugins/storage-sqlite/index.d.ts:4–7` reexports helpers; `sqlite-helpers.d.ts:4` reexports `boolParamsToInt`; `sqlite-basics-helpers.d.ts:1` reexports `getSQLiteBasicsWasm` from core RxDB. **Both are exported.**

Exact members of `SQLiteBasics` at `node_modules/rxdb-premium/dist/types/plugins/storage-sqlite/sqlite-types.d.ts:18–47` (comments elided):

```ts
export type SQLiteBasics<SQLiteDatabaseType> = {
    debugId?: string;
    open: (name: string) => Promise<SQLiteDatabaseType>;
    all(db: SQLiteDatabaseType, queryWithParams: SQLiteQueryWithParams): Promise<SQLResultRow[]>;
    run(db: SQLiteDatabaseType, queryWithParams: SQLiteQueryWithParams): Promise<void>;
    setPragma(db: SQLiteDatabaseType, key: string, value: string): Promise<void>;
    close(db: SQLiteDatabaseType): Promise<void>;
    journalMode: 'WAL' | 'WAL2' | 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'OFF' | '';
};
```

`SQLiteQueryWithParams` requires `query`, `(string | number | boolean)[]` params and `{ method: string; data: any }` context (`sqlite-types.d.ts:105–122`). Exported `getSQLiteBasicsWasm` is **not automatically the oo1 adapter**: installed core `node_modules/rxdb/dist/esm/plugins/storage-sqlite/sqlite-basics-helpers.js:420–482` calls `open_v2`, `execWithParams`, `run`, `exec`, `close` through a global promise queue.

The spike's actual oo1 adaptation is `spikes/2138-rxdb-sqlite-wasm/sqlite-basics-oo1.mjs:3–38`: await open; set `PRAGMA locking_mode = exclusive` first; bind converted booleans; return object rows; set/read back requested journal mode and throw on mismatch; close synchronously behind an async method. `sqlite-worker-entry.mjs:6–23` starts async readiness but exposes RPC synchronously; `openDb` awaits pool readiness; pool name `spike-2138`, initial capacity 64, `journalMode:'WAL'`, `storeAttachmentsAsBase64String:true` (browser worker has no Node Buffer).

Historical evidence only: `RESULTS.md:3–36` records 1416 Node tests and 64 browser tests with two browser cleanup exclusions explained at :60–72; :113–116 explicitly excludes performance, crash survival and multi-tab leadership. Those results do not prove the proposed production takeover flow.

## 3. Multi-tab assumptions and leadership

### Leadership references: production first, then tests

Search covered `packages/**` and `apps/main/**`, excluding generated worker/map output. Use `rg -a`: the two-tab spec contains NUL bytes, so ordinary rg treats it as binary.

| Production reference | What it gates / single-owner consequence |
|---|---|
| `packages/database/src/plugins/repair-ownership.ts:59–68,81–95` | Only app-authored RxDB `waitForLeadership()` call: publish repair ownership after leadership; revoke/ack before close. Skips single-instance DBs. Remove web-only repair machinery with old worker, not before. |
| `packages/database/src/plugins/index.ts:5,48` | Registers `RxDBLeaderElectionPlugin` globally. Registration alone does not require concurrent web tabs. |
| `apps/main/lib/web-write-leader.ts:18,58` | `isLeader()` is a separate Web Lock lease, not RxDB election. |
| `apps/main/lib/create-app-engine.ts:601` | Passes Web Lock ownership into engine `writePlaneOwner`. New live storage owner must be able to run write/maintenance work without waiting on an unrelated old lease. |

No app-authored `leaderElector` reference was found. Installed `node_modules/rxdb/dist/esm/plugins/leader-election/index.js:53–64` explicitly returns `true` from `isLeader()` and `PROMISE_RESOLVE_TRUE` from `waitForLeadership()` when `!this.multiInstance`; otherwise it uses the elector. **Yes, waiting resolves immediately for false.** Directly calling `leaderElector()` still constructs an elector (:23–50); false is not a ban on explicit calls.

Tests with literal `waitForLeadership` / `isLeader` / `leaderElector` references: `packages/database/src/plugins/repair-ownership.test.ts:52,91,132,151`; `apps/main/lib/web-write-leader.test.ts:40–46,59,73–76`; `apps/main/lib/create-app-engine.test.ts:82,86`; `packages/sync-engine/src/create-rxdb-sync-engine.leader-gate.test.ts:119–149`; `create-rxdb-sync-engine.product-trickle.test.ts:253–269`; `create-rxdb-sync-engine.customer-trickle.test.ts:272–288`; `create-rxdb-sync-engine.variation-prefetch.test.ts:299–316` (last three under `packages/sync-engine/src/`). These fake ownership, not actual web adapter configuration.

### Separate write lease and follower event bridge

- `apps/main/lib/web-write-leader.ts:14–65`: exclusive `navigator.locks.request` held by a lifetime promise; absent API or rejected request deliberately sets leader true and calls `onUnavailable`; dispose releases. **No storage-open fence, takeover request, worker ownership, or payment/write handoff guard.** Only production importer is `apps/main/lib/create-app-engine.ts:66`; test imports/mocks are `web-write-leader.test.ts:1` and `create-app-engine.test.ts:153`.
- `create-app-engine.ts:163–170,316–317,513–542` moves `wcpos-write-leader:${databaseName}` and outcome channel with scope, closes them on disposal, emits `engine.write-leader.degraded` on unavailable lock. Critically :600–602 sets `multiInstance: isWeb ? webLocksAvailable : (options.multiInstance ?? false)`. **Changing default web adapter alone leaves engine-scope DBs multi-instance.**
- `packages/sync-engine/src/create-rxdb-sync-engine.ts:289–306,757,1134–1137`: optional ports `multiInstance`, `writePlaneOwner`, `writeOutcomeBridge`; owner defaults to `() => true`; scope DB gets `ports.multiInstance ?? false`. At :1795–1802,1919 ownership goes to write plane and maintenance; :2146–2150 handles peer drain nudges only as owner; :2371–2376 auto-mode followers publish nudges.
- `packages/sync-engine/src/write-path/write-plane.ts:154,200–214`: follower cannot coalesce enqueue; follower conflict resolution throws `WritePlaneFollowerError`; follower tick is a no-op `{lane:'write-drain',status:'ran',pushed:0}`. `maintenance/maintenance-lanes.ts:783,813,848` gates product/customer trickle and variation prefetch.
- `packages/sync-engine/src/write-path/write-outcome-bridge.ts:8–51,59–86,157–164`: channel `wcpos-write-outcomes:${databaseName}` carries outcomes/nudges, because follower enqueues but only leader drains (#1209). Without delivery, refused-delete fallback, void feedback and divergence handling miss terminal results. Receiver fans out without re-entering side-effecting funnel (`create-rxdb-sync-engine.ts:1386–1391`), avoiding duplicate resolution/echo.
- `write-drain-lane.ts:449–463,699–712` removes resident for never-pushed create→delete and emits `write-annihilated` for every cancelled mutation, settling follower waiters (#1059). **Keep annihilation/terminal outcomes:** they are not exclusively a web transport feature.
- **Inferred:** sole live owner can use engine's existing default-owner behavior; parked tab must never create DBs/engine. Host's old lease/bridge can be retired, but generic follower engine support is not automatically dead code and need not be removed in this PR.

### Repair ownership lifecycle and deletion boundary

`packages/database/src/plugins/repair-ownership.ts:14–40` creates one random page-scoped `wcpos.repair-ownership:<UUID-or-random>` channel and singleton plugin, tracks per-DB sets of RxDatabase owners, renews every second. :59 skips single-instance DBs; :77–95 revokes only closing instance ownership and waits for ack up to `REVOCATION_ACK_TIMEOUT_MS = 10_000` (:8). Registration: `adapters/default/index.web.ts:4–7,15–16`; worker name: `adapters/storage/index.web.ts:3,53`.

`scripts/opfs-worker-entry.mjs:4–14` passes `self.name` to `scripts/opfs-repair-ownership.mjs`; the latter :1–3,18–66 gives a 3s lease, drains tracked queues on revoke, reports 2s drain timeout without falsely acking, and permits repair when `!params.multiInstance || (owned && leaseFresh)`.

**Inferred:** deleting only the page publisher while OPFS/multiInstance true remains makes ownership false and denies gated repairs; leaving imports breaks build. Deleting the full page/worker repair channel together with old engine is appropriate, but does not itself provide new storage ownership.

Exact page tests in `packages/database/src/plugins/repair-ownership.test.ts`: :74 **`one tab name and plugin object are reused for repeated registration`**; :83 **`single-instance databases publish nothing`**; :94 **`leadership publishes the full set; hello replays it to late workers; pre-close revokes`**; :116 **`leadership resolving after pre-close never re-adds the database`**; :127 parameterized **`leadership throw/reject is logged and never escapes the hook`**; :143 **`plugin is inert without BroadcastChannel`**; :155 **`closing a duplicate preserves the surviving leader until it too closes`**; :170 **`pre-close waits for its own revocation ack, not an earlier publication`**; :191 **`the ack timeout outlasts the worker drain`**; :201 **`pre-close resolves at an ack arriving after 3 seconds, not the old timeout`**; :223 **`a dead worker bounds pre-close waiting to 10 seconds`**; :243–244 parameterized **`a drain timeout is logged but close waits for the ack/deadline`**; :274 **`renews live ownership until the last leader closes`**. Slash notation here expands the two separate parameterized case titles.

### Every E2E `newPage()` match and what it means

| File / exact test | Observed assertion and topology |
|---|---|
| `apps/main/e2e/two-tab-changelog-identity.spec.ts:116–189`, **`rogue positional deletes leave the follower catalogue intact and the survivor can still write`** | The actual simultaneous same-context, same-store POS pair (:121–128). Reads `rxdb-...-products-N/index-N.txt`, derives old task-queue channel (:80–109), publishes rogue positional deletes, checks catalogue/search/count (:135–173), closes A, writes from B, reloads and checks catalogue/errors (:175–188). Parked B invalidates this scenario. Its own :24–29 warns it also passed pre-patch due to cache masking: not proof of index safety. |
| `apps/main/e2e/session-recovery.live.spec.ts:45–101`, **`a pointer to a missing site row returns to the store list with AUTH131, not a red banner`** | Closes live page (:61), opens JS-blocked export page (:32–39), drops `/wcposusers_v\d+-sites(-|_)/` snapshot entries (:30,63–75), then recovery page (:76); asserts AUTH131/connect UI/no POS or boundary, then reload clears AUTH131 (:85–100). Not two live storage owners; filesystem-layout-dependent. |
| `apps/main/e2e/ghost-prune.live.spec.ts:317,361`, **`mint a frozen profile holding a real ghost`**; **`A/B: ghost residency after manual passes on the served bundle`** | Export page at :284 only after live app closes (:346,391). Parses `-products-0/documents.json` and `existenceManifest-0/documents.json` (:157,168); frozen resident/manifest/server assertions (:350–352), restores and checks pruning after three sync passes (:380–397). Not concurrent POS tabs; format-dependent. |
| `apps/main/e2e/fixtures.ts:711` | OAuth popup/page navigates `authUrl`; not a second POS store tab. |
| `apps/main/e2e/global-setup.ts:183,309,357–367` | Fresh-context validation/authentication pages; closes auth page before JS-blocked OPFS export page. Not concurrent live same-store storage. |

`idle-backfill.live.spec.ts:37` and `server-created-visibility.spec.ts:64` merely mention OPFS in comments; those matches alone do not establish old filesystem assertions.

## 4. Targeted recovery: what dies on web, what must remain for native

| File / graph | Observed consumers and platform | PR3 disposition |
|---|---|---|
| `packages/database/src/plugins/opfs-targeted-recovery.mjs:567–585` and `.d.mts:1` | Native `adapters/storage/index.ts:3,9–13` wraps `getRxStorageExpoAsync`; native `adapters/default/index.ts:3,10` consumes it. Default ownership is `!params.multiInstance`. | **STAY**, including declaration. Electron renderer no longer imports it; new SQLite web worker will not. |
| `scripts/opfs-targeted-recovery.mjs` | Old worker import at `opfs-worker-entry.mjs:5`; also Node/shared abstract-filesystem regression harnesses. Source mirror of native module. | **STAY**, not web-only. |
| `scripts/opfs-recovery-database-sync.test.mjs:5–16` | **`database recovery module matches the source script byte-for-byte`** reads both mirrors. | **STAY** while native copy exists. |
| `scripts/opfs-targeted-recovery.test.mjs`, `opfs-targeted-recovery.cleanup.test.mjs`, `opfs-targeted-recovery.bench.mjs:3–5,23` | Tests/benchmark shared abstract filesystem, using Node storage, not actual app web adapter. `scripts/rxdb-premium-changelog-identity.test.mjs:26,552,648,767` also imports/exercises recovery source. | **STAY** for native; constant flip does not make synthetic multi-instance cases fail. |
| `packages/query/src/logs-storage-recovery.ts:27–39,46–114` | Shared `use-local-query.ts:12,41–51`, `engine-query.ts:42,426–433`; export `index.ts:55`. No platform guard. SyntaxError classifier accepts `requestRemote`, `opfs.worker`, **or `JSON.parse`**; native still qualifies. | **STAY**, with `packages/query/tests/logs-recovery.test.ts`. |
| `packages/sync-engine/src/local-coverage/ledger-storage-recovery.ts:7–15,122–169,296` | No import of OPFS wrapper (only comment at :296); classifies refusal strings plus general `COL21` reattachment. All consumers are platform-shared. | **STAY**, including `ledger-storage-recovery.test.ts`; native still uses refusal recovery and other engines can encounter closed collections. |
| `packages/database/src/plugins/repair-ownership.ts` / `.test.ts`; `scripts/opfs-repair-ownership.mjs` / `.test.mjs` | Web-only channel described in §3. Sole worker production importer `opfs-worker-entry.mjs:4`. Native's single-instance recovery does not need it. | **Can delete together**, after old imports/registration/worker name are removed. |
| `scripts/opfs-worker-entry.mjs`, `build-opfs-worker.mjs`, `patch-opfs-worker.mjs`, `patch-opfs-worker.test.mjs`, `apps/main/public/opfs.worker.js` | Old worker graph/artifact/build and complete-write shim. | **Can replace/delete** with SQLite artifact pipeline and corrected bootstraps. No evidence this shim is needed by SQLite's different VFS implementation. |

Shared recovery details:
- Query `recoverLogsCollectionStorage` removes only logs, guarded once per session, then reload callback (`logs-storage-recovery.ts:62–83`); `recoverEngineCollectionStorage` resets scope/collection, claims guard before drop, rolls it back on reset error (:86–114). Missing browser sessionStorage/reload is tolerated (:27–39); that does not make native collection-removal/reset unreachable.
- Ledger `local-coverage.ts:28,308–339` registers rebuild of five derivable collections or reattachment without dropping; emits `coverage.ledger-rebuilt` / `coverage.ledger-reattached`. Shared consumers under `packages/sync-engine/src/`: `create-rxdb-sync-engine.ts:122`, `require-plane.ts:87`, `maintenance/maintenance-lanes.ts:59`, `scheduler/engine-scheduler-drain.ts:15`, `rx-scheduler-task-runner.ts:1`, `rx-order-scheduler-task-seeder.ts:11`, `rx-refund-scheduler-task-seeder.ts:3`, `rx-browse-window-lane-seeder.ts:33`, `rx-pos-bootstrap-seeder.ts:42`, `rx-targeted-lane-seeder.ts:31` (last six under `scheduler/`).
- Native pin `packages/database/src/adapters/storage/index.native.test.ts:55–69`: **`wraps the async Expo filesystem storage with targeted recovery`**. Shared wrapper mocks at `adapters/default/error-handler-wrapping.test.ts:10–11` and `storage-timing-probe-wiring.test.ts:25–26` must remain coherent.
- Representative retained tests: `scripts/opfs-targeted-recovery.test.mjs:564` **`repairs one malformed record without removing its collection siblings`**; :999 **`rebuilds a secondary index whose rows point at stale byte ranges`**; :2414 **`repairs a malformed tombstone when the cleanup retry still fails`**; :2604 **`boots through a crash-damaged changes file instead of failing every run`**.
- Query tests: `packages/query/tests/logs-recovery.test.ts:36` **`detects OPFS/RxDB JSON parse corruption errors from requestRemote`**; :50 **`removes only the logs collection and reloads once`**; :120 **`resets one corrupted server-backed collection per scope and reloads once`**; :229 **`does not reset a collection after the active store changes`**.
- Ledger tests use memory storage (`ledger-storage-recovery.test.ts:5,169–177`); OPFS URL at :83 is a classifier fixture. Exact cases: :107 **`routes closed collections to re-attach and corruption refusals to rebuild`**; :137 **`classifies the worker-wrapped targeted multi-instance refusal`**; :615 **`rebuilds the whole ledger once, refreshes the repository, observes it, and retries once`**; :691 **`rebuilds once for a worker-wrapped targeted refusal and retries with a refreshed repository`**; :738 **`rebuilds all five stores from a query-total refusal, retries once, and surfaces a second refusal`**.
- Worker ownership tests removable with channel: `scripts/opfs-repair-ownership.test.mjs:31` **`worker greets its tab, replaces ownership by database, and closes the channel`**; :203 **`a wedged queue reports a drain timeout without acknowledging revocation`**. Page test :194 also reads worker ownership source, so delete/retarget together.

**ESLint correction:** no literal `opfs.worker` appears in `packages/eslint/index.js`. Actual :389–393 globally ignores `**/opfs-targeted-recovery*.mjs` for mirror identity; **retain**. Node-globals override :399–416 excludes `**/opfs-worker-entry.mjs` and targeted-recovery files at :405. **Inferred change:** move/add browser-worker exclusion for SQLite entry and any browser `.mjs` adapter files, so Node globals such as Buffer/process are not silently accepted in their graph. Do not delete native recovery exclusions.

## 5. Degraded storage and the money-path guard

All wrapper line numbers below refer to `packages/database/src/plugins/wrapped-error-handler-storage.ts`.

- **Detected today:** worker/port disconnection text in `could not requestRemote: ...` envelopes or `StorageWorkerTimeoutError` (:61–77,404–426); deliberate close/remove/closing states excluded. Three consecutive remote `NotFoundError` writes also latch degradation (:874–886).
- **Hang window:** `STORAGE_RPC_WATCHDOG_MS = 30_000` and two silent windows (:100–138). Watches `query`, `count`, `findDocumentsById`, `getAttachmentData`, `getChangedDocumentsSince`; additionally races `createStorageInstance` before an instance exists (:983–1001). Nominal condemnation is 60s of total silence, **not an absolute wall-clock deadline**: any non-worker-failure response advances module-global completions (:155–163), and delayed environment timer >2×window re-arms (:463–518).
- **Separate diagnostic:** `STORAGE_RPC_STALL_REPORT_MS = 60_000` (:172,198–218) reports `LOCAL_DB_STALLED` with method, DB, collection, elapsed time and `workerAnsweredMeanwhile`; it never rejects/cancels. Detects per-collection stall while other traffic keeps watchdog alive.
- Reads are raced against watchdog (:733–800). `bulkWrite`, close/remove/cleanup are not clock-rejected. `STORAGE_WRITE_DEADLINE_MS = 10_000` and `noteStorageWriteDeadlinePassed` (:249,323–349) signal a live pending bulkWrite without rejecting/retrying it.
- Emission: `StorageDegradation { databaseName, kind: 'worker-lost' | 'write-stalled', methodName, message, at }`, `degradedStorage$` BehaviorSubject-backed observable (:237–270). Private `latchDegradedStorage` emits once per DB plus `LOCAL_DB_UNAVAILABLE` (:429–452). Successful call on any DB clears write-stalled (:775–789), not worker-lost; latter requires reload (explicit test reset is :281–303).

Consumers:
- `packages/core/src/screens/main/hooks/use-storage-health.ts:60–104`: `useStorageDegraded()` subscribes; `useStorageMoneyPathGuard()` supplies disabled rendering **and synchronous action-time** `isStorageDegraded()` check/log/toast.
- `packages/core/src/screens/main/pos/products/storage-outage-banner.tsx:24–65`: banner with reload and database-health actions; mounted `products/index.tsx:391`.
- `packages/core/src/screens/main/pos/cart/buttons/pay.tsx:46,53–58,124–132,187`: guard before save, after awaited push/save, disabled Pay. `checkout/hooks/use-checkout-save.ts:50–60` arms 10s flag around awaited enqueue.
- Other capture checks under `packages/core/src/screens/main/pos/`: `checkout/hooks/use-checkout-session.ts:181,250`, `checkout/tender/use-tender-flow.ts:550,569`, `checkout/checkout.tsx:148`; degraded displays `checkout/column/checkout-column.tsx:108`, `checkout/tender/tender-checkout.tsx:199`, `checkout/checkout.tsx:197,296`.
- Other guarded actions: `cart/buttons/save-order.tsx:35,89`, `cart/buttons/void.tsx:111,226`, `cart/buttons/edit-order-meta/form.tsx:145`, and `packages/core/src/screens/main/orders/cells/actions.tsx:108,126,142,152`. Refund/edit guards also appear in `packages/core/src/screens/main/orders/refund/form.tsx:122`, `orders/refund/use-refund-mutation.ts:91`, and `orders/edit/form.tsx:74` (latter two relative to `packages/core/src/screens/main/`).

**Integration gap, not an existing hook:** `noteStorageWorkerFailure`, `latchDegradedStorage`, `createWatchdog` are private; there is no adapter Worker-event reporter or on-condemn callback, and no worker termination. `markStorageTerminallyFailed(databaseName, reason)` (:812–834) is a **different disposal latch**: marks existing instances and rejects in-flight calls (close resolves), but neither emits `degradedStorage$` nor terminates. Existing caller `apps/main/lib/create-app-engine.ts:280–298` is a disposal deadline.

**Inferred minimal direction:** adapter constructs/owns Worker through factory (§2), listens to error/messageerror, and reports into existing worker-lost signal through a small explicit API; watchdog condemnation calls adapter termination. Cover pre-instance errors as well as active DBs. Raw Worker events do not automatically satisfy remote-envelope classifier. A page reload/termination must not be described as proof an in-flight write did not commit; preserve unknown-outcome handling rather than blind retries.

Policy: `packages/database/src/plugins/STORAGE-CALL-DEADLINE-POLICY.md:9–43` states deadline informs/not cancels; read condemnation plus create exception; writes only signalled/awaited; unknown outcome resolved by reading back; persistent adapters retain wrapper, ephemeral is exception. `adapters/default/error-handler-wrapping.test.ts:17–47`, **`exports the real error handler rather than the raw platform storage`**, pins all three adapters to one wrapper invocation and exported wrapped identity, not every policy paragraph. Web wrapper remains required at `adapters/default/index.web.ts:18–23`.

Retain `plugins/wrapped-error-handler-storage.test.ts`: :865 **`marks a pending bulkWrite degraded, then clears when storage answers`**; :1239 **`trips the latch when an RPC never comes back`**; :1274 **`does not condemn a slow read while the worker keeps answering other traffic`**; :1360 **`never condemns a write on the clock`**; :1423 **`re-arms when the environment stalls through the deadline`**; :1448 **`condemns a worker that never answers database creation`** (all paths under `packages/database/src/`).

## 6. Where a parked-tab screen belongs

### Actual boot sequence

1. `apps/main/app/_layout.tsx:134–160`: `RootLayout` selects merchant/gallery; `MerchantRootLayout` first calls `useClearLocalDataOnStartup`, returns null while clearing or `ClearLocalDataBlockedScreen` when blocked, otherwise root `ErrorBoundary` → providers → `HydrationProviders`.
2. `packages/core/src/contexts/hydration-providers.tsx:19–43`: splash progress / suspense with `Splash`, then `AppStateProvider`, error boundary, theme, translations, Novu.
3. `packages/core/src/contexts/app-state/index.tsx:105–113` calls `useHydrationSuspense`; `use-hydration-suspense.ts:24–55,111–117` caches/starts a global sequential hydration promise (same directory).
4. **First persistent DB is USER, not engine scope.** `packages/core/src/contexts/app-state/hydration-steps.ts:849–859,1157–1162` calls `createUserDB()` before initial props/auth/session processing. `packages/database/src/create-db.ts:23–36` creates RxDB from `defaultConfig` and user collections.
5. Session lookup from user DB then calls `createStoreDB(store.localID)` (`hydration-steps.ts:735–761,1126–1150`); `create-db.ts:54–64` opens store DB/collections.
6. Root stack checks full `hasStoreSession` (`apps/main/app/_layout.tsx:103–114`); authenticated `apps/main/app/(app)/_layout.tsx:145–177` constructs `createAppSyncEngine` during render; host `apps/main/lib/create-app-engine.ts:561–605` supplies storage/flags.

**Inferred earliest safe placement:** web ownership gate outside/before `MerchantRootLayout`, before **both** startup clearing and hydration. A gate in `create-app-engine.ts` is too late. A gate only around `HydrationProviders` still permits parked tab's scheduled clear (`apps/main/components/clear-local-data-on-startup.tsx:24–34,59–86`) to call `clearAllDB()`/reload against the holder's storage. Additionally, module imports must not eagerly construct a `mode:'one'` worker before that gate (§2); today's default adapter allocates storage at module evaluation.

**Identity constraint to resolve in implementation:** user DB/pool is shared before store identity is hydrated. The old per-scope write lock cannot by itself protect one shared origin pool. The stated one-live-tab-per-store policy and actual shared pool/user-DB ownership must be reconciled explicitly; this report does not silently choose a new topology.

### Existing adjacent states and translation constraints

- `Splash`, `packages/core/src/screens/splash/index.tsx:14–44`, used by hydration suspense.
- `RootError`, `apps/main/components/root-error.tsx:113–132`, mounted at root :156, deliberately usable before DB/theme/translation providers.
- `ClearLocalDataBlockedScreen`, `apps/main/components/clear-local-data-on-startup.tsx:103–163`, similarly independent of theme/translations, blocks hydration until reset completes.
- `UpdateRequiredGate` / `CompatGate`, `apps/main/app/(app)/_layout.tsx:275–302`, return `UpdateRequired` / `UpgradeRequired` from `packages/core/src/screens/main/update-required.tsx:31–52` / `packages/core/src/screens/main/upgrade-required.tsx:13–28`. They sit **below** engine/QueryProvider (:209–257), so are presentation precedents, not safe ownership-gate locations.
- No dedicated `StoreClosed`, `store_closed`, or “store closed” full-screen component was found in searched `apps/main` / `packages` source.
- `packages/core/src/contexts/translations/index.tsx:3–10,20–48,58–60,110–116`: **i18next/react-i18next**, `useT()` returns `t`; call `t('namespace.key')`, not Tolgee/template tags. Bundled English lives at `packages/core/src/contexts/translations/locales/en/core.json`, `core` namespace, English fallback, literal dotted keys (`keySeparator:false`, `nsSeparator:false`), `{placeholder}` interpolation.
- Other language resources use CDN/RxDB backend (`translations/rxdb-backend.ts:9–29,57–67`). Existing `TranslationProvider` calls `useAppState()` for `translationsState`, so **cannot simply be moved above DB hydration** to translate parked screen. New strings still belong in English catalogue/translation pipeline, but pre-DB rendering needs DB-independent translation access. `.claude/rules/project.mdc` Translations section requires keys only (no inline English/defaultValue), and stable testIDs.

### Design hard rules — ten lines (`.claude/rules/design.mdc:26–121`)

1. One leading figure and primary action; secondary complexity stays reachable, not visually competing.
2. Tap targets ≥44 pt (48 preferred), frequent tablet targets ≥56; gaps ≥8; pressed response within 100 ms.
3. Separate destructive actions from constructive ones; no hover-only affordances.
4. Apple navigation/modality grammar, system fonts/tabular amounts; readable physical sizes (14px web/16px native base).
5. Fixed equal-width grid and stable order, adaptive phone/tablet columns; no label-driven wrapping.
6. One visible state badge; trouble state one line/actions/docs link; never colour alone.
7. Meaningful interruptible 150–250 ms motion, no >400 ms wait-path animation; reduce-motion; no decorative emoji/confetti.
8. Semantic tokens/one accent/red destructive only, 4.5:1 text and 3:1 UI contrast, light/dark first-class, flat surfaces.
9. Plain translated cashier words and verb/object actions, long-text/plural survival; no explanatory paragraphs.
10. Inspect real screen/states; tablet/phone screenshots, verified targets/contrast and stable testIDs; no new layout effects.

### Web Locks / BroadcastChannel inventory

Maintained production source in requested trees (excluding generated vendor worker):
- `apps/main/lib/web-write-leader.ts:14–64`: exclusive lifetime Web Lock. `create-app-engine.ts:438–439,600` probes availability; :163–166,534–537 uses `wcpos-write-leader:${databaseName}`.
- `packages/database/src/plugins/repair-ownership.ts:14–45`: page-scoped `wcpos.repair-ownership:<random>` BroadcastChannel, ownership/ack messages.
- `packages/sync-engine/src/write-path/write-outcome-bridge.ts:83–86,157–164`: `wcpos-write-outcomes:${databaseName}` BroadcastChannel.
- Old generated `apps/main/public/opfs.worker.js:53–55` embeds premium locks/channels; worker-side app protocol lives outside requested trees in `scripts/opfs-repair-ownership.mjs` (§3).
- Test uses/mocks: `apps/main/lib/web-write-leader.test.ts`, `create-app-engine.test.ts`; `packages/database/src/plugins/repair-ownership.test.ts`; `packages/sync-engine/src/write-path/write-outcome-bridge.test.ts`, `create-rxdb-sync-engine.write-outcome-bridge.test.ts`; `packages/query/tests/await-write-outcome.multitab.test.ts`; `packages/sync-core/src/recordMutationQueue.web-multitab.test.ts`; `apps/main/e2e/two-tab-changelog-identity.spec.ts:80–109,135–173` deliberately publishes to premium channel. These do not constitute an existing cooperative parked-tab protocol.

## 7. Clear data, measurement, purge, and pool directory

| Source | Current enumeration / effect |
|---|---|
| `packages/database/src/clear-all-db.web.ts:13–23,28–47,53–68,77–92` | IndexedDB known app prefixes/contained scope names; OPFS **root entries** matching `rxdb-` plus slash-safe app prefix (`/`→`__`) or contained scope name, recursively removed; image cache separately cleared. |
| `packages/database/src/measure-storage.web.ts:18–28,35–76` | Browser quota estimate plus recursive file sizes for every root directory starting `rxdb-` (not just known app prefixes); skip per-directory failures; cache measured separately. A differently named pool is ignored by detailed OPFS enumeration, even if quota estimate includes its bytes. |
| `packages/database/src/purge-legacy-db.web.ts:9–15,17–54,57–72` | Legacy IndexedDB names; OPFS only `rxdb-*`, strip prefix/decode `__`→`/`, apply `isLegacyAppDatabaseName`, recursively remove. Host schedules once after `engine.ready`; rejected opens skip purge (`apps/main/lib/create-app-engine.ts:608–624`). |
| `packages/database/src/database-generation.ts:1`, `database-names.ts:9–34` | Web/default generation **v7**; `['v6','v7'].filter(not current)` gives engine-era legacy **['v6']** on web, plus historical user/store/fast-store families. Native override `database-generation.native.ts:1` is v8; do not propagate web assumptions there. |
| `packages/sync-core/src/storeScopeIdentity.ts:43–55,138–168` | Separate scope generation **5**, grammar `pos_v<generation>_<12 lowercase hex>_s<store>_c<cashier>`; lower scope generations are legacy. Not the same counter as v7. |

Filesystem-root examples described by these filters: `rxdb-wcposusers_v6-sites-0`, `rxdb-store_v6_<id>-logs-0`, `rxdb-pos_v<generation>_<hash>_s<store>_c<cashier>-orders-0`. Classifiers match derived collection/index roots, not a single physical SQLite pool directory.

**Local pool evidence limit:** `node_modules/@sqlite.org/sqlite-wasm` is **not installed**, and spike `.rxdb-src` / `.deps` are absent (§8). Therefore exact default pool directory naming and `.opaque` representation cannot be confirmed from installed source here. Do not present the brief's “`.opaque` mapping” description as observed. What is observed: `spikes/2138-rxdb-sqlite-wasm/sqlite-worker-entry.mjs:6–19` installs `{name:'spike-2138',initialCapacity:64}`, opens `new pool.OpfsSAHPoolDb('/'+name)`, uses WAL. No production pool name has been chosen in current web adapter.

**Inferred migration implication:** clear/measure need to recognize the actual chosen pool root; do not try to classify opaque members using logical database names. Legacy v6 `rxdb-*` cleanup remains necessary. Purge needs an explicit current-versus-retired pool-directory concept if it is to manage retired SQLite pools; it must not classify/delete the current pool as a legacy individual database. Detailed footprint UI also assumes `rxdb-<db>-<collection>-<version>` (`packages/core/src/screens/main/health/storage-footprint-logic.ts:65–78,111–161`); unrecognized entries become `unknownBytes`, not per-collection allocation.

Tests read, not run:
- `packages/database/src/database-names.test.ts:17–35`: **`returns the current database names`**, **`exposes the exact legacy database generations`**; :38–68 **`classifies %s as legacy`** / **`does not classify %s as legacy`**; :71–135 **`matches store and fast-store database names from every generation`**, **`keeps clear-all coverage for every database generation`**, scope grammar parameter cases, **`keeps known app names distinct from unrelated databases`**, **`classifies scope databases for both web storage filters`**. Existing legacy expectations should remain relevant.
- `packages/database/src/purge-legacy-db.web.test.ts:56–73`: **`deletes only legacy IndexedDB and OPFS entries`**, six deletions (three each), preserves current/unrelated entries. No pool fixtures.
- `packages/database/src/clear-all-db.web.test.ts:16–57`: **`deletes every cached image during local-data reset`**, **`does not fail when the Cache API is unavailable`**, **`does not fail when opening the image cache throws`**. Empty navigator storage mock at :26–29 means these do **not** prove OPFS directory deletion.
- No direct `measure-storage.web.test.*` found. `packages/core/src/screens/main/health/storage-footprint-logic.test.ts:21–126` covers extraction, active data/search/bookkeeping, other scopes, legacy/unknown bytes; `use-storage-footprint.test.tsx:69,91,114` covers identity, measured headline/unattributed bytes, hiding prior scope's footprint, with measurement mocked.

## 8. Dependencies and wasm/public delivery

- **Observed:** no `@sqlite.org/sqlite-wasm` entry in `pnpm-lock.yaml`; no package at root node_modules or spike dependency directories. Nothing was installed.
- Spike version **3.53.4-build1** is recorded at `spikes/2138-rxdb-sqlite-wasm/RESULTS.md:3–7`. `run-conformance.sh:7–10,26–38` clones RxDB into `.rxdb-src`, installs there with npm, then `npm i --no-save @sqlite.org/sqlite-wasm@3.53.4-build1 esbuild` and copies premium from root. **Not a spike package.json/.deps install.** At :44–51 it bundles ESM/browser worker and copies package `dist/sqlite3.wasm` alongside under clone's `docs-src/static/files/spike-2138/`.
- Requested pnpm store `~/Library/pnpm/store/v11/index/` does not exist here; actual index is `index.db`, table `package_index(key TEXT PRIMARY KEY,data BLOB)`. Read-only queries found **0 keys matching `%sqlite-wasm%` and 0 data blobs containing `sqlite-wasm`**. No indexed cached package/tarball observed; orphan content-addressed files were not exhaustively examined.
- Current worker uses root esbuild (`scripts/build-opfs-worker.mjs:5,13–25`), declared **0.28.2** at `package.json:46–48`; lockfile :61–63 and installed metadata agree. These are observed pins, not recommendations for latest versions.

**Expo/Metro, source-level serving evidence:**
- `apps/main/metro.config.js:14–20` uses Sentry Expo config and includes `wasm` asset extension for barcode decoder.
- `node_modules/@expo/cli/build/src/utils/env.js:121–122` defaults `EXPO_PUBLIC_FOLDER` to `public`; `export/publicFolder.js:50–56,71–76` resolves under project and copies public files unchanged on export (same `build/src/` prefix).
- `node_modules/@expo/cli/build/src/start/server/metro/MetroBundlerDevServer.js:1021–1023` installs static middleware; `start/server/middleware/ServeStaticMiddleware.js:37–71` handles GET/HEAD via `send(req,pathname,{root:publicPath})`, piping bytes directly.
- `node_modules/send/index.js:827–839` looks up MIME by path; installed `send.mime.lookup('foo.wasm')` returned **`application/wasm`** in a read-only metadata lookup. **Inferred:** a `.wasm` placed under public will be served as-is with that MIME in this Expo dev-server path. **Unverified:** actual HTTP response, production CDN/WordPress headers and worker-relative wasm URL behavior.
- Separate local bundle server `apps/web/scripts/dev-server.js:12–29` has **no `.wasm` MIME entry**, falling back to `application/octet-stream`; do not conflate it with Metro.
- `git ls-files '*.wasm'` found **no tracked wasm files**; `apps/main/public` has none. Installed dependencies do contain `packages/core/node_modules/zxing-wasm/dist/{reader/zxing_reader,full/zxing_full,writer/zxing_writer}.wasm`. Existing `packages/core/src/screens/main/pos/products/camera-decoder.web.ts:26,47–51` imports reader wasm as a Metro static asset. Thus “no existing wasm anywhere” would be false.

## 9. Test impact inventory — no tests run

**Read literally:** flipping only `WEB_STORAGE_ENGINE` plus default adapter flag is different from implementing ownership, changing host flags, and deleting the old worker. The former leaves unsafe/incomplete paths; several tests still pass because they mock storage or test generic primitives. The list below distinguishes deterministic assertion conflicts from files to retain or retire with deleted code.

### Inferred red with the corresponding migration change

| Test file | Exact pin / reason |
|---|---|
| `packages/database/src/adapters/storage/index.web.test.ts:19–36` | **`exposes only the OPFS worker path`**, **`creates the storage client with the OPFS worker`**: literal `/opfs.worker.js` and repair-channel name. Engine flip alone conflicts. |
| `apps/main/lib/storage-worker-bootstrap.test.ts:38–60` | **`%s sets window.opfsWorker to the engine’s worker`**, **`no bootstrap file names a worker belonging to a different engine`**: goes red if either old bootstrap remains after engine flip. |
| `packages/database/src/adapters/default/multi-instance-ruling.test.ts:48–53` | **`web matches what its CURRENT engine requires`**: red only for half-migration; passes by design when engine/flag move together. Preserve two-era assertions at :66–69. |
| `apps/main/lib/create-app-engine.test.ts:1875–1893` | **`enables multi-instance and threads elected ownership on web`** pins true and old write lock. Red once engine-scope flags/ownership are actually migrated, not from default-adapter flag alone. |
| Same host file :1262,1896,1918,1958 | **`construction publishes the allocation scope’s header and elects leadership once`**; **`moves the web leadership lock when the cached engine switches scope`**; **`opens the write-outcome channel for the scope and moves it on a switch (#1209)`**; **`keeps single-instance behavior and emits diagnostics when Web Locks are unavailable`** assume old lease/bridge/fallback. Retarget if removing this host plumbing. :1946 **`opens no write-outcome channel off the web (#1209)`** still protects non-web behavior. |
| `apps/main/lib/web-write-leader.test.ts:31,53,64` | **`has exactly one leader and transfers ownership after release`**; **`degrades to single-writer when Web Locks are absent (never a stuck follower)`**; **`degrades to single-writer when the lock request REJECTS (restricted context)`**. Import fails if module deleted; old fallback is not proof that a second pool owner is safe. |
| `packages/database/src/plugins/repair-ownership.test.ts:74–274` | Old leader/channel/ack cases enumerated in §3; deleting module or worker companion while retaining tests fails imports/source reads. |
| `scripts/opfs-repair-ownership.test.mjs:31–203` | Old worker channel/lease/drain protocol; remove with old worker ownership rather than repurpose as new takeover evidence. |
| `scripts/patch-opfs-worker.test.mjs:15–169` | Complete-write shim cases and three exact shipped OPFS marker tests (§1); deletion of shim/artifact invalidates them. |
| `apps/main/e2e/two-tab-changelog-identity.spec.ts:116–189` | **`rogue positional deletes leave the follower catalogue intact and the survivor can still write`** cannot reach follower catalogue when parked; also tied to old index files/channel. |
| `apps/main/e2e/session-recovery.live.spec.ts:45–101` | **`a pointer to a missing site row returns to the store list with AUTH131, not a red banner`** selects old sites directory, not SQLite rows/pool files. |
| `apps/main/e2e/ghost-prune.live.spec.ts:317,361` | **`mint a frozen profile holding a real ghost`** and **`A/B: ghost residency after manual passes on the served bundle`** parse filesystem documents.json, not SQLite. |

### Old topology/worker references that do NOT automatically go red

- `apps/web/tests/sync-build-artifacts.test.js:30` (**`preserves legacy indexeddb worker while updating opfs worker from fresh export`**) and `scripts/ci-plan.test.mjs:314` (**`script sub-paths classify conservatively`**) use synthetic paths. They can stay green with obsolete names after migration; retarget fixtures to new artifacts/routing, do not cite them as integration proof.
- `packages/database/src/adapters/default/error-handler-wrapping.test.ts:39` and `storage-timing-probe-wiring.test.ts:65,77` are safety/wiring contracts to preserve, not obsolete OPFS tests (§1). A new eager Worker factory can require mock updates, but engine flip itself does not invalidate assertions.
- `packages/sync-engine/src/create-rxdb-sync-engine.leader-gate.test.ts:53,65,88,113,172`: **`defers conflict resolution on a follower with a typed error`**; **`reports a no-op write-drain tick without pushing on a follower`**; **`appends fresh mutations instead of coalescing follower writes`**; **`annihilates a follower create+void at the leader drain — no phantom server order (#1059)`**; **`keeps the existing coalescing behavior for the default leader`**. Explicit owner doubles; retain generic contracts unless deliberately removing that feature.
- `packages/sync-engine/src/create-rxdb-sync-engine.write-outcome-bridge.test.ts:130,161,186,220,248,277,328,356`: **`delivers a REFUSED delete to the follower, reason intact — #866 becomes reachable off-leader`**; **`delivers an ACK to the follower exactly once`**; **`replays a terminal outcome to a waiter that subscribes AFTER it fired`**; **`replays nothing for an unrelated mutation, and never a non-terminal event`**; **`composes with #1204: a 409 that auto-recovers reaches the follower as ONE success`**; **`tells the follower when the LEADER cancels its never-pushed create+void (#1059)`**; **`leaves the follower a reader: it never drains, resolves, or touches the transport`**; **`stops delivering to a disposed engine`**. These inject generic bridge ports rather than load app web adapter.
- `packages/sync-engine/src/create-rxdb-sync-engine.write-path.test.ts:397,430`: **`a follower enqueue forwards the drain nudge to the elected leader`**, **`a manual-mode follower enqueue does not forward a drain nudge`**. `write-path/write-plane.test.ts:121`: **`returns the exact no-op drain report for a follower`**. `write-path/write-outcome-bridge.test.ts:51–256` tests channel transport/envelope/nudges. All under `packages/sync-engine/src/`, still independent of app engine selector.
- `packages/sync-engine/src/create-rxdb-sync-engine.product-trickle.test.ts:252`, `.customer-trickle.test.ts:271`, `.variation-prefetch.test.ts:298`: each **`runs only while this tab owns the shared write plane`**. Explicit owner toggles remain valid generic maintenance tests.
- `packages/query/tests/await-write-outcome.multitab.test.ts:77,108,127,145`: **`settles with the leader refusal, so the #866 pending fallback runs off-leader`**; **`settles success for the leader ack`**; **`settles success-local when the leader cancels a never-pushed chain`**; **`ignores another mutation entirely`**. Mocked bridge scenarios, not new actual-web takeover coverage.
- `packages/sync-core/src/recordMutationQueue.web-multitab.test.ts:151,169,190`: **`reproduces the incoherence: BOTH tabs claim the same dead letter`**; **`with a single write-plane leader, exactly one resolution executes`**; **`after leader death, the promoted follower completes the resolution`**. Demonstrates primitive failure/control, not evidence two app tabs remain supported.
- Shared legacy-engine regression files remain for native: `scripts/opfs-targeted-recovery.test.mjs`, `scripts/opfs-targeted-recovery.cleanup.test.mjs`, `scripts/opfs-recovery-database-sync.test.mjs`, `scripts/patch-rxdb-premium-resurrection-leak.test.mjs`, `scripts/rxdb-premium-task-queue-containment.test.mjs`, `scripts/rxdb-premium-changelog-replay-safety.test.mjs`, `scripts/rxdb-premium-cleanup-compaction-batch.test.mjs`, `scripts/rxdb-premium-changes-file-salvage.test.mjs`, `scripts/rxdb-premium-changelog-identity.test.mjs`. Their explicit filesystem/multi-instance fixtures do not read `WEB_STORAGE_ENGINE`; retain with corresponding patchers (§2).
- `packages/query/tests/logs-recovery.test.ts`, `packages/sync-engine/src/local-coverage/ledger-storage-recovery.test.ts`, `packages/database/src/adapters/storage/index.native.test.ts` retain native/shared recovery obligations (§4), even when fixture stack says `opfs.worker`.
- `packages/sync-engine/src/resurrection-index-leak.test.ts:87` and `maintenance/purge-misfiled-variation-products.test.ts:21–37` contain multi-instance configuration but do not establish literal web-flag expectations. A match for `multiInstance:true` is not sufficient to predict migration failure.
- Naming/purge/clear and health-footprint tests listed in §7 need pool coverage/updated measurement expectations; retaining legacy names is intentional. No claim that unchanged synthetic fixtures will detect a missing pool root. Wrapper watchdog and money guards remain cross-engine requirements (§5).

## Behavior changes / regressions

- **Observed:** no application behavior changed in this investigation; only this findings document was written.
- **Planned, not executed:** concurrent live web followers are intentionally replaced with a parked/takeover screen. Old two-tab catalogue behavior and filesystem-format probes cease to describe the supported web engine; native abstract-filesystem behavior remains in scope until PR4.
- **Unverified:** production SQLite worker/wasm delivery, pool on-disk naming, takeover/close/payment coordination, crash recovery, runtime performance, HTTP MIME on deployed host, and compatibility of old versus new engine. No old/new comparative runs were made.
- **Not a test result:** historical spike evidence and source-predicted failures above are not fresh PASS/FAIL evidence. The requested investigation and source inventory are complete; implementation and runtime verification remain separate work.
