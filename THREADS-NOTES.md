# PR 3 review-thread follow-up

## Item 1 — server/hydration snapshot

- Changed `LiveTabGate` to pass a dedicated, constant `acquiring` server
  snapshot to `useSyncExternalStore`. SSR renders nothing, including without
  `navigator`; browser hydration uses that same snapshot. The existing mount
  effect creates the live-tab coordinator and ownership controls child mounting.
- **Observed:** this checkout has no `apps/main/app.json`; `app.config.ts` sets
  `web.output: 'single'`, not `static`. `app/+html.tsx` declares itself static-only.
  `public/index.html` contains a noscript message and an empty `<div id="root">`.
  The brief's conditional static merchant-route export inspection therefore does
  not apply. No export was generated or deployed HTML inspected.
- **Observed test limitation:** attempting jsdom + `hydrateRoot` failed during
  React Native preset setup with `TypeError: Cannot redefine property: window`.
  Used the brief's permitted fallback: capture and assert the actual third
  `useSyncExternalStore` callback's result without navigator, with Web Locks,
  and after ownership resolves. The wrapper delegates to the real React hook.
  RNTL checks children stay absent while acquiring and mount on `live`.
- **Observed red/green:** the new tests failed against the original snapshot
  (`Expected: ""; Received: "SSR child"`), then passed with the fix. Mutating
  the new server snapshot to `LIVE` failed three lifecycle cases (exit 1).
  Restored the fix before the successful full-suite run.

## Item 2 — measured answer: Chromium getFile succeeds

- **Observed:** `node scripts/sqlite-worker-probe.mjs`, headless Chromium
  `153.0.8010.12`, local loopback origin, shipped worker and wasm. The PAGE walks
  the pool before closing the live storage instances, while the worker retains
  its sync access handles. No `getFile()` calls rejected; there is no error name
  or message to report.

| Probe pass | Pool files | Direct walk bytes | Actual `sqlite` root bytes | Errors |
| --- | ---: | ---: | ---: | --- |
| Fresh write/growth | 54 | 985248 | 985248 | none |
| Page/worker restart | 54 | 753664 | 753664 | none |
| Snapshot restore/restart | 54 | 753664 | 753664 | none |

- Kept the existing directory walk, as the brief directs for this outcome.
  Extended the probe to run the real `measureAppStorage()`, assert successful
  page-side reads, and require matching, non-zero `root: 'sqlite'` bytes.
  No origin-wide estimate is used as the pool measurement.
- Added an explicit Safari-unverified comment next to `getFile()`. No worker
  message protocol or fake-worker message test was added: Chromium did not
  reproduce the premise that would require that branch of the brief.
- **Observed source inspection:** premium's `storage-worker/in-worker.js`
  forwards message data to `exposeRxStorageRemote`. RxDB's
  `storage-remote/remote.js` selects `method === 'custom'` / `'create'`, then
  per-instance `connectionId` and array `params`. A plain
  `{ type: 'wcpos:measure' }` matches none of those handlers. This protocol
  remains unimplemented and was not exercised.
- Worker entry and generated worker are unchanged; no rebuild or companion
  plugin re-vendoring is required by this patch. Current `sqlite.worker.js`
  SHA-256: `1cd1e1c7f85f09c52996fd0b1347e6e4d30ee4dc4f51f983194c825875b6509a`.

## Verification log

All suites ran sequentially; every result below was checked by exit status.

| Command | Observed result |
| --- | --- |
| `pnpm --filter @wcpos/main test --maxWorkers=2 live-tab-gate` | PASS: 2 suites, 7 tests |
| Server snapshot `LIVE` mutation, lifecycle suite | Expected FAIL: 3 cases, exit 1; restored |
| `pnpm --filter @wcpos/main test --maxWorkers=2` | PASS: 41 suites, 529 tests; worker-exit warning (source not diagnosed) |
| `pnpm --filter @wcpos/database test --maxWorkers=2` | PASS: 49 suites, 612 tests; 1 suite/test skipped; ts-jest deprecation warning |
| `node --test --test-concurrency=2 scripts/*.test.mjs` | PASS: 926 tests |
| `node scripts/sqlite-worker-probe.mjs` | PASS: measurements above, persistence, growth, wasm cache-buster, OPFS snapshot/restore |
| `node scripts/live-tab-probe.mjs` | PASS: initial owner/parked tab, payment/write deferral, handover, reverse takeover, no-answer timeout, closed-holder recovery |
| `pnpm typecheck --force --concurrency=1` | PASS: 15 tasks, none cached |
| `pnpm --filter @wcpos/main lint` | PASS |
| `pnpm --filter @wcpos/database lint` | PASS: 0 errors; 4 warnings in untouched `src/types.d.ts` |
| `pnpm exec eslint apps/main/components/live-tab-gate.web.tsx apps/main/components/live-tab-gate-lifecycle.test.tsx packages/database/src/measure-storage.web.ts scripts/sqlite-worker-probe.mjs` | PASS after formatting fixes |
| `git diff --check` | PASS |

Independent read-only review: no actionable findings; not over-scoped. No
performance improvement or broad compatibility claim is made. Safari, packaged
Electron, deployed merchant HTML, and actual DOM hydration remain unverified.

## Behavior changes / regressions

- Intentional: SSR and hydration exclude the app children until client ownership
  is resolved; SSR no longer treats absent navigator as permission to render.
- Storage measurement behavior is unchanged. Chromium's existing walk is now
  pinned by a live-worker probe. Safari under-reporting remains an unverified risk.
- No additional regression was observed in the listed checks.

## Scope and handoff

Two local commits, one per item; no fetch, pull, rebase, push, or PR changes.
The pre-existing `REVIEW-NOTES.md` deletion is left unstaged and untouched.
The input brief is removed as requested. The production/probe diff is 39 changed
non-test lines, within the stated 120-line budget (notes and tests excluded).
