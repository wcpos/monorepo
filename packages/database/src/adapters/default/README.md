Storage adapters for each platform.

## Web - SQLite SAHPool

The web adapter runs premium SQLite wasm in a dedicated module worker over the OPFS SAHPool VFS, with exclusive locking, WAL, and `synchronous=NORMAL` (#2242, #2144).

## Electron - SQLite IPC

The Electron renderer uses an IPC bridge to SQLite in the main process.

## Native - Expo SQLite

The native adapter runs premium SQLite over `expo-sqlite` in `Documents/wcpos-sqlite`, with WAL and `synchronous=NORMAL`. This root is separate from both retired engines, so the SQLite cutover starts fresh without a database generation bump. Legacy-device purge, clear and measurement still account for old storage roots.

## Decision: `multiInstance` is a consequence of the storage engine

**Status:** ruled, standing, in two eras.

- **Era 1 — `opfs-filesystem` (previous era, retained on `main` / 1.10.x).** Owner ruling 2026-08-06, implemented by #1057 (closes #1045, #1055, #1050-web). Supersedes #1049 and wcpos/electron#325. **Web is `true`.**
- **Era 2 — `sqlite-sahpool` (current `next` / 2.0 adapter).** Owner ruling 2026-09-21, wayfinder #2146 under map #2137; implemented by #2242 and #2271. **Web is `false`, switched with the engine.**

The two values are pinned as a **pair**: `adapters/storage/storage-engines.ts` declares the current engine and the `multiInstance` each engine requires, and `multi-instance-ruling.test.ts` asserts them together. Change both halves or neither. Never backport SQLite's flag to the filesystem-era lane.

## Era 1 — `opfs-filesystem`: historical web `true`

| Platform | `multiInstance` | Historical reason |
|---|---|---|
| Web | `true` | Multiple live tabs shared local data. |
| Electron | `false` | Every window proxied over IPC to one main-process storage. |
| Native | `false` | One storage per app process. |

In the filesystem era, web tabs shared a coherent read view over BroadcastChannel. One tab owned the write plane through an exclusive Web Lock. The engine-scope databases had a degraded single-writer fallback when Web Locks were unavailable; user and store databases used `true` unconditionally. This is historical architecture, not the current SQLite host. The temporary database remains in-memory and `multiInstance: false` on every platform.

### Why `false` was not a filesystem repair

The old OPFS engine released its access handles between operations, allowing workers from different tabs to interleave on the same files. With `multiInstance: false`, each tab could repair index rows without receiving the other's changelog operations. #1049 found stale-peer cleanup and broadcast races on that route; #1057 addressed ownership instead of flipping the flag.

The historical Sentry incidents 2JZ/2KB reported multi-instance repair refusals. Those refusals were not evidence that the adapter flag should be `false`. #1987 and #1995 patched changelog identity and sibling-index checks, with Electron companions #437/#438 and the `main` backport #2002. They did not supply ordering for out-of-order revisions of the same document. The filesystem patchers and targeted-recovery implementation are retired on `next`; this history is not SQLite repair guidance.

## Era 2 — `sqlite-sahpool`: one live web tab per origin

SQLite uses the official `@sqlite.org/sqlite-wasm` build on the `opfs-sahpool` VFS in one dedicated worker. SAHPool holds exclusive OPFS access handles for the origin, so a second worker cannot install the same pool. The current live-tab protocol parks the second tab before it opens storage; it does not route its reads or writes through the owner.

| Platform | `multiInstance` | Current reason |
|---|---|---|
| Web | `false` | Exactly one live tab per origin, including the user DB opened before store selection. |
| Electron | `false` | Renderer storage calls reach the main process over IPC. |
| Native | `false` | One storage per app process. |

The ownership gate, parked screen and cooperative takeover are implemented (#2271):

- **Takeover is cooperative.** The second tab asks over BroadcastChannel. The holder closes its databases, terminates its worker, releases the Web Lock and parks. The requesting tab must acquire ownership before opening storage; it never steals the lock.
- **Write holds are bounded by the 15-second takeover ceiling. Payment holds are never abandoned.** A payment must settle before handover, even if the write ceiling has elapsed.
- **Storage teardown is bounded at 10 seconds.** It runs after holds permit handover; this is not a deadline for abandoning a payment.
- **A dead or wedged worker requires a page reload**, not an in-tab worker restart or storage epoch.

The page constructs no Worker at import or metadata access. The first storage open lazily constructs premium's `mode: 'one'` client, which reuses one module worker across collection closes/reopens. Worker `error` and `messageerror` feed the degradation signal. The read/create watchdog terminates a condemned worker to release pool handles; `terminate()` itself emits no error. Termination does not prove that a pending write failed to commit.

The current contract gives up multiple simultaneously live tabs, not the requirement to protect data when users open another tab. Local write outcomes remain in-process. Generic JSON errors, worker-loss handling and COL21 ledger reattachment remain; the retired filesystem repair markers do not trigger ledger resets.

## Guards

- `index.web.ts` states `multiInstance` explicitly; no silent RxDB default.
- `adapters/storage/storage-engines.ts` records both eras and selects the current engine.
- `adapters/default/multi-instance-ruling.test.ts` pins the engine/flag pair and platform flags.
- Changes to an adapter's flag or `storage-engines.ts` must preserve the pair and cite #1057, #2146, #2242 and this Decision section.
