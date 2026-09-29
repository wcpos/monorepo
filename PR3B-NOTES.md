# PR 3B — partial implementation, not deployable

## Status

**Incomplete.** Paused at 397 changed non-test source lines against the pre-task HEAD
`a98d278981e7`, just below AGENTS.md's 400-line ceiling. Requested explicit permission for
500 to finish the brief; no response received at report time. See `PR3B-STOP.md`.
High stakes: takeover during capture or persisted writes can affect money/data.
No fetch/pull/rebase, push, PR, sync-engine/sync-core/schema edits or deployment.
Existing staged briefs/findings remain outside implementation commits.

## Changes by file

Commits: `226cc6373` (pool growth), `58ba03e7b` (protocol/write hold).

### Committed concerns

- `scripts/sqlite-worker-entry.mjs`: check file count/capacity before open; grow by 16.
- `packages/database/src/adapters/storage/sqlite-pool.ts`: initial capacity 22 = three
  database/WAL pairs (6) + one growth batch (16), with acquisition-cost rationale.
- `apps/main/public/sqlite.worker.js`: rebuilt generated worker.
- `scripts/sqlite-worker-probe.mjs`: exceed initial capacity with concurrently open DBs,
  write/read the last, retain prior persistence/restore checks.
- `packages/database/src/live-tab/live-tab.web.ts`: origin-scoped exclusive lock,
  cooperative request/ack/release, payment/write registry, ceiling, no-answer state,
  worker-loss park, disposal. No stealing. RxJS is the existing observable dependency;
  no application, storage or UI imports in the protocol.
- `packages/database/src/live-tab/index.ts`, `index.web.ts`, `src/index.ts`: native/default
  no-op hold and web public platform export.
- `packages/database/src/plugins/wrapped-error-handler-storage.ts`: optional write hold
  callback, released in finally when the wrapped bulkWrite settles.
- `packages/database/src/adapters/default/index.web.ts`: supply the write hold callback.
- `packages/database/src/live-tab/live-tab.web.test.ts`: ten named protocol cases, fake
  lock queue/broadcast bus/timers. Fake rejects signal+ifAvailable, like real Web Locks.
- `packages/database/src/plugins/wrapped-error-handler-storage.test.ts`: two pending-write
  hold/release cases (resolution and rejection).
- `scripts/live-tab-probe.mjs`: real two-page Web Locks/BroadcastChannel and shipped SQLite
  worker. Parked page constructs zero workers. Former pool-owner pages reload before reuse.

### Uncommitted, incomplete app integration

- `apps/main/components/parked-tab.tsx`: exact requested English copy, semantic-token
  EmptyState, separate 48pt-minimum action (EmptyState's built-in action lacks disabled
  support and uses a smaller touch target). No translation/theme providers required by
  this component's code. Actual provider-free browser rendering remains unverified.
- `apps/main/components/live-tab-gate.web.tsx`, `live-tab-gate.tsx`: singleton, live-only
  children, synchronous subscription notifications/unmount, worker-loss subscriptions,
  test hold hook guarded by existing DEV/E2E switch, reload after a former owner reacquires.
- `apps/main/app/_layout.tsx`: place merchant gate before startup clear/hydration.
- `apps/main/lib/create-app-engine.ts`: export reuse of cached-engine bounded disposal.
- `packages/core/src/contexts/app-state/use-hydration-suspense.ts`: await an already-started
  hydration before closing its databases, so it cannot open more after pool termination.
- `apps/main/components/parked-tab.test.tsx`, `live-tab-gate.test.tsx`: six copy/action states
  and singleton/live-only child mounting test. Shared UI components are mocked in the
  screen test: these assertions do not establish real Uniwind rendering.
- `apps/main/e2e/live-tab.spec.ts`: authenticated same-context two-page transitions, write
  test hook and frozen-holder CDP case. Not run against dev-next, as instructed.
- `apps/main/package.json`, `pnpm-lock.yaml`: RNTL 14.0.1, verified via npm registry before
  installation. Installation ran the repository's ordinary postinstall patches.

## Verification — Observed

The brief's pnpm extra `--` is known from PR3A to become a Jest filename pattern; the
commands below omit that separator and use the actual app package name `@wcpos/main`.

| Command / check | Result |
| --- | --- |
| Protocol tests before implementation | Missing-module error first; then stub run: 9 failed / 1 passed, demonstrating missing behavior. |
| `node scripts/sqlite-worker-probe.mjs` before growth | FAIL with SQLITE_CANTOPEN after exceeding old capacity. |
| `pnpm build:sqlite-worker` | PASS, exit 0. |
| `node scripts/sqlite-worker-probe.mjs` after growth | PASS, output below. |
| `node --test scripts/sqlite-worker.test.mjs` | PASS, 3 tests. |
| New pending-write hold tests before/after callback | FAIL 2, then PASS 2. |
| `pnpm --filter @wcpos/database test --maxWorkers=2 --coverage=false live-tab.web.test.ts` | PASS, 10 tests. |
| `pnpm --filter @wcpos/database test --maxWorkers=2` (final) | PASS, 49 suites / 604 tests; 1 suite / 1 test skipped. |
| `pnpm --filter @wcpos/main test --maxWorkers=2 --runTestsByPath components/live-tab-gate.test.tsx components/parked-tab.test.tsx` | PASS, 2 suites / 7 tests. |
| `pnpm --filter @wcpos/main test --maxWorkers=2` (final) | PASS, 40 suites / 523 tests. Jest warned a worker did not exit gracefully. |
| `pnpm --filter @wcpos/core test --maxWorkers=2` | INCOMPLETE: multiple workers exhausted the configured 2 GB V8 heaps. Stopped with SIGINT (130) after repeated failures; no passing full-suite claim. |
| `node --test scripts/*.test.mjs` | PASS, 926 tests, exit 0. |
| `node scripts/live-tab-probe.mjs` | PASS all four transitions, output below. |
| `pnpm --filter @wcpos/database exec tsc --noEmit` | PASS after fake lock signature correction. |
| `pnpm typecheck --force` | Initial failures found channel/test signatures, logger code, dataset typing and E2E expect import. Final rerun PASS, exit 0: 15/15 tasks successful, none cached. |
| `pnpm --filter @wcpos/database lint` | PASS; four existing types.d.ts warnings. |
| `pnpm --filter @wcpos/main lint` | PASS. |
| `pnpm --filter @wcpos/core lint` | PASS, 125 warnings / zero errors. |
| Explicit ESLint on changed source/test/probe files | PASS after formatting and browser global qualification. |
| `git diff --check -- . ':!apps/main/public/sqlite.worker.js'` | PASS. Generated minified worker contains trailing whitespace inside vendor template literals; not manually rewritten. |

One main-suite attempt briefly overlapped the core run; interrupted that attempt (130),
then reran main alone after stopping core. No claim that every run was strictly sequential.

### Mutation check

Moved the holder ack after starting teardown, ran:
`pnpm --filter @wcpos/database test --maxWorkers=2 --coverage=false live-tab.web.test.ts -t 'holder acks, tears down'`.
**FAIL, exit 1**: expected ack before teardown; observed teardown before ack. Restored
immediately. The final database suite includes the restored ordering.

### Browser evidence and its limits

The first real protocol probe failed because Web Locks disallows `signal` together with
`ifAvailable`. Corrected to `{ ifAvailable: true }` on boot and `{ signal }` on queued
acquisition; strengthened the fake. A later reverse-open attempt hung because premium's
client still retained a terminated worker: the probe now reloads former-owner pages, in
line with the intended app gate reload, rather than claiming in-place recovery works.

```text
PASS write/read/close/reopen; growth beyond initial capacity/
PASS write/read/close/reopen; growth beyond initial capacity/?read=persisted
PASS persistence across page/worker restart; wasm cache-buster
PASS write/read/close/reopen; growth beyond initial capacity/?read=restored
PASS OPFS snapshot/restore preserves readable SQLite pool

PASS first tab live; second parked with zero worker/pool opens
PASS payment deferral, close/terminate/release, requester opens real pool
PASS write deferral reaches ceiling; reverse takeover opens real pool
PASS no-answer timeout; closing frozen holder grants ownership; no pool contention
```

The two-page probe bundles the protocol, not the real app gate. Holds are artificial,
not payment requests or actually wedged bulkWrites. It does not prove bounded app teardown.
No screenshots or visual artifacts were captured.

## Remaining work / known gaps

1. Payment holds are **not wired**. Tender uses asynchronous `service.begin()`; actual
   awaited device/server capture windows live in their payment-leg modules. Cover those,
   manual recording and contract checkout without holding preparation/idle UI time.
2. `closeRegisteredDatabases()` can still await a genuinely wedged write beyond the
   takeover ceiling. Reuse terminal storage/disposal handling and test this end to end.
3. Verify gate teardown ordering with the actual lifecycle, SSR/pre-render behavior,
   Electron platform resolution, repeated takeover/reload and initial hydration races.
4. Verify real EmptyState outside providers, light/dark, tablet/phone, button sizing and
   contrast. Unit tests mock shared UI. Do not infer visual success from them.
5. Full core suite remains unverified after worker OOM; authenticated live-store E2E is
   intentionally not run. Native/Electron runtime, WebKit, deployed CDN delivery and
   real reader/payment behavior are unverified.
6. No independent completion review: implementation stopped on scope before that gate.

## Exact copy in the unfinished working tree (not shipped)

| State | Title | Description | Action |
| --- | --- | --- | --- |
| another-tab-live | The POS is open in another tab | Only one tab can run the register. | Take over here |
| taking-over: null | Taking over… | Waiting for the other tab to hand over. | Take over here (disabled) |
| taking-over: payment | Taking over… | Waiting for the other tab to finish a payment. | Take over here (disabled) |
| taking-over: write | Taking over… | Waiting for the other tab to finish saving. | Take over here (disabled) |
| taking-over: no-answer | The other tab isn't answering | Close it, or reload it, to continue here. | Take over here (disabled) |
| worker-lost | Local database unavailable | Reload to keep selling. | Reload the app |

## Behavior changes / regressions

- Observed: empty pools start at 22 handles and grow in batches of 16; previously 64 was
  fixed. Existing pools retain their existing capacity. No performance improvement claimed.
- Intended/incomplete: merchant web tabs are gated per origin; concurrent followers become
  parked, and a former owner reloads after acquiring ownership again. App integration is
  not ready to deploy without payment/teardown work above.
- Observed: protocol and artificial holds work in Chromium, including close of a frozen
  owner. Not evidence of old/new full application compatibility or crash durability.
- Known gap: capture is currently unprotected by the new registry. Known gap: a real stuck
  write can prevent teardown from finishing. These are blockers, not accepted high-stakes risks.
