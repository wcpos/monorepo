# Blocking question — item 2c

How should an absent variation parent be represented for the required parent index?
`variationSchema.properties.parentRemoteId` is `['string', 'null']`
(`packages/sync-engine/src/collections/variation-schema.ts:77`), and production
materialization uses `remoteIdOrNull(payload.parent_id)` (`materialization/record-materialization.ts:131`).
The query map also writes this field through `remoteIdOrNull` (`packages/query/src/engine-adapter/collection-map.ts:506–508`).
RxDB rejects an index on this type with SC36 (`node_modules/rxdb/src/plugins/dev-mode/check-schema.ts:479`).

The brief requires indexing `parentRemoteId`, but only specifies a non-null mirror
for `remoteId`. Should we add an indexed `parentRemoteKey = parentRemoteId ?? ''`
and redirect parent lookups, or change `parentRemoteId` itself to a non-null
spelling (which changes its existing null contract)? No workaround implemented.
Stopped before item 2 as directed by the brief's contradiction rule.

## Item status

1. **Implemented; locally verified.** Web/desktop generation v7, native v8,
   scope generation 5. Legacy lists exclude the active generation, include v6
   on web/desktop and v6/v7 on native. Added Electron purge IPC forwarding and
   error logging. The app starts purge once per module session after successful
   engine readiness, without awaiting it on the open path. Rejected readiness
   does not purge; rejected purge does not reject readiness. Updated generation
   fixtures, including the storage-footprint test. Scope regexes unchanged.
2. **Blocked, not implemented.** Parent index/null contract question above.
3. **Not started.** The unrounded `sortable_price` sort remains on the JS path.
4. **Not started.** No translator patch, postinstall change, or mutation check.
5. **Not started.** PRAGMA optimize/statistics claim not evaluated.
6. **Not started.** Proxy and existing patch/recovery files remain untouched.

## Observed verification

Commands below ran from the named package; binaries are hoisted, so the brief's
package-local `node_modules/.bin` paths were replaced with `../../node_modules/.bin`.
The initial database command using the brief's path exited 127 (binary absent);
no installation or dependency change was needed.

| Package / command | Result |
| --- | --- |
| database: `../../node_modules/.bin/jest --maxWorkers=2 --coverage=false src/database-names.test.ts src/database-names.native.test.ts` — baseline | Exit 0; 2 suites, 33 passed |
| Same command — new expectations, before implementation | Exit 1; 14 failed, 28 passed; expected old-generation/legacy-list failures |
| main: `../../node_modules/.bin/jest --maxWorkers=2 --coverage=false lib/create-app-engine.test.ts -t 'legacy database purge'` — before implementation | Exit 1; 2 failed, 1 passed, 56 skipped; purge not called/logged |
| sync-core: `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 ../../node_modules/.bin/vitest run src/storeScopeIdentity.test.ts` — before implementation | Exit 1; 2 failed, 14 passed; default generation still 4 |
| database: Jest naming tests plus `src/purge-legacy-db.test.ts src/purge-legacy-db.web.test.ts`, same flags | Exit 0; 4 suites, 44 passed |
| database: Jest `src/purge-legacy-db.electron.test.ts`, same flags — before implementation | Exit 1; 2 failures because requested platform module did not exist |
| main: `../../node_modules/.bin/jest --maxWorkers=2 --coverage=false lib/create-app-engine.test.ts` | Exit 0; 59 passed |
| database: `../../node_modules/.bin/jest --maxWorkers=2 --coverage=false` — first full run | Exit 1; 2 old-generation fixture failures, 590 passed, 1 skipped |
| database: `../../node_modules/.bin/jest --maxWorkers=2 --coverage=false --silent` — after fixture updates | Exit 0; 48 suites passed, 1 skipped; 592 tests passed, 1 skipped |
| sync-core: `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 ../../node_modules/.bin/vitest run` | Exit 0; 37 files, 709 passed |
| core: `../../node_modules/.bin/jest --maxWorkers=2 --coverage=false src/screens/main/health/storage-footprint-logic.test.ts` — first run | Exit 1; 1 old-generation fixture failure, 7 passed |
| core: same health test command after fixture update | Exit 0; 8 passed |
| root: `NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @wcpos/core run lint` | Exit 0; 126 warnings in untouched files, no errors |
| root: `pnpm typecheck --force` | Exit 0; 15 tasks successful |
| root: `NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @wcpos/database --filter @wcpos/sync-core --filter @wcpos/main run lint` | Exit 0; four existing warnings in database `types.d.ts`, no errors |
| root: `NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/eslint --fix` on every touched TypeScript file | Exit 0 |

## Behavior changes / regressions

- New generations cold-resync instead of opening the prior application/scope databases.
- Legacy purge now runs in production after the first successful engine readiness;
  current platform database generations are excluded. Electron delegates actual
  deletion to the companion main-process handler.
- No claim of broad compatibility, no-regression, or performance improvement.
  Verification covers item 1's unit contracts, not deployed purge behavior.

## Not evaluated / unverified

- Live web, native and packaged Electron behavior; companion main-process purge.
- Query/sync-engine full suites and requested core query/logs/POS/orders suites:
  items 2–6 were not started due to the blocking question.
- Both-engine query parity, EXPLAIN plans, translator mutation check, ANALYZE pin.
- No fetch, pull, rebase, push, PR creation, or PR edits performed.

## Review

One independent read-only item-1 review: PASS, no actionable findings and not
over-scoped. No follow-up code changes requested. Tests were not rerun by the
reviewer; runtime verification limits remain as listed above.
