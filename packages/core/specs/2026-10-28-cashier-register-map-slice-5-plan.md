# Cashier/register map · slice 5 (the close, in one panel) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the close happens inside the register panel (§ 4.5): Close register pushes the count pane, Close & print pushes the written moment, Done closes the panel. The cart column loses its counting state: while this device counts, the cart stays with Pay held (*Counting the drawer*); while another till counts, the column shows the **Counting elsewhere** card; a register closed on another till says so on the Open register card. The empty cart's overdue Close register opens the panel on the count pane.

**Architecture:** `RegisterPanel` (slice 4, `pos/cart/register-panel.tsx`) already has a two-pane stack (`register` | `closure`); it grows to four (`+ count` | `written`). `RegisterCount` (`register-count.tsx`) keeps its state and its body and loses its shell: it becomes the count pane (the § 4.2 header with ‹, its body, a `DialogFooter`); `ClosureSheet` (`closure-sheet.tsx`) is replaced by the written moment (`closure-written.tsx`), which renders the Reports session's `ClosureHeading`/`ClosureBody` (§ 7, #3036) through one hook lifted out of `ClosurePanel`. `useRegisterSession` gains two derived facts (`countingElsewhere`, `closedElsewhere`) and the plugin's `counting_by` reaches the app through the sessions schema. The register-panel request (slice 2) learns which pane. No new primitive in `@wcpos/components`.

**Tech Stack:** React Native + Web, `@wcpos/components` (`Dialog*`, `Notice`, `ToneDisc`, `Card`, `Button`), RxDB schema migration, Jest + Testing Library (jsdom).

**Spec:** `packages/core/specs/2026-10-28-cashier-register-map-design.md` § 4.5, § 4.7 (the closed-on-another-till Notice), § 4.9, § 7. Depends on slices 1 and 4 (merged: #3034, #3044, #3059) and the plugin PR for `counting_by` (wcpos/woocommerce-pos, `feat/session-counting-by`; `counting_started_at_gmt` already exists and is `counting_at`).

## Global Constraints

- Lane `next`; one PR, ≤ 500 added production lines (tests, strings, `.md`, snapshots excluded). Count with `git diff --numstat $(git merge-base origin/next HEAD) -- packages ':!*.test.*' ':!*.test-utils.tsx' ':!*.json' ':!*.md' ':!*.snap' | awk '{a+=$1} END {print a}'` after prettier. Moved code counts as added. Stop at the ceiling and report; more files or commits do not raise it.
- Jest from `packages/core` (and `packages/database` for Task 1): `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec jest --maxWorkers=2 --coverage=false <files>`; one jest process at a time; never the whole suite.
- Components only. The count pane's and the written moment's headers are the panel's recipe (slice 4: `DialogHeader className="flex-row items-center gap-3"`, a 44 pt leading element, `DialogTitle` + `DialogDescription`); a pushed pane's leading element is the ‹ `IconButton name="chevronLeft"` (as `ClosurePanel`'s pushed mode draws it), then the register disc. Footers are `DialogFooter` slots (`intent`, `secondary`), never a `Button` in a footer.
- Every string through `t('literal.key')`; new keys in `packages/core/src/contexts/translations/locales/en/core.json`, placed by hand and then `pnpm generate:error-codes` from the repo root (the catalogue test refuses a duplicate or misplaced key; slice 4 learned this). Plain words: till, drawer, float, count, close; never session, variance.
- `scripts/check-event-labels.mjs` reads every dotted quoted string under `services/register-session`: Task 2 adds none.
- `packages/core/src/seam.test.ts` runs with Task 2 (the new members are nouns: `countingElsewhere`, `closedElsewhere`, `countingBy`; never `update…`/`set…`).
- Test files that go: `closure-sheet.test.tsx` (its facts move to `closure-written.test.tsx`) — the PR's first push carries the `Test-Removal:` trailer naming it (monorepo-ci-guards).
- Feature detection of the plugin field is presence on the row: `session.counting_by` is `number | null | undefined`; `undefined` (older plugin) names nobody.
- § 4.9 rule 1 holds: Close register, the count pane's Close & print and the pane itself stay disabled by `figuresPending` (today's `count-close` `disabled` and the panel footer's `disabled` are kept, not loosened).

## Review Focus

1. A reload mid-count on this device: the session reads `counting` with `counting_here`; the panel must open on the count pane once (not on every render) — pinned in Task 4.
2. A count started on another till: the cart column shows the Counting-elsewhere card, Pay is not reachable, and the sheet's Register band names the counter only when `counting_by` is present — pinned in Task 6 (card) and Task 2 (name resolution).
3. Back to selling from the count pane via ‹ and via ×: both run `backToSelling`, the session returns to `open`, the panel closes on ×, returns to the register pane on ‹ — pinned in Task 3.
4. The written moment after a close that printed automatically vs one whose print failed: *✓ Printed* line vs the error line with **Print again** — pinned in Task 5.
5. A register closed on another till: the Open register card carries the Notice with the closer and the time, and NOT after a close this device made — pinned in Task 2 (the fact) and Task 6 (the card).

---

### Task 1: `counting_by` reaches the app

**Files:**
- Modify: `packages/database/src/collections/schemas/register-sessions.ts` (version 2 → 3, `counting_by: { type: ['number', 'null'] }` after `counting_started_at_gmt`), and `packages/database/src/collections/index.ts` ~line 628: the `register_sessions` creator's `migrationStrategies` gains `3: (oldDoc) => oldDoc` beside `1` and `2`.
- Modify: `packages/query/src/register-session/queue.ts` (~line 207: the merge of a server row keeps `counting_by` from the server, as `counting_started_at_gmt` is kept) and `session-store.ts` (~line 113: the local `counting` transition does NOT set `counting_by`; the server stamps it — the client's own device mark is `counting_here`).
- Test: `packages/database/src/collections/closure-migration.test.ts` (the existing migration test for sessions; add the v2 → v3 case there), `packages/query/tests/` queue test for the merged field.

**Interfaces:**
- Produces: `RegisterSessionRow.counting_by?: number | null`.

- [ ] **Step 1: Write the failing tests** — the migration keeps a v2 row and `counting_by` is absent (`undefined`) on it; the queue merge copies the server's `counting_by` onto the local row.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the two tests — PASS. `pnpm exec tsc --noEmit` from `packages/query` and `packages/database`.
- [ ] **Step 5: Commit** — `feat(query): counting_by on the session row (schema 3); the server's stamp survives the merge`.

### Task 2: the hook's two facts, the counter's name, the pane request

**Files:**
- Modify: `packages/core/src/services/register-session/use-register-session.ts` (the returned object, ~line 289)
- Modify: `packages/core/src/screens/main/pos/cart/register-panel-request.ts`
- Test: `use-register-session.test.tsx`, `register-panel-request.test.ts` (create if absent), `src/seam.test.ts`

**Interfaces:**
- Produces on `useRegisterSession()`:
  - `countingElsewhere: boolean` — `session?.status === 'counting' && !countingHere`.
  - `countingBy: { id: number; name: string | null; at: string | null } | null` — when `session?.status === 'counting'`: `id = session.counting_by` (null → `null` result), `name` resolved from the credentials list the hook already reads for the opener (the same lookup `Opener` in the panel does; `null` when unknown), `at = session.counting_started_at_gmt ?? null`. `null` when not counting or when the plugin sent no `counting_by`.
  - `closedElsewhere: { by: number | null; at: string } | null` — when `!session && lastClosure` and the device's live record (`readLiveSession(site.uuid, binding.registerId)` / the observed `live`) still names `lastClosure.id` as `session_id` and `!live.counting_here`: `{ by: lastClosure.closed_by, at: lastClosure.closed_at }`; otherwise `null`. (A close this device made cleared or counted its own mark; verify on `closeSession`'s path in `register-document.ts` ~line 166 and `recordLiveSession` and state in the test which call clears it.)
- Produces on the request module: `requestRegisterPanel(pane: 'register' | 'count' = 'register')`, `consumeRegisterPanelRequest(): 'register' | 'count' | null` (today it returns a boolean; its two callers — `user-sheet.tsx`'s `openRegister` and `register-bar.tsx` — read the new shape; `useRegisterPanelRequested` unchanged).

- [ ] **Step 1: Write the failing tests** — `countingElsewhere` true/false by `counting_here`; `countingBy` with and without the plugin field, with a known and an unknown user; `closedElsewhere` for the three cases (closed elsewhere, closed here, no closure); the request carries its pane and consumes once.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three suites and `src/seam.test.ts` — PASS; `node --test scripts/check-event-labels.test.mjs` from the repo root — PASS.
- [ ] **Step 5: Commit** — `feat(register): the hook says who counts elsewhere and who closed elsewhere; the panel request names its pane`.

### Task 3: the count pane

**Files:**
- Modify: `packages/core/src/screens/main/pos/cart/register-count.tsx` (`RegisterCount` becomes the pane: props `{ onBack: () => void; onClose: () => void; onClosed: (count: ClosureCount) => void }`)
- Modify: `packages/core/src/screens/main/pos/cart/register-panel.tsx` (pane `count`)
- Test: `register-count.test.tsx` (existing facts kept, the shell's assertions updated), `register-panel.test.tsx`

**Interfaces:**
- Consumes: `useOpenOrdersHandle(wpCredentials.id, store.id, binding.registerId)` + `React.useSyncExternalStore` for the open carts (as `switch-confirm.tsx` reads it), `DialogFooter`, `IconButton`, `ToneDisc`, `Notice`.
- Produces: `RegisterCount({ onBack, onClose, onClosed })` rendering header → body → footer with no `Dialog` of its own (the panel's `DialogContent` is the host, as the pushed `ClosurePanel` is).

The pane (§ 4.5 item 1): header — ‹ (`testID="count-back"`, runs `attempt(actions.backToSelling)` then `onBack()`), the register disc, `DialogTitle` `t('register.close_register_title', { name })` (exists: "Close {name}"), `DialogDescription` as the register pane's (store · open since HH:MM · age · opener; reuse the description the panel builds by lifting it into a small `registerDescription()` helper in `register-panel.tsx` exported for the pane, or pass it down as a prop — pick the prop: `description: string`). Body: today's `ScrollView` body without its first row (the title/Back to selling row goes: the header carries both) and without the trailing `Button`; the unsynced line becomes `Notice tone="info"` `t('register.unsynced_sales_closure_records', { count })` ("n sales not yet on the server — the closure will record them"); a new `Notice tone="warning"` `t('register.open_carts_wait', { count })` ("n carts still open · they wait for their cashier") when the open-carts count > 0, never a block. Footer: `DialogFooter size="lg" intent={{ label: needsManager ? approve_and_close : close_and_print, testID: 'count-close', loading: busy, disabled: <today's rule>, onPress: <today's press> }}`. × on the panel while the count pane shows runs `backToSelling` too: the panel's `close(false)` calls `actions.backToSelling()` when `pane === 'count' && session?.status === 'counting'` before `onOpenChange(false)` (through the panel's `attempt`).

In the panel: `pane: 'register' | 'closure' | 'count' | 'written'`; Close register's press becomes `attempt(async () => { await actions.startCounting(); setPane('count'); })` (no dismissal); `pane === 'count' && session` renders `<RegisterCount onBack={() => setPane('register')} onClose={() => close(false)} onClosed={(count) => { setWritten(count); setPane('written'); }} />` inside `DialogContent` (Task 5 renders `written`).

Strings: `register.unsynced_sales_closure_records` "{count} sales not yet on the server — the closure will record them", `register.open_carts_wait` "{count} carts still open · they wait for their cashier".

- [ ] **Step 1: Write the failing tests** — in `register-panel.test.tsx`: `Close register starts the count and pushes the count pane` (replaces `Close register starts counting and dismisses the panel`), `‹ on the count pane goes back to selling and to the register pane`, `× on the count pane goes back to selling and closes`; in `register-count.test.tsx`: the two Notices (with carts, without), the footer's verb; the existing count facts (denominations, variance, manager line, approve sheet) unchanged.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both suites — PASS.
- [ ] **Step 5: Commit** — `feat(register): the count is a pane pushed inside the panel; ‹ and × go back to selling`.

### Task 4: the panel opens on the count pane when it should

**Files:**
- Modify: `register-panel.tsx` (initial pane), `packages/core/src/screens/main/pos/cart/index.tsx` (the empty cart's overdue button; the one-shot after a reload), `register-bar.tsx` and `user-sheet.tsx` (`consumeRegisterPanelRequest()`'s new return)
- Test: `register-panel.test.tsx`, `index.test.tsx` (the cart column's register states; create it — the existing `open-orders-position.test.tsx` is about the open-orders band and stays), `register-bar.test.tsx`, `user-sheet.test.tsx`

Rules: when the panel opens (the `open` prop turns true) with `session?.status === 'counting' && countingHere`, it opens on `count`; otherwise on the requested pane (`consumeRegisterPanelRequest()` from the bar's claim: `'count'` from the empty cart's `checkout-close-register`, `'register'` otherwise). After a reload with a counting session and the device's own mark, the cart column requests the panel once on mount (`requestRegisterPanel('count')` + `setPanelOpen(true)` in a `React.useEffect` keyed on `session?.id`, with the `react-you-might-not-need-an-effect` disable comment the file already uses for one-shot external requests).

- [ ] **Step 1: Write the failing tests** — `opens on the count pane while this device is counting`, `the empty cart's Close register opens the panel on the count pane`, `a reload mid-count reopens the count pane once`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the four suites — PASS.
- [ ] **Step 5: Commit** — `feat(register): the panel opens on the count pane for this device's own count and from the empty cart's Close register`.

### Task 5: the written moment

**Files:**
- Create: `packages/core/src/screens/main/pos/cart/closure-written.tsx` (`ClosureWritten({ count, onDone })`)
- Modify: `packages/core/src/screens/main/reports/closures/closure-panel.tsx` — lift the document plumbing into `export function useClosureView(row: ClosureRow)` returning `{ doc, context, settled, touched, corrections, synced, printCount, reprint, error }` (the `useReceiptDocument` call, `persistSnapshot` and its effect, `deriveSettled`, `printedTo` + `reprint`); `ClosurePanel` calls it (no behaviour change; its suite stays green).
- Delete: `packages/core/src/screens/main/pos/cart/closure-sheet.tsx` and its test (facts move).
- Modify: `register-panel.tsx` (pane `written`)
- Test: `closure-written.test.tsx` (new), `closure-panel.test.tsx` (unchanged, must stay green)

**Interfaces:**
- Consumes: `ClosureHeading({ row, settled, blind, title, leading })`, `ClosureBody({ row, doc, settled, touched, corrections, blind, context, printCount })`, `readClosure(storeDB, { id, serverClosureId })` (`@wcpos/query/register-session`) to read the written row from the `ReadonlyClosureDocument` `closeSession` resolved (`use-last-closure.ts` maps one the same way), `useClosureView`.

The moment (§ 4.5 item 2): `ClosureHeading` with `title` `t('register.closure_n_written', { n })` and `leading` `<ToneDisc tone="ok" size="sm" />`; `ClosureBody`; under it `✓ Printed` (`Text className="text-success"`, `t('register.printed_on', { time })`, exists) when the auto-print recorded `printed_at`, else the print error line (`testID="closure-print-error"`) when the last print failed; `DialogFooter size="lg" intent={{ label: t('register.done'), testID: 'closure-done', onPress: onDone }} secondary={!blind && { label: printed ? t('register.print_again') : t('register.print_z_report'), testID: 'closure-print', icon: 'print', loading, onPress: reprint }}`. `onDone` → the panel's `close(false)` (§ 4.5 item 3: only now does the cart column become the Open register card — it does so by itself once `session` is null; nothing else to do).

Strings: `register.closure_n_written` "Closure {n} written", `register.print_again` "Print again" (if absent).

- [ ] **Step 1: Write the failing tests** — `closure-written.test.tsx`: the heading's override, the three tiles' values from the row, `✓ Printed` when printed, the error line and Print again after a failed print, Done closes; mock `useClosureView` the way `closure-panel.test.tsx` mocks `useReceiptDocument`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** (lift the hook first; run `closure-panel.test.tsx` green before the new file).
- [ ] **Step 4: Run** `closure-written`, `closure-panel`, `register-panel` — PASS.
- [ ] **Step 5: Commit** — `feat(register): the written moment is a pane; the closure sheet goes` with the trailer `Test-Removal: packages/core/src/screens/main/pos/cart/closure-sheet.test.tsx — its facts moved to closure-written.test.tsx`.

### Task 6: the cart column during a count, and the two cards

**Files:**
- Modify: `packages/core/src/screens/main/pos/cart/index.tsx` (the `session.status !== 'open'` branch), `packages/core/src/screens/main/pos/cart/buttons/pay.tsx`, `packages/core/src/screens/main/pos/cart/open-register-card.tsx` (the Notice; the Counting-elsewhere card as a second export `CountingElsewhereCard`)
- Test: `index.test.tsx` (the cart column's register states, created in Task 4), `pay.test.tsx` (or the buttons' suite), `open-register-card.test.tsx`

Rules (§ 4.5): `countingHere` → the cart renders as when open, `PayButton` reads `useRegisterSession().session?.status === 'counting'` and renders `disabled` with the label `t('register.counting_the_drawer')` ("Counting the drawer"); `countingElsewhere` → `<CountingElsewhereCard />` in the column: a `Card` with the register disc, the register name as title, `t('register.counting_on_another_till')` ("Counting on another till"), and when `countingBy` is not null the line `t('register.counting_by_since', { name, time })` ("{name} · since {time}", name falling back to `t('register.unknown_cashier')`); no action. The Open register card gains, when `closedElsewhere`, a `Notice tone="info" testID="open-register-closed-elsewhere"` `t('register.closed_on_another_till', { name, time })` ("{register} was closed on another till at {time} by {name}", the closer resolved as the opener is). The products panel's own counting notice (`products/index.tsx` ~line 534) is unchanged.

Strings: `register.counting_the_drawer`, `register.counting_on_another_till`, `register.counting_by_since`, `register.closed_on_another_till`.

- [ ] **Step 1: Write the failing tests** — `while this device counts the cart stays and Pay is held with Counting the drawer`, `while another till counts the column shows the Counting-elsewhere card, naming the counter when the plugin says who`, `a register closed on another till says so on the Open register card, not after a close here`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three suites — PASS; tsc from `packages/core` and `apps/main`.
- [ ] **Step 5: Commit** — `feat(pos): the cart column keeps selling paused while this device counts; Counting elsewhere and closed-on-another-till are cards`.

### Task 7: docs

- `packages/core/src/screens/main/pos/cart/LEDGER.md`: one line each for the count pane, the written moment, the two cards and Pay's hold (with the test names as evidence).
- `packages/core/src/screens/main/reports/closures/LEDGER.md`: one line for `useClosureView` (lifted for the written moment; `ClosurePanel` unchanged in behaviour).
- This plan is committed as `packages/core/specs/2026-10-28-cashier-register-map-slice-5-plan.md`.
