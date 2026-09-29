# PR 3B of monorepo#2242 — one live tab: the protocol, the parked-tab screen, the gate

Read `PR3A-NOTES.md` (what the previous run landed and the seams it left), then
`INVESTIGATE-PR3-FINDINGS.md` §3, §5, §6, then `packages/database/src/adapters/default/README.md`.
The spec is issue #2242; the binding sentences are quoted below.

**Do not push. Do not open or edit a PR.** Commit on this branch as you go (small commits, one
concern each, conventional prefixes, no co-author trailers). No `git fetch`/`pull`/`rebase`.

Stakes: **high** (a takeover mid-payment is a money path). Budget: about 450 added non-test lines.
Past 1.5× that, stop and write `PR3B-STOP.md`.

**Write the protocol tests first** (item 2's list), watch them fail, then implement.

## Topology decision (made; do not re-open)

`opfs-sahpool` is **one pool per origin**, and the user database opens before any store identity
exists, so the unit of ownership is the ORIGIN, not the store: **one live tab per site**. Lock and
channel names are constants without a store suffix. Say this in the module comment; it is why the
spec's "a Web Lock for the store" is implemented per origin.

## 0. Pool growth (small, first commit)

PR 3A left `SQLITE_POOL_INITIAL_CAPACITY = 64` as a hard ceiling and asked for a policy. Policy:
**grow on demand.** In `scripts/sqlite-worker-entry.mjs`'s `openDb`, before opening, if
`pool.getFileCount() + SQLITE_POOL_FILES_PER_DATABASE > pool.getCapacity()` then
`await pool.addCapacity(SQLITE_POOL_GROWTH_STEP)` (constants beside the others in `sqlite-pool.ts`:
files per database = 2 — the file and its `-wal`; growth step = 16 with the reason: one
`addCapacity` call is one batch of sync-access-handle creations, the cost the Windows cold-open
note in #2242 attributes to handle acquisition, so grow in batches rather than per open). Reduce
`SQLITE_POOL_INITIAL_CAPACITY` to what a fresh till needs plus one growth step (state the
arithmetic). Prove it in `scripts/sqlite-worker-probe.mjs`: open more databases than the initial
capacity holds and read back from the last one.

## 1. The live-tab module — `packages/database/src/live-tab/live-tab.web.ts` (+ `index.ts`, dependency-free)

Pure state machine over injected `locks` (Web Locks), `channel` (BroadcastChannel factory) and a
clock, so Jest can drive it with fakes; the web adapter wires the real ones. Exports:

```ts
type LiveTabState =
  | { kind: 'acquiring' }
  | { kind: 'live' }
  | { kind: 'parked'; reason: 'another-tab-live' | 'worker-lost' }
  | { kind: 'taking-over'; deferral: null | 'payment' | 'write' | 'no-answer' };
createLiveTab(deps): { state$: Observable<LiveTabState>; getState(); takeOver(): void; park(reason): void; dispose(): void }
holdLiveTab(reason: 'payment' | 'write'): () => void   // the holder's busy registry
```

Constants (named, commented with the reason, no env vars): `LIVE_TAB_LOCK_NAME = 'wcpos-live-tab'`,
`LIVE_TAB_CHANNEL_NAME = 'wcpos-live-tab'`, `TAKEOVER_ANSWER_TIMEOUT_MS = 3_000` (spec: "if nobody
answers within a few seconds the requesting tab tells the user to close the other tab"),
`TAKEOVER_DEFER_CEILING_MS = 15_000` (spec: "past a ceiling proceeds anyway" — long enough for a
card capture round trip, short enough that one wedged terminal cannot lock the store out of the
browser).

Behaviour (the spec, sentence by sentence):

- **Boot:** `navigator.locks.request(LIVE_TAB_LOCK_NAME, { ifAvailable: true }, …)`. Granted → `live`
  (the callback holds the lock for the tab's life by returning a promise resolved only by
  `dispose()`/handover). Not granted → `parked: another-tab-live`. Web Locks absent (old browser,
  restricted context) → `live` (nothing to coordinate; log once). A queued request is NEVER stolen
  (`steal: true` is forbidden — a stolen holder keeps the files and the new open fails).
- **Take over (requester):** posts `{ type: 'takeover-request', requestId }` on the channel, enters
  `taking-over: null`, and queues a normal (non-`ifAvailable`) lock request. Holder's ack
  `{ type: 'takeover-ack', requestId, deferral: null | 'payment' | 'write' }` → `taking-over: <deferral>`
  (the reason is shown to the user). No ack within `TAKEOVER_ANSWER_TIMEOUT_MS` → `taking-over: 'no-answer'`
  (the screen says close the other tab); the queued lock request stays queued so a closed tab
  hands over anyway. Lock granted (whenever) → `live`.
- **Handover (holder):** on `takeover-request`: if `holdLiveTab` has an active hold, ack with its
  reason and wait until all holds release OR the ceiling passes; else ack `null`. Then call the
  injected `onHandover()` (the app's teardown: dispose the engine, close every open RxDatabase,
  `terminateStorageWorker()`), release the lock, post `{ type: 'takeover-released', requestId }`,
  and enter `parked: another-tab-live`. A second `takeover-request` while handing over joins the
  same handover (one ack each). The holder never refuses.
- **Worker lost (holder):** `park('worker-lost')` → `parked: worker-lost` and release the lock (a
  dead worker's tab must not keep the pool). Wired from `onStorageWorkerLost` and from the
  wrapper's `worker-lost` degradation (PR 3A's `reportStorageWorkerLost` path): subscribe to
  `degradedStorage$` for `kind: 'worker-lost'` on web. Recovery is ONLY reload (spec: "never an
  in-place restart"; WebKit poisons OPFS for the browsing context on an ungraceful worker stop).
- `pagehide`/`beforeunload`: nothing to do — the lock and the worker die with the tab; state it.

## 2. Protocol tests — `packages/database/src/live-tab/live-tab.web.test.ts` (write FIRST)

Fake `locks` (a queue honouring `ifAvailable` and grant order), fake channel (an in-memory bus
between two `createLiveTab` instances), fake timers. Cases, each named as below:

1. `the first tab is live and the second parks` — ifAvailable refused → parked.
2. `takeover: the holder acks, tears down, releases; the requester becomes live and the holder parks`
   — assert order: ack before `onHandover`, `onHandover` before release, release before the
   requester's `live`, holder ends `parked: another-tab-live`.
3. `takeover defers while a payment is held and the requester sees the reason` — a `holdLiveTab('payment')`
   active: ack carries `payment`; requester `taking-over: 'payment'`; releasing the hold completes
   the handover.
4. `takeover proceeds at the ceiling with the hold still active` — advance `TAKEOVER_DEFER_CEILING_MS`;
   handover completes; the hold's release afterwards is a no-op.
5. `no answer within the timeout tells the requester to close the other tab, and a later release still hands over`
   — no holder on the bus; after `TAKEOVER_ANSWER_TIMEOUT_MS` → `'no-answer'`; then the fake lock
   frees → `live`.
6. `the lock is never stolen` — assert the fake's request options never include `steal`.
7. `worker loss parks the holder and frees the lock for the next tab`.
8. `without Web Locks the tab is live` and `dispose releases the lock and closes the channel`.
9. `a second takeover request during a handover gets its own ack and the same handover`.

## 3. The parked-tab screen — `apps/main/components/parked-tab.tsx` (web only)

Spec: "The parked-tab screen serves three states with one component: another tab is live (Take
over here), this tab's worker died (Reload), a handover is in progress (waiting, with the deferral
reason)." It renders ABOVE every provider (before the user database can open), like
`ClearLocalDataBlockedScreen` and `RootError` — so: **web only**, no `useT`, no theme provider.

Use the state block from the feedback-states design (roadmap#308): one line icon at 2.2× the font
size, muted; one title line, foreground, weight 500; an optional one-line description, muted; at
most one action row. Try `EmptyState` from `@wcpos/components/empty-state` (kind `failed` for
worker-lost, `empty` with an explicit icon for the others; `size: 'surface'`; centred full-screen
in a `bg-background` view). It is styled with `global.css` semantic tokens, which the web page
carries whether or not the theme provider mounted; verify in the probe (item 6) that it renders
with the default theme and in dark mode; if it cannot render outside the providers, fall back to
the plain React Native style precedent in `clear-local-data-on-startup.tsx` and say so in the
notes. Copy (Paul reviews these live; keep them exactly, sentence case, no error codes in titles):

| state | title | description | action (testID) |
|---|---|---|---|
| `parked: another-tab-live` | The POS is open in another tab | Only one tab can run the register. | **Take over here** (`parked-tab-take-over`) |
| `taking-over: null` | Taking over… | Waiting for the other tab to hand over. | — (button disabled, same testID) |
| `taking-over: 'payment'` | Taking over… | Waiting for the other tab to finish a payment. | — |
| `taking-over: 'write'` | Taking over… | Waiting for the other tab to finish saving. | — |
| `taking-over: 'no-answer'` | The other tab isn't answering | Close it, or reload it, to continue here. | — |
| `parked: worker-lost` | Local database unavailable | Reload to keep selling. | **Reload the app** (`parked-tab-reload`, calls `reloadApp()`) |

Root testID `parked-tab` with `dataSet.state` = the state kind (and deferral) so the E2E spec can
assert it. Strings: the screen renders before translations exist; put the English in a single
`PARKED_TAB_COPY` constant in the component with a comment saying why it is not in `core.json`
(the catalogue loads from the user database, which a parked tab must never open) — do NOT add
`t()` keys for strings the screen cannot translate. Touch target ≥ 44 pt for the button; no hex
colours if `EmptyState` renders; every element with a stable `testID`.

## 4. The gate — `apps/main/app/_layout.tsx`

Findings §6: the earliest safe place is above `MerchantRootLayout`, before startup clearing and
hydration, because the clear-on-startup path calls `clearAllDB()` and hydration opens the user
database — both need the pool. Add `LiveTabGate` (web only; a no-op passthrough on other
platforms via a `.web.tsx` split or `Platform.OS`): creates the live tab once per page (module
singleton, real `navigator.locks` / `BroadcastChannel`), renders `ParkedTab` for `parked` and
`taking-over`, renders children only while `live`. When the state leaves `live` (handover or
worker loss) the children UNMOUNT — that is the teardown's first step; `onHandover` then disposes
the engine and closes the databases: find the existing disposal paths (`create-app-engine.ts`'s
dispose, the database package's open-database registry / `clear-all-db.web.ts`'s close loop) and
reuse them; do not write a second close loop. After a handover the old tab stays on the parked
screen; **Take over here** on it reverses the roles through the same protocol.

`holdLiveTab('write')`: hold while a `bulkWrite` is in flight — wire it in the web adapter around
the wrapper's pending-write tracking (PR 3A's `STORAGE_WRITE_DEADLINE_MS` machinery already counts
pending writes; hold from first pending to zero pending). `holdLiveTab('payment')`: hold from the
moment a checkout capture starts until it settles — find the capture window in
`packages/core/src/screens/main/pos/checkout/tender/use-tender-flow.ts` and
`checkout/hooks/use-checkout-session.ts` (findings §5 lists the lines) and hold across the awaited
capture only; import the hold through the database package's public index so core stays
platform-neutral (the non-web implementation of `holdLiveTab` is a no-op returning a no-op).

## 5. Tests beyond the protocol

- `apps/main/components/parked-tab.test.tsx` (RNTL, web): each state renders its title,
  description and action; the take-over button is disabled while taking over; Reload calls
  `reloadApp`.
- `apps/main/app/_layout` gate test: children do not render while parked; render while live; the
  live tab singleton is created once.
- `packages/database` web adapter test: a pending `bulkWrite` holds `'write'` and releases on
  settle.
- The two-page Playwright spec, `apps/main/e2e/live-tab.spec.ts` (spec: "a Playwright spec with two
  pages in one browser context covering the four transitions: second tab parked, takeover
  completes and the first tab parks, deferral while a write is in flight then proceeds at the
  ceiling, no answer within the timeout"). Use the suite's fixtures (`authenticatedTest`), testIDs
  only (never text selectors), `data-table-loaded-count` for readiness (see `catalogue-readiness.ts`).
  For the deferral case, hold a write from page A via `page.evaluate` against an exposed test hook
  (`globalThis.__wcposLiveTabHold`, web only, guarded by `__DEV__ || E2E`) rather than racing a real
  checkout; for the no-answer case, freeze page A with `context.newCDPSession(page).send('Emulation.setScriptExecutionDisabled', { value: true })`
  (or route-block its channel — pick what works and comment it). It runs against a live store
  (dev-next) and I will run it after the plugin ships the worker; you cannot run it — write it
  carefully and typecheck it.

## 6. Probe

Extend `scripts/sqlite-worker-probe.mjs` (or add `scripts/live-tab-probe.mjs`) with a headless
two-page run against the static `apps/main/public` + a minimal page bundle that mounts the real
`LiveTabGate`… if mounting the app gate outside Metro is impractical, instead drive
`createLiveTab` in two real pages with real `navigator.locks`/`BroadcastChannel` via a tiny esbuild
bundle, asserting the transitions and that the second page's worker never opens the pool (no
`NoModificationAllowedError`). Paste the output into `PR3B-NOTES.md`.

## Tests to run

`pnpm --filter @wcpos/database test -- --maxWorkers=2`, `pnpm --filter @wcpos/core test -- --maxWorkers=2`,
`pnpm --filter main test -- --maxWorkers=2`, `node --test scripts/*.test.mjs`, `pnpm typecheck --force`,
lint on changed files. One suite at a time. Record commands and counts in `PR3B-NOTES.md`.
Mutation check: remove the ack-before-teardown ordering and show test 2 goes red.

## Rules

- No env vars. No SharedWorker, no BroadcastChannel relay of storage, no lock stealing, no in-tab
  worker restart, no heartbeat over rxdb's `custom` channel.
- Do not touch `packages/sync-engine`, `packages/sync-core`, schemas, or native code paths.
- Every interactive element carries a stable `testID`; no new hex colour unless the fallback
  precedent is forced (say so).
- Finish with `PR3B-NOTES.md`: changes by file, test log, what you could not verify, and the exact
  copy strings as shipped.
