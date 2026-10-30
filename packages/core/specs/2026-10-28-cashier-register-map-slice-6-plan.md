# Cashier/Register Map — Slice 6 (client): Carry the Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switching store can take the drawer along: the confirm offers **Take the drawer with you**, one server act closes this register at expected and opens Y's register with the cash as its float, the client adopts both rows and then switches; the closure is badged _Carried to Y_, the new register's Float step says where the cash came from, and the way back offers **Take the drawer back**.

**Architecture:** The plugin half is live (wcpos/woocommerce-pos#2481, schema 14): `POST sessions/{id}/carry { to_register_id, closure_id, session_id, at }` answers `{ closure, session }`. The client adds one command, `carryDrawer`, in `packages/query/src/register-session/carry.ts`: it posts, adopts the closed source row into this store's sessions, records the new session as the target register's live record and binds Y's store to that register in the register document, and writes a device-local _carried-from_ note (`store_id`, `store_name`, `register_id`, `closure_id`) beside the new session so the Float step and the way back can name the source without a server read. The confirm's store case gains a `RadioGroup` body with the § 4.9 guards; `user-sheet` runs the carry before `handleSwitchStore` and stops on failure. Schemas gain the four server fields additively.

**Tech Stack:** React Native + Expo (web, electron, native), RxDB collections in `@wcpos/database`, `@wcpos/query` register-session module, `@wcpos/components` `RadioGroup`, Jest with `@testing-library/react` (`--maxWorkers=2`).

**Spec:** `packages/core/specs/2026-10-28-cashier-register-map-design.md` § 4.6 (the store row and _Take the drawer with you_), § 4.9 (the two invariants), § 5 slice 6. Plugin plan: wcpos/woocommerce-pos `docs/superpowers/plans/2026-10-29-carry-the-drawer.md`.

## Global Constraints

- Budget: ≤ 350 added production lines (tests, snapshots, locale JSON, docs, the two migration strategies excluded). Stop at the budget.
- Copy in `packages/core/src/contexts/translations/locales/en/core.json` with literal `t()` keys (the i18n ratchet refuses computed keys). New keys: `register.take_drawer` "Take the drawer with you", `register.take_drawer_hint` "Closes {register} at expected and opens {target} with it as the float", `register.take_drawer_back` "Take the drawer back", `register.leave_drawer` "Leave it open here", `register.send_sales_first` "Send {count} sales first", `register.carried_to` "Carried to {store}", `register.carried` "Carried", `register.carried_from` "carried from {store}", `common.carry_failed` "The drawer could not be carried. Nothing has changed."
- No new env vars, no feature flags, no retries, no outbox entry for the carry (it is a direct act with a client-minted replayable pair of ids, like `approve-sheet.tsx`'s `http.post`).
- Every surface showing or acting on drawer money reads `figuresPending` (§ 4.9 #1) and the carry reads `unsyncedCount` (§ 4.9 #2).
- Test IDs: `switch-confirm-carry` (the radio group), `switch-confirm-carry-take` and `switch-confirm-carry-leave` (the options), `switch-confirm-carry-reason` (the disabled reason text), `register-panel-float-source`, `closure-badge-${row.id}` (existing).
- Lint: `pnpm exec eslint` and `pnpm exec prettier --check` on every changed file; `pnpm -C packages/core exec tsc --noEmit -p .`, the same in `packages/query`, `packages/database` and `apps/main` (`NODE_OPTIONS=--max-old-space-size=6144`).

## Review Focus

1. **The carry succeeds and the switch fails** (`switchStore` throws, or `IncompleteStoreSessionError`): the device already recorded Y's register live and Y's binding; the cashier is still in X with X's session closed. `handleSwitchStore` already toasts; the register document's state is correct for the next attempt to switch (Y's register shows open with the carried float). Pinned by a `user-sheet` test: carry resolves, `handleSwitchStore` returns false → the sheet stays open, the carry ran once, no second carry on a second confirm (the ids are minted per confirm; the server replays by closure id only when both ids match, so the second attempt is a fresh act that the server refuses 409 because X's session is closed → the toast says so). Make the second attempt impossible instead: after a successful carry the sheet's store rows are held (`busy`) until the switch resolves.
2. **The carry fails** (409 `wcpos_session_already_open`, 400, network): nothing changes locally, `common.carry_failed` toast, the confirm closes, no switch (spec: _a failure before the switch leaves everything as it was_).
3. **Offline:** the store rows are already held offline (`!online`), so the carry never runs offline; the radio is never rendered when `!online` (pin: the hold wins).
4. **`figuresPending` or `unsyncedCount > 0`:** the carry option is disabled with its reason and **Leave it open here** is selected; confirm still switches without a carry.
5. **A blind cashier:** the carry response's closure omits `counted`/`expected`; the client never reads figures from it (adoption only); the Float step shows _carried from X_ without an amount when `blind`.

---

### Task 1: Schemas carry the four server fields

**Files:**

- Modify: `packages/database/src/collections/schemas/register-sessions.ts` (version 3 → 4; properties `float_source: { type: ['string', 'null'] }`, `carried_from_closure_id: { type: ['string', 'null'], maxLength: 36 }` after `counting_by`)
- Modify: `packages/database/src/collections/schemas/closures.ts` (version 1 → 2; properties `reason: { type: ['string', 'null'] }`, `carried_to_register_id: { type: ['string', 'null'], maxLength: 36 }`)
- Modify: `packages/database/src/collections/index.ts` (`register_sessions` strategies gain `4: (oldDoc) => oldDoc`; `closures` gain `2: (oldDoc) => oldDoc`)
- Test: `packages/database/src/collections/closure-migration.test.ts` (extend the existing pattern: a v3 session row and a v1 closure row migrate unchanged, the new fields read `undefined`)
- Test: `packages/query/tests/register-session/queue.test.ts` — `adoptSessionRow` keeps `float_source` and `carried_from_closure_id` from a server row (today `pruneToSchemaProperties` would drop them)

**Interfaces:**

- Produces: `RegisterSessionRow.float_source?: string | null`, `RegisterSessionRow.carried_from_closure_id?: string | null`, `ClosureRow.reason?: string | null`, `ClosureRow.carried_to_register_id?: string | null` (types derive from the schemas).

- [ ] Steps: write the two tests → run (`pnpm -C packages/database exec jest --maxWorkers=2 --coverage=false src/collections/closure-migration.test.ts`; `pnpm -C packages/query exec jest --maxWorkers=2 --coverage=false tests/register-session/queue.test.ts`) → implement → run green → commit `feat(database): sessions v4 and closures v2 carry float_source, carried_from_closure_id, reason, carried_to_register_id`.

### Task 2: The device remembers where a carried drawer came from

**Files:**

- Modify: `packages/query/src/register-session/register-document.ts`
- Modify: `packages/query/src/register-session/index.ts` (re-export the three functions)
- Test: `packages/query/tests/register-session/register-document.test.ts`

**Interfaces:**

- Produces, on `RegisterDocument.sites[siteUuid].registers[registerId]`: `carried_from?: { session_id: string; closure_id: string; store_id: number; store_name: string; register_id: string }`.
  - `recordCarriedFrom(userDB, siteUuid, registerId, note: { session_id; closure_id; store_id; store_name; register_id }): Promise<void>` writes it.
  - `readCarriedFrom(siteUuid, registerId, sessionId): { store_id; store_name; register_id; closure_id } | null` reads it only when `note.session_id === sessionId` (a later session on that register has no source).
  - `bindStoreRegister(userDB, siteUuid, storeId: number, register: { id: string; name: string }): Promise<void>` writes `bindings[String(storeId)]` only (never the site's current `register_id`, which `bindRegister` also moves; the switch that follows reads the binding).
- `recordLiveSession(…, live)` leaves `carried_from` alone; `recordLiveSession(…, null)` leaves it alone too (the note dies with the session id check).

- [ ] Steps: tests (write, read for the matching session, `null` for another session, `bindStoreRegister` writes the binding and leaves `register_id` as it was) → run (`pnpm -C packages/query exec jest --maxWorkers=2 --coverage=false tests/register-session/register-document.test.ts`) → implement → green → commit `feat(query): the register document remembers where a carried drawer came from`.

### Task 3: `carryDrawer`

**Files:**

- Create: `packages/query/src/register-session/carry.ts`
- Modify: `packages/query/src/register-session/index.ts` (export `carryDrawer`, `CarryTarget`)
- Test: `packages/query/tests/register-session/carry.test.ts` (new; mock `http` like `queue.test.ts` does, real in-memory `storeDB` and `userDB` from the test helpers those tests use)

**Interfaces:**

- Consumes: `SessionHttp` (`queue.ts`), `adoptSessionRow` (`queue.ts`), `recordLiveSession`, `recordCarriedFrom`, `bindStoreRegister`, `mintUuid` (`register-document.ts`).
- Produces:

```ts
export type CarryTarget = {
	store: { id: number; name: string };
	register: { id: string; name: string };
};
export async function carryDrawer(deps: {
	http: SessionHttp;
	storeDB: StoreDatabase; // the CURRENT store's database (its register_sessions)
	userDB: UserDatabase;
	siteUuid: string;
	sessionId: string; // the open source session
	fromRegisterId: string;
	from: { id: number; name: string }; // the current store
	to: CarryTarget;
	at?: string; // ISO; default new Date().toISOString()
}): Promise<{ closureId: string; sessionId: string }>;
```

Behaviour:

1. Mint `closureId` and `newSessionId` with `mintUuid()`; `POST sessions/${sessionId}/carry` with `{ to_register_id: to.register.id, closure_id, session_id, at }`. Any error propagates (the caller toasts); nothing below runs.
2. The response carries the closure and the NEW session, not the closed source row, so close the source locally: `storeDB.register_sessions.findOne(sessionId)` → `incrementalPatch({ status: 'closed', closed_at_gmt: closure.closed_at_gmt, closed_by: closure.closed_by, closure_id: closure.id, server_status: 'closed', ...synced })` (`synced` from `queue.ts`). The next cycle's refresh reconciles the rest.
3. `markCountingHere(userDB, siteUuid, fromRegisterId, true)` then `recordLiveSession(userDB, siteUuid, fromRegisterId, null)`: this device closed it, and `recordLiveSession(…, null)` writes `closed_elsewhere` for a live record without the count mark (slice 5), so the mark goes on first. The test pins: after a carry, `readClosedElsewhere(siteUuid, fromRegisterId)` is `null`.
4. `recordLiveSession(userDB, siteUuid, to.register.id, { session_id: session.id, status: 'open', opened_at_gmt: session.opened_at_gmt, opened_by: { id, name } from session.opened_by (the server row carries the id; name from the current cashier), acknowledged: true, expected_float: session.expected_float ?? null, counted_float: session.counted_float ?? null, business_day: session.business_day ?? null })`.
5. `recordCarriedFrom(userDB, siteUuid, to.register.id, { session_id: session.id, closure_id: closure.id, store_id: from.id, store_name: from.name, register_id: fromRegisterId })`.
6. `bindStoreRegister(userDB, siteUuid, to.store.id, to.register)`.
7. Return `{ closureId: closure.id, sessionId: session.id }`.

- [ ] Steps: tests (happy path asserts the POST body, the local source row closed with the closure id, the live record on the target, the carried-from note, the binding; a rejected POST leaves the source row, the live record and the bindings untouched and rethrows) → run → implement → green → commit `feat(query): carryDrawer — one server act, both rows adopted, the way back remembered`.

### Task 4: The confirm offers the carry

**Files:**

- Modify: `packages/core/src/screens/main/pos/cart/switch-confirm.tsx`
- Modify: `packages/core/src/contexts/translations/locales/en/core.json` (the keys above)
- Test: `packages/core/src/screens/main/pos/cart/switch-confirm.test.tsx`

**Interfaces:**

- `SwitchRequest`'s store member becomes `{ kind: 'store'; store: ReadonlyStoreRecord; carry?: CarryTarget }`: the confirm calls `onConfirm({ ...request, carry })` with `carry` set only when the radio is on **Take** and enabled.
- Body for the store case (only when `session?.status === 'open'` on this device's register, `online`, and Y's register is known and closed — `target` found and `!target.session`): `RadioGroup value={choice} onValueChange` with `RadioGroupOption value="take"` (label `register.take_drawer`, or `register.take_drawer_back` when `readCarriedFrom(site, binding.registerId, session.id)?.store_id === request.store.id`; description `register.take_drawer_hint` with `register` = this register's name, `target` = Y's register name; `disabled` with the reason rendered under it in `switch-confirm-carry-reason` when `figuresPending` (`register.figures_after_sync`) or `unsyncedCount > 0` (`register.send_sales_first` with `count`)) and `RadioGroupOption value="leave"` (`register.leave_drawer`). Default `choice` is `'take'` when enabled, else `'leave'`; a disabled take forces `'leave'`.
- When Y's register is open elsewhere or unknown, no body (the description already says so).

- The suite mocks `@wcpos/components/radio-group` the way `packages/core/src/screens/main/settings/theme.test.tsx` lines 27–60 do (the real primitive's label needs a DOM React the harness does not provide): `RadioGroup` renders its children under a context, `RadioGroupOption` renders a `<button data-testid={testID} aria-checked disabled>` with the label and description text.

- [ ] Steps: tests (the radio renders only for a known closed target with an open session here and online; default take → `onConfirm` carries `carry: { store, register }`; leave → no `carry`; `figuresPending` and `unsyncedCount: 2` each disable take with their reason and confirm without carry; the back label when the carried-from note names Y; no radio offline or when Y's register has a session) → run (`pnpm -C packages/core exec jest --maxWorkers=2 --coverage=false src/screens/main/pos/cart/switch-confirm.test.tsx`) → implement → green → commit `feat(register): Switch to Y offers Take the drawer with you`.

### Task 5: The sheet carries, then switches

**Files:**

- Modify: `packages/core/src/screens/main/pos/cart/user-sheet.tsx` (the `'store'` case of `run`)
- Modify: `packages/core/src/screens/main/pos/cart/use-switch-store.ts` (nothing, unless the overlay needs to show during the carry: show `isSwitching` for the carry too by lifting a `busy` flag — prefer the sheet's existing `busy`)
- Test: `packages/core/src/screens/main/pos/cart/user-sheet.test.tsx`

**Interfaces:**

- In `run`, case `'store'`: if `request.carry`, `await carryDrawer({ http: useRestHttpClient() (hook at the top), storeDB, userDB, siteUuid: site.uuid, sessionId: session.id, fromRegisterId: binding.registerId, from: { id: store.id, name: store.name }, to: request.carry })` inside `act`; on throw: `Toast.show({ text1: t('common.carry_failed'), type: 'error' })`, log `ERROR_CODES.REGISTER_CARRY_FAILED` (add to `packages/utils/src/logger/error-registry.json`, in the register section beside `REGISTER_CLOSE_REFUSED`, and run `pnpm generate:error-codes`), return without switching. On success proceed to `handleSwitchStore(request.store)`.

- [ ] Steps: tests (confirm with carry → `carryDrawer` called with the target, then `handleSwitchStore`; carry rejects → toast, no switch, sheet open, rows re-enabled; confirm without carry → no `carryDrawer`) → run → implement → green → commit `feat(register): the store switch carries the drawer first and stops when the carry fails`.

### Task 6: The badges and the Float step

**Files:**

- Modify: `packages/core/src/screens/main/reports/closures/closure-list.tsx` (badge: `row.reason === 'store_switch'` → `register.carried_to` with `store` = `row.breakdowns?.labels?.carried_to_store_name` when present, else `register.carried`; it wins over `reports.corrected`, loses to `register.unsynced`)
- Modify: `packages/core/src/screens/main/reports/closures/closure-body.tsx` (`ClosureHeading`: the same badge beside the title, `Badge tinted variant="info" size="sm"`, testID `closure-carried-badge`)
- Modify: `packages/core/src/screens/main/pos/cart/register-panel.tsx` (the Float `DerivationStep`: `detail` = `register.carried_from` with `store` from `readCarriedFrom(site.uuid, binding.registerId, session.id)?.store_name` when `session.float_source === 'carried'`; falls back to `register.carried` when the note is absent (another device carried it); `figuresPending` detail still wins; testID `register-panel-float-source` on the detail text)
- Test: `closure-list.test.tsx` (or the closures `index.test.tsx` that renders rows), `closure-body.test.tsx`, `register-panel.test.tsx`

- [ ] Steps: tests → run → implement → green → commit `feat(register): a carried closure is badged Carried to Y; the Float step says where the cash came from`.

### Task 7: Ledger and docs

- Modify: `packages/core/src/screens/main/pos/cart/LEDGER.md`: one line, numbered after the last, for the carry (evidence: the test names above) — platform: all.
- Commit `docs(core): ledger — the carry`.
