# PR 3 review fixes

## Changed

- F1: the device collection hold now spans confirmation and persistence; success and rejected writes both release it.
- F2: web ownership rejects new holds with exported `LiveTabNotOwnedError`; all four payment paths abandon refused captures without HTTP, retries, or cashier errors. Checkout preparation aborts on unmount. Native/Electron holds remain non-throwing.
- F3: a newly live tab announces ownership; another requester aborts its queued acquisition and parks. A later explicit takeover uses a fresh abort controller; no automatic re-request.
- Added CLIENT161 (`REGISTER_TAB_NOT_OWNED`) rather than misclassifying ownership loss as a database outage. Generated registry/translations updated.

## Behavior changes / regressions

- Intended: parked/acquiring/taking-over tabs and a holder past the deferral ceiling cannot begin captures or obtain write holds.
- Intended: reader confirmation retains its payment hold until persistence settles, subject to the existing takeover ceiling.
- Intended: losing requesters return to the parked screen instead of remaining disabled.
- Observed regression coverage below; broad compatibility and performance were not evaluated.

## Test log

Initial red runs (observed):
- F1 device suite: 4 failed, 26 passed; early release prevented persistence and released before capture completion.
- F2 protocol suite: 3 failed, 14 passed; non-owners accepted holds.
- F2 isolated unmount test: 1 failed, 31 skipped; checkout POST occurred after unmount.
- F2 four payment suites: 6 failed, 142 passed; refusal reached normal error/retry handling and checkout survived unmount.
- F3 protocol suite: 1 failed, 16 passed; second requester remained taking-over.

Final verification (commands run sequentially, worker cap 2):

### `pnpm --filter @wcpos/database test --maxWorkers=2 --coverage=false`

Exit 0.

```text
Test Suites: 1 skipped, 49 passed, 49 of 50 total
Tests:       1 skipped, 612 passed, 613 total
Snapshots:   0 total
Time:        1.444 s
```

### `pnpm --filter @wcpos/main test --maxWorkers=2`

Exit 0.

```text
Test Suites: 41 passed, 41 total
Tests:       528 passed, 528 total
Snapshots:   0 total
Time:        7.297 s
```

### `pnpm --filter @wcpos/core test --runTestsByPath src/screens/main/pos/checkout/payments/server/server-leg.test.ts src/screens/main/pos/checkout/payments/device/device-leg.test.ts src/screens/main/pos/checkout/hooks/use-checkout-session.test.ts src/services/terminal-payments/service.test.ts --maxWorkers=2 --coverage=false`

Exit 0.

```text
Test Suites: 4 passed, 4 total
Tests:       149 passed, 149 total
Snapshots:   0 total
Time:        7.585 s
```

### `pnpm --filter @wcpos/utils test --runTestsByPath src/logger/error-registry.test.ts --maxWorkers=2 --coverage=false`

Exit 1.

```text
$ jest --runTestsByPath src/logger/error-registry.test.ts --maxWorkers=2 --coverage=false
ts-jest[config] (WARN) 
    The "ts-jest" config option "isolatedModules" is deprecated and will be removed in v30.0.0. Please use "isolatedModules: true" in /Users/kilbot/Projects/monorepo-v2-worktrees/web-engine-2242/packages/utils/tsconfig.json instead, see https://www.typescriptlang.org/tsconfig/#isolatedModules
  
Entry SYNC101 field summary contains control characters
Entry SYNC101 needs troubleshooting: a non-empty array of non-empty strings
Entry SYNC101 needs troubleshooting: a non-empty array of non-empty strings
Entry SYNC101 field troubleshooting contains control characters
Entry SYNC101 field troubleshooting contains control characters
Entry SYNC101 field troubleshooting contains control characters
Entry SYNC101 has unknown logSource: sentry
Entry SYNC101 has duplicate logSources
Duplicate code: SYNC101
FAIL @wcpos/utils src/logger/error-registry.test.ts
  ● error registry › contains every evidence-backed seed symbol and nothing else

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 1

    @@ -59,12 +59,12 @@
        "RECORD_INVALID_FIELD",
        "RECORD_REJECTED",
        "REGISTER_APPROVAL_REFUSED",
        "REGISTER_CLOSE_REFUSED",
        "REGISTER_OPEN_REFUSED",
    -   "REGISTER_TAKEN_OVER",
        "REGISTER_TAB_NOT_OWNED",
    +   "REGISTER_TAKEN_OVER",
        "REQUEST_QUEUE_OVERFLOW",
        "RESPONSE_HEADERS_REJECTED",
        "REST_ROUTE_MISSING",
        "REST_TRANSPORT_BLOCKED",
        "SCHEMA_MISMATCH",

      173 | describe('error registry', () => {
      174 | 	it('contains every evidence-backed seed symbol and nothing else', () => {
    > 175 | 		expect(registry.map(({ symbol }) => symbol).sort()).toEqual(SEED_SYMBOLS);
          | 		                                                    ^
      176 | 	});
      177 |
      178 | 	it('has complete, unique entries whose prefixes match their domains', () => {

      at Object.<anonymous> (src/logger/error-registry.test.ts:175:55)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 22 passed, 23 total
Snapshots:   0 total
Time:        0.5 s
Ran all test suites within paths "src/logger/error-registry.test.ts".
/Users/kilbot/Projects/monorepo-v2-worktrees/web-engine-2242/packages/utils:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @wcpos/utils@1.9.1 test: `jest --runTestsByPath src/logger/error-registry.test.ts --maxWorkers=2 --coverage=false`
Exit status 1

```

### `node scripts/live-tab-probe.mjs`

Exit 0.

```text
PASS first tab live; second parked with zero worker/pool opens
PASS payment deferral, close/terminate/release, requester opens real pool
PASS write deferral reaches ceiling; reverse takeover opens real pool
PASS no-answer timeout; closing frozen holder grants ownership; no pool contention
```

### `pnpm typecheck --force --concurrency=1`

Exit 0.

```text
 Tasks:    15 successful, 15 total
```

### `pnpm --filter @wcpos/core lint`

Exit 0.

```text
✖ 125 problems (0 errors, 125 warnings)
```

### `pnpm --filter @wcpos/database lint`

Exit 0.

```text
✖ 4 problems (0 errors, 4 warnings)
```

### `pnpm --filter @wcpos/utils lint`

Exit 0.

```text
$ eslint src --ext .js,.jsx,.ts,.tsx
```

### F1 mutation check with real live-tab protocol

Restored the original device-leg implementation temporarily; ran `pnpm --filter @wcpos/core test --runTestsByPath src/screens/main/pos/checkout/payments/device/device-leg.test.ts --testNamePattern="keeps a deferred takeover" --maxWorkers=2 --coverage=false`. Expected exit 1; observed exit 1. Both success/rejection deferred-persistence tests failed (holder parked before write settled). Restored the new implementation in `finally`.

### Final rerun: `pnpm --filter @wcpos/core test --runTestsByPath src/screens/main/pos/checkout/payments/server/server-leg.test.ts src/screens/main/pos/checkout/payments/device/device-leg.test.ts src/screens/main/pos/checkout/hooks/use-checkout-session.test.ts src/services/terminal-payments/service.test.ts --maxWorkers=2 --coverage=false`

Exit 0.

```text
Test Suites: 4 passed, 4 total
Tests:       149 passed, 149 total
Snapshots:   0 total
Time:        9.018 s
```

### Final rerun: `pnpm --filter @wcpos/utils test --runTestsByPath src/logger/error-registry.test.ts --maxWorkers=2 --coverage=false`

Exit 0.

```text
Test Suites: 1 passed, 1 total
Tests:       23 passed, 23 total
Snapshots:   0 total
Time:        0.437 s, estimated 1 s
```

### Final rerun: `pnpm --filter @wcpos/database test --runTestsByPath src/live-tab/live-tab.web.test.ts --maxWorkers=2 --coverage=false`

Exit 0.

```text
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
Time:        0.244 s, estimated 1 s
```

### Changed-file lint

`pnpm exec eslint <all changed .ts/.tsx files, including ownership-error.ts>`: exit 0.

No warnings or errors.

## Found / remaining verification limits

- Observed: final database suite 612 passed / 1 skipped; main suite 528 passed; targeted core files 149 passed; registry tests 23 passed. Protocol subset: 17 passed. Real-worker browser probe: all four checks passed. Typecheck: all 15 tasks passed.
- Observed: full package lint passed for core, database and utils (125 core warnings and 4 database warnings); changed-file lint had no warnings/errors. The hook suite prints the existing React `act(...)` warning from the storage-degradation test path; ts-jest prints its configuration deprecation warning.
- The initial registry-suite failure was the new seed symbol's alphabetical position; corrected, and the final registry run passed. Its control-character/duplicate-code messages are expected negative-fixture generator diagnostics.
- Two bounded independent copy-review passes completed. The final correction accounts for acquiring/taking-over and worker-lost screens, not just an already moved register. No additional subsystem, retries, or auto-takeover was added.
- Not evaluated: deployed host, packaged Electron/native runtime, hardware reader, broad old/new compatibility or performance. The real-worker probe uses local Chromium, Web Locks, BroadcastChannel and the shipped SQLite worker; three-tab / two-requester recovery is covered by the isolated-page protocol harness.
- CLIENT161 needs its companion `wcpos/docs` v2 catalogue/help-page update before release. No cross-repo changes or PR actions were made under this brief.
- `scripts/extract-js-strings.js` acquired an unrelated worktree edit during this run. That edit is preserved and excluded from these commits.
- No fetch, pull, rebase, push, or PR operation performed. Three local commits, one per finding. The supplied untracked brief is deleted at completion.
- Scope: 195 changed non-test code/JSON lines against `e64f5615f`, including generated registry files; within the 250-line budget. Test and review-note lines excluded.
