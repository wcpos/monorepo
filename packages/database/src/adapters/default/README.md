Storage adapters for each platform.

## Web - OPFS

The web adapter uses a web worker to offload the database operations to a separate thread and stores data in OPFS.

## Electron - filesystem-node-ipc

The electron adapter uses the filesystem-node IPC bridge for database storage.

## Native - Expo Filesystem

The expo adapter uses the Expo Filesystem-backed storage implementation.

## Decision: web runs RxDB with `multiInstance: true`

**Status:** ruled, standing. Owner ruling 2026-08-06. Implemented by #1057 (closes #1045, #1055, #1050-web). Supersedes #1049 and wcpos/electron#325.

## Decision

| Platform | `multiInstance` | Why |
|---|---|---|
| Web (`adapters/default/index.web.ts`, engine scope DBs in `apps/main/lib/create-app-engine.ts`) | `true` | Multi-tab of one store is first-class. |
| Electron (`index.electron.ts`) | `false` | Every window proxies over IPC to one main-process storage. |
| Native (`index.ts`) | `false` | One storage per app process. |

Cashiers open the POS in several tabs and do unexpected things. We support it rather than forbid it. On web, one tab wins a `navigator.locks` exclusive lease and owns the write plane (drain, conflict resolution, recovery). `multiInstance: true` is what makes that work: it gives the follower tabs a coherent read view over BroadcastChannel and gives RxDB's own leader election a single tab to run cleanup and recovery in. Two database paths exist on web and only one has a fallback: the engine-scope databases (`apps/main/lib/create-app-engine.ts`) set `multiInstance` from `webLocksAvailable`, so a browser without `navigator.locks` degrades them to single-writer `false` alongside the write-leader degrade. The user and store databases built from this adapter's `defaultConfig` are `true` unconditionally; they have no fallback, and none is planned, because without Web Locks there is no leader to gate recovery on either way. The temporary database is outside this ruling: it comes from the ephemeral adapter, which is in-memory and `multiInstance: false` on every platform.

## Why `false` on web is a data-loss path, not a fix

rxdb-premium's OPFS storage does not fence tabs. Each run takes a cross-tab `navigator.locks` lock and then releases its access handles, so a second tab's worker interleaves serially on the same files. With `multiInstance: false` declared, two tabs each believe they are the sole owner, and each can run a recovery that rewrites index rows while neither receives the other's changelog operations. #1049 put a wrapper-level recovery through two adversarial passes and both found real corruption on exactly this route: a stale peer's cleanup persisting stale rows over a repaired base, and an in-memory row refresh racing premium's unserialised broadcast subscriber. That is why #1049 was abandoned and #1057 moved the fix to the architecture layer.

## The recurring mistake

The refusal `targeted recovery refused: multi-instance` shows up in Sentry on web (2JZ, 2KB). Every agent that reads `index.web.ts`, sees no flag, and assumes an omission then proposes `multiInstance: false`. That happened in #1043/#1045 (August), #1910 (2026-09-08), and twice more in September. The flag is not the defect.

The defect is the gate. #1057 removed the config-flag refusal from `scripts/opfs-targeted-recovery.mjs` because leader-only cleanup made it unnecessary. #1713 (2026-08-30/31) reintroduced it for hollow-row drops and stale secondary rows without reconciling with the leader-only design, and no review thread challenged it. The correct gate is "refuse unless this tab is the RxDB leader", which requires the leadership fact to reach the storage worker. Until that lands, refused repairs on web leave a row unrepaired; they do not corrupt anything.

## Guards

- `index.web.ts` states `multiInstance: true` explicitly with a comment pointing at this section. No silent rxdb default.
- `adapters/default/multi-instance-ruling.test.ts` pins all three platforms and fails with this rationale.
- Any PR that touches `params.multiInstance` in `opfs-targeted-recovery.mjs` or the flag in an adapter must cite #1057 and this section.
