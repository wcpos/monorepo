Storage adapters for each platform.

## Web - OPFS

The web adapter uses a web worker to offload the database operations to a separate thread and stores data in OPFS.

## Electron - filesystem-node-ipc

The electron adapter uses the filesystem-node IPC bridge for database storage.

## Native - Expo Filesystem

The expo adapter uses the Expo Filesystem-backed storage implementation.

## Decision: `multiInstance` is a consequence of the storage engine

**Status:** ruled, standing, in two eras.

- **Era 1 — `opfs-filesystem` (today, and all of 1.10.x).** Owner ruling 2026-08-06, implemented by #1057 (closes #1045, #1055, #1050-web). Supersedes #1049 and wcpos/electron#325. **Web is `true`.**
- **Era 2 — `sqlite-sahpool` (2.0).** Owner ruling 2026-09-21, wayfinder #2146 under map #2137. **Web becomes `false`, with the engine and not before.**

The two values were never independent settings, so they are pinned as a **pair**: `adapters/storage/storage-engines.ts` declares the current engine and the `multiInstance` each engine requires, and `multi-instance-ruling.test.ts` asserts them together. Changing the engine without the flag, or the flag without the engine, fails that test and the failure names the half you forgot. Every earlier version of this pin asserted the literal `true`, and a literal can be argued with — it was re-proposed as `false` five times.

**Which era applies to the lane you are on:** `main` / 1.10.x is Era 1 and stays there; `false` on web is still the #1049 data-loss path on that lane. `next` is Era 1 **until the engine migration lands** and Era 2 after it. Flipping the flag on `next` ahead of the engine reintroduces #1049.

## Era 1 — `opfs-filesystem`: web is `true`

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

The defect is the gate. #1057 removed the config-flag refusal from `scripts/opfs-targeted-recovery.mjs` because leader-only cleanup made it unnecessary. #1713 (2026-08-30/31) reintroduced it for hollow-row drops and stale secondary rows without reconciling with the leader-only design, and no review thread challenged it.

## What has been done about it (2026-09-11)

- **The floor was fixed at the premium layer.** rxdb-premium applied broadcast changelog ops by position alone, so a late or duplicate `D` deleted whatever row now sat at that position — a healthy neighbour. That is what #1049 and the adversarial pass on #1982 both reproduced. #1987 adds `scripts/patch-rxdb-premium-changelog-identity.mjs`: ops are applied by index-string identity with a position fast path, so a `D` whose index string is no longer present is a no-op. A stale `D` whose string IS still present — the document was rewritten without changing that index's string — still removes the current row for that document; that is the documented limit, and it removes the right document's row, never a neighbour's. #1995 links each index to its siblings at creation and rejects a secondary-index `A`/`R` whose byte range differs from the primary index's current row, in O(1). Both are mirrored in wcpos/electron (#437, #438) and backported to `main` (#2002).
- **What remains, and why it is upstream work.** If two tabs' batches for one document reach a third tab out of order, that document reverts to the older revision on that peer and can be left with two rows for itself: a stale secondary row, or — when the primary-index string changed between the two revisions and the newer batch's `A` landed on its fast path — a duplicate primary row that `metaIdMap` no longer points at, which `reconcileSecondaryIndexes` then refuses as `duplicate-primary-id`. An ordinary later write does not clear these (it only deletes the string it knows); an index rebuild does. No neighbour is touched. The receiver has no ordering signal: byte-range monotonicity breaks compaction propagation, and a same-document scan per secondary insert is O(n) on the boot replay. Closing it needs a revision or sequence in premium's op contract.
- **The gate itself (#1982) is belt-and-braces.** With identity-checked ops, the leadership handoff double-drop is harmless. #1982 now also rechecks primary absence inside the cleanup lock on the stale-secondary path, tracks ownership per RxDatabase instance (a duplicate close no longer revokes the survivor), and awaits the worker's acknowledgement of a revocation before rxdb's elector dies. Until it lands, refused repairs on web leave a row unrepaired; they do not corrupt anything.

## Era 2 — `sqlite-sahpool`: web becomes `false`, and multi-tab ends

Ruled 2026-09-21 (#2146, under storage-engine map #2137). At 2.0 web runs SQLite — the official `@sqlite.org/sqlite-wasm` build on the `opfs-sahpool` VFS, in WAL — in one dedicated worker owned by the one live tab.

**This is a consequence of the engine, not a change of mind about multi-tab.** `opfs-sahpool` holds exclusive OPFS access handles for the whole origin, and a second worker can never install the same pool. The shape Era 1 ships — every tab its own dedicated worker over the same files — is simply not available on SQLite. The only thing that was open is what a second tab does instead: route its storage calls into the first tab's worker, or be refused. **Refused.**

| Platform | `multiInstance` | Why |
|---|---|---|
| Web | `false` | Exactly one live tab per store. A second tab never opens storage. |
| Electron | `false` | Unchanged. |
| Native | `false` | Unchanged. |

Era 1's ruling is **superseded, not overturned on its merits**. Its stated purpose was that cashiers open several tabs and do unexpected things, so we support it rather than forbid it — that is, *do not lose data* when they do. A take-over screen satisfies that: the second tab never opens a second storage, so #1049's route (two tabs each repairing the same file) cannot exist. What is given up is two live tills, which was never the thing asked for, and it is given up for durability plus roughly a hundredfold on the sync hot path (#2143, #2144).

The topology that replaces it, in one line each — full reasoning in #2146's resolution:

- **Take-over is cooperative.** The second tab asks over BroadcastChannel; the holder closes its databases, terminates its worker, releases the Web Lock and parks on the same "POS is open in another tab" screen. Stealing the lock is wrong: a stolen holder keeps running and keeps the files.
- **Refusal is bounded** — only while a payment capture or a storage write is in flight, then the handover proceeds anyway.
- **Recovery from a dead or wedged worker is a page reload**, because a dedicated worker is destroyed with its document. No in-place restart, no storage epoch (#891).
- **`multiInstance: false` ships inside the engine migration**, never before it.

## Guards

- `index.web.ts` states `multiInstance` explicitly with a comment pointing at this section. No silent rxdb default.
- `adapters/storage/storage-engines.ts` declares the current engine and the `multiInstance` each engine requires. It is the one place either is written down.
- `adapters/default/multi-instance-ruling.test.ts` pins the **pair** — the flag against the current engine — for all three platforms, and fails with this rationale. Changing the engine without the flag goes red, and so does the reverse.
- Any PR that touches `params.multiInstance` in `opfs-targeted-recovery.mjs`, the flag in an adapter, `storage-engines.ts`, or `patch-rxdb-premium-changelog-identity.mjs` must cite #1057, #1987, #2146 and this section.
