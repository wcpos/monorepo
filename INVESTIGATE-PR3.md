# Investigation for PR 3 of monorepo#2242 (web storage engine)

Read-only investigation. Write your findings to `INVESTIGATE-PR3-FINDINGS.md` in this
directory (create it; it is the only file you may create or change). Precision over prose:
file paths with line numbers, exact identifiers, exact test names. Under 700 lines.

Context: this repo is moving every target to rxdb-premium `storage-sqlite` (rxdb 17.4.0,
rxdb-premium 17.4.0). PR 1 (query layer) and PR 2 (desktop engine, generation bump, indexes,
promoted columns, the `scripts/patch-rxdb-premium-sqlite-query-translation.mjs` patcher) are
merged on this branch's base. PR 3 moves the WEB target from premium's abstract-filesystem
storage over OPFS (one worker per tab, `multiInstance: true`, RxDB leader election) to SQLite
wasm (`@sqlite.org/sqlite-wasm`, `opfs-sahpool` VFS, WAL) in ONE dedicated worker owned by ONE
live tab (`multiInstance: false`), with a second tab parked on a takeover screen. The spike that
proved the engine is `spikes/2138-rxdb-sqlite-wasm/` (read its `RESULTS.md`, `custom-storage.ts`,
`sqlite-worker-entry.mjs`, `sqlite-basics-oo1.mjs`). Read `packages/database/src/adapters/storage/storage-engines.ts`
and `packages/database/src/adapters/default/README.md` first.

Answer each numbered question with paths and line numbers.

## 1. The web storage adapter today
- Every file that participates in the web storage path: `packages/database/src/adapters/default/index.web.ts`,
  `packages/database/src/adapters/storage/index.web.ts`, the worker bundle
  (`apps/main/public/opfs.worker.js`, `scripts/opfs-worker-entry.mjs`, `scripts/build-opfs-worker.mjs`,
  `scripts/patch-opfs-worker.mjs`), the page bootstrap that sets `globalThis.opfsWorker`
  (`apps/main/app/+html.tsx`, `apps/main/public/index.html`, anything else), and every test that
  pins any of it (`multi-instance-ruling.test.ts`, `error-handler-wrapping.test.ts`,
  `storage-worker-bootstrap.test.ts`, `index.web.test.ts`, `apps/web/tests/sync-build-artifacts.test.js`, others).
- Which `package.json` scripts build the worker (`build:opfs-worker` etc.), and which CI workflow
  steps run them or check them (`.github/workflows/*.yml`, `.github/scripts/check-opfs-worker-drift.sh`,
  `scripts/ci-plan*.mjs`).
- How the published web bundle (`publish-web-bundle.yml`, `apps/web/`) carries the worker, and how
  `apps/web` rewrites `globalThis.opfsWorker` to a CDN URL. Note `apps/web` is a git submodule or
  a build dir — say which, and what is tracked.

## 2. The worker's contents and how premium's worker storage is wired
- What `scripts/opfs-worker-entry.mjs` exposes (`exposeWorkerRxStorage`), which premium plugins it
  imports, which patchers touch the built bundle, and which of the eight root-postinstall patchers
  (`package.json` `postinstall`) patch code that only the abstract-filesystem storage runs. For each
  `scripts/patch-rxdb-premium-*.mjs`, say: which premium dist files it edits, whether the code it
  edits is reachable from `storage-sqlite`/`storage-worker`, and therefore whether the web PR can
  delete it (the Electron and native targets: Electron already runs SQLite; native still runs
  `storage-filesystem-expo` until PR 4 — a patch that native still needs must STAY).
- Does premium's `getRxStorageWorker` accept a function `workerInput` (so our code constructs the
  `Worker`)? Quote the signature from `node_modules/rxdb-premium/dist/types/plugins/storage-worker/*.d.ts`
  and the page-side implementation that handles `error`/`messageerror` events (the spike says it
  pushes errors into an array it never reads — confirm with line numbers). Does `mode: 'one'` exist
  and what does it do?
- Does premium's `storage-sqlite` export `boolParamsToInt` and `getSQLiteBasicsWasm`; what does
  `SQLiteBasics` require (`open`, `all`, `run`, `setPragma`, `close`, `journalMode`)? Quote the type.

## 3. Multi-tab today: everything that assumes a second tab can open storage
- RxDB leader election use: every `waitForLeadership`, `isLeader`, `leaderElector` reference in
  `packages/**`, `apps/main/**` (not tests first, then tests). For each: what it gates, and what the
  right behaviour is when there is exactly one storage-owning tab and `multiInstance: false`
  (rxdb's leader elector with `multiInstance: false` — does `waitForLeadership()` resolve
  immediately? Check `node_modules/rxdb/dist/esm/plugins/leader-election/*.js`).
- `apps/main/lib/web-write-leader.ts` and everything that imports it; the sync engine's leader gate
  in `packages/sync-engine/src/create-rxdb-sync-engine.ts`; the follower write-outcome cases in
  `packages/sync-engine/src/write-path/write-outcome-bridge.ts` and `write-drain-lane.ts`
  (issue #1209, #1059 — grep for those numbers and for "follower").
- `packages/database/src/plugins/repair-ownership.ts` and its channel name, registration in
  `index.web.ts`, and tests. What breaks if it is deleted.
- `apps/main/e2e/two-tab-changelog-identity.spec.ts` and any other Playwright spec that opens two
  pages of one store (grep `context.newPage`, `newPage()` in `apps/main/e2e`). List them with what
  each asserts.

## 4. The targeted-recovery stack that dies with the engine on web
- `packages/database/src/plugins/opfs-targeted-recovery.mjs` (+ `.d.mts`), `scripts/opfs-targeted-recovery*.mjs`,
  `scripts/opfs-recovery-database-sync.test.mjs`, `scripts/opfs-repair-ownership*.mjs`,
  `packages/query/src/logs-storage-recovery.ts`, `packages/sync-engine/src/local-coverage/ledger-storage-recovery.test.ts`
  and whatever the coverage ledger imports from the recovery module. For each: who imports it, on
  which platform (web / electron / native), and whether the NATIVE adapter
  (`packages/database/src/adapters/default/index.ts` or `.native.ts`) still needs it until PR 4.
  Anything native still imports must STAY in this PR; list exactly what can go now.
- `packages/eslint/index.js` references `opfs.worker` — what rule, and what must change.

## 5. Degraded storage and the money-path guard
- The degraded-storage watchdog (grep `degraded`, `storage-health`, `watchdog`, `condemn` in
  `packages/**` and `apps/main/**`): where a lost worker is detected today, the sixty-second hang
  window, what it emits, and where the banner and the Pay guard read it. What hook would let the
  new adapter report a worker `error`/`messageerror` event and a terminate-on-condemn.
- The storage-call deadline policy document and its pin test (`packages/database/src/plugins/STORAGE-CALL-DEADLINE-POLICY.md`,
  `error-handler-wrapping.test.ts`).

## 6. Where the app would mount a parked-tab screen
- The app's boot sequence on web: from `apps/main/app/_layout.tsx` (or the root) to the point
  where the store database opens (`apps/main/lib/create-app-engine.ts`, `packages/database/src/create-db.ts`).
  Where is the earliest place a "another tab is live" decision can be made BEFORE any database
  is opened, and what existing full-screen states (splash, error boundary, "clear data",
  "store closed") exist that a parked screen should sit beside? Name the components and their
  files. Which i18n mechanism strings use (`useT`, `t\`\``, tolgee keys?) and where a new screen's
  strings go. Which design rules apply (`.claude/rules/design.mdc` — summarise its hard rules in
  ten lines).
- Existing use of `navigator.locks` (Web Locks) and `BroadcastChannel` in `apps/main` and
  `packages/**` (excluding node_modules): list them.

## 7. Clear data, measure storage, purge on web
- `packages/database/src/clear-all-db.web.ts`, `measure-storage.web.ts`, `purge-legacy-db.web.ts`
  and their tests: what OPFS paths/roots they enumerate today (the v6 filesystem roots), and what
  an `opfs-sahpool` pool looks like on disk (the pool VFS stores files under one OPFS directory
  named by the pool `name` with opaque file names and a `.opaque` mapping — check
  `node_modules/@sqlite.org/sqlite-wasm` if present, else say not installed; the spike's
  `sqlite-worker-entry.mjs` shows the pool options used).
- `database-names.ts` / `database-generation.ts`: what PR 2 left for web (generation v7, legacy
  `['v6']`), and whether the purge classifier needs a pool-directory concept.

## 8. Dependencies
- Is `@sqlite.org/sqlite-wasm` in `pnpm-lock.yaml`? Which version did the spike use and how did the
  spike install it (its own `package.json`? `.deps/`?). Is the tarball in the pnpm store
  (`~/Library/pnpm/store/v11` — grep its index for the package name)? What esbuild version builds
  the current worker and where is esbuild declared.
- How the app's web bundler (Expo/Metro for `apps/main` web) serves files from `apps/main/public/`
  — is a `.wasm` file under `public/` served as-is with `application/wasm`? Any existing
  `.wasm` in the repo?

## 9. Tests that will go red when `WEB_STORAGE_ENGINE` flips and `multiInstance` becomes false
- Run nothing. By reading, list every test file whose assertions depend on `opfs-filesystem`,
  `multiInstance: true` on web, the OPFS worker path, or leader election on web.
