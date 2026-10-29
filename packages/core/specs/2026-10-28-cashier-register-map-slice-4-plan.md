# Cashier/register map · slice 4 (the register panel) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the register panel reads as § 4.4 of the spec: the shared header recipe (disc · register name · `store · open since HH:MM · 3 h 20 m · opener`), two figure tiles, the three movement tiles with drawer glyphs, the drawer's ledger as the `Derivation` rail with each movement a sub-line carrying its Void, one last-closure row that pushes the closure pane inside the panel, and a Close register button that knows the time.

**Architecture:** `RegisterPanel` (`pos/cart/register-panel.tsx`) keeps its data (`useRegisterSession`: `session`, `terms`, `expected`, `movements`, `lastClosure`, `overdue`, `figuresPending`, `blind`) and its actions (`voidMovement`, `retryMovement`, `startCounting`, the X-report print, the movement sheet); what changes is the body it draws them with. The hand-rolled `term`/`amount`/`fold` rows become `Derivation` steps; the rail component gains one sub-line primitive (`DerivationLine`) for a movement with an action. The panel gets a two-pane stack (`register` | `closure`): the closure pane is `ClosurePanel` in its pushed mode (`onBack`), already on `next` since #3036 (§ 7). The figure tile recipe the cashier sheet draws (`SalesTile`) is lifted into one `FigureTile` both use. Nothing is written to the server; the close itself (the count pane) is slice 5.

**Tech Stack:** React Native + Web, `@wcpos/components` (`Derivation`/`DerivationStep`, `ToneDisc`, `Badge`, `Tile`, `MenuRow`, `Dialog*`, `AmountFigure`, `Icon`), Jest + Testing Library (jsdom).

**Spec:** `packages/core/specs/2026-10-28-cashier-register-map-design.md` § 4.1 (one register-family panel at a time), § 4.2 (the header recipe), § 4.4, § 4.9 rule 1, § 7. Depends on slice 1 (merged) and #3036 (`ClosurePanel` pushed mode, merged); independent of slices 2 and 3.

## Global Constraints

- Lane `next`; one PR, ≤ 450 added production lines (tests, strings, `.md`, the generated icon components under `packages/components/src/icon/components/**` and the icon SVGs excluded). Count with `git diff --numstat origin/next -- packages ':!*.test.*' ':!*.test-utils.tsx' ':!*.json' ':!*.md' ':!*.svg' ':!packages/components/src/icon/components/**' | awk '{a+=$1} END {print a}'` after prettier. Stop at the ceiling and report; splitting into more files or commits does not raise it.
- Jest from `packages/core` (and from `packages/components` for Task 1): `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec jest --maxWorkers=2 --coverage=false <files>`; one jest process at a time; never the whole suite.
- Components only; no new primitive beside `DerivationLine`. The header is the sheet's recipe (`user-sheet.tsx` ~line 493: `DialogHeader className="flex-row items-center gap-3"`, a 44 pt leading element, then `DialogTitle` + `DialogDescription` in a `min-w-0 flex-1` column). The disc is `ToneDisc tone="muted" icon="register" size="sm"`. Figure tiles are `FigureTile` (Task 3). Money out of the drawer reads as a minus (U+2212), never a colour (the panel's existing `minus`).
- Every string through `t('literal.key')`; new keys in `packages/core/src/contexts/translations/locales/en/core.json` (each task lists its own). Plain words: till, drawer, float, count, close; never session, variance.
- Icon names are by MEANING (`icon-sets-generic-names-and-switchable-families`): `paidIn` (cash into the drawer), `paidOut` (cash out of the drawer), `cashDrawer` (exists). A glyph is added to BOTH maps (`packages/components/scripts/icons/maps/hugeicons.json`, `solar.json`) and generated with `pnpm svg` from `packages/components` (#3053 is the recipe: the map entry, the SVG, the generated component).
- `useRegisterSession` grows one member, `closeTime` (a noun; `packages/core/src/seam.test.ts` runs with Task 2's tests). `scripts/check-event-labels.mjs` reads every dotted quoted string under `services/register-session`: Task 2 adds none.
- The panel's test (`register-panel.test.tsx`) mocks what it needs at module level; `ClosurePanel` is mocked there (`jest.mock('../../reports/closures/closure-panel', ...)`) to a stub that renders `testID="closure-panel"` with a `closure-back` button calling `onBack` — the real pane has its own suite.
- Zero terms are not drawn on the rail (§ 4.4 item 4); the closure document keeps every term (unchanged, `closure-document.ts`).
- The gallery: Task 1 adds a sub-line to the derivation gallery cell (`packages/components/src/derivation/gallery.tsx`), so the PR's `Gallery shoot` goes red on that cell by design; the PR carries the `gallery:update-baselines` label once (the orchestrator does this, not the builder).

## Review Focus

1. A session whose only movements are voided: Paid in/out steps are not drawn (the active list is empty), Expected still ends the rail — pinned in Task 4.
2. A refused movement (`sync_status === 'failed'`) under its step: the sub-line reads `reason · amount · Refused` in the `bad` tone, Void still offered while the session is open — pinned in Task 4.
3. Closed register with a last closure: header says `closed HH:MM`, no tiles' figures, no rail, the closure row only, Close register disabled — pinned in Task 6.
4. Blind cashier: no amount anywhere (tiles, rail, closure row), the closure row disabled with its note — pinned in Tasks 3, 4, 5.
5. `figuresPending`: the In-the-drawer tile and the Float and Expected steps read `—` with the sync note; Close register disabled — pinned in Task 3 and Task 6.

---

### Task 1: `DerivationLine` — a step's sub-line with an action

**Files:**
- Modify: `packages/components/src/derivation/index.tsx`
- Modify: `packages/components/src/derivation/gallery.tsx` (one sub-line under an existing step)
- Test: `packages/components/src/derivation/derivation.test.tsx`

**Interfaces:**
- Produces: `DerivationLine({ label, note?, amount?, action?, tone?, testID? })` exported beside `DerivationStep`:
  ```ts
  interface DerivationLineProps extends ViewProps {
  	/** The movement's reason. */
  	label: string;
  	/** Muted, after the label: "Refused". */
  	note?: string;
  	/** Right of the label, tabular: the amount; omitted for a blind cashier or a no sale. */
  	amount?: string;
  	/** A ghost `Button size="sm"` at the right: Void. */
  	action?: { label: string; testID?: string; onPress: () => void; disabled?: boolean };
  	/** `bad` colours the label (a refused row). */
  	tone?: 'bad';
  }
  ```
  Rendered as `View className="min-h-row flex-row items-center gap-2"` inside a step's children (the step already indents children under its title): label `Text numberOfLines={1} className="min-w-0 flex-1"` (+ `TONE.bad.text` when `tone`), note `Text variant="key"`, amount `Text className="tabular-nums"`, action `Button variant="ghost" size="sm"`.

- [ ] **Step 1: Write the failing tests** in `derivation.test.tsx`:

```tsx
it('a sub-line carries its reason, amount and action, and reads bad when refused', () => {
	const onPress = jest.fn();
	render(
		<Derivation>
			<DerivationStep label="Paid out · 2" title="Paid out">
				<DerivationLine label="Window cleaner" amount="−20,00 £" action={{ label: 'Void', testID: 'void-1', onPress }} />
				<DerivationLine label="Petty cash" note="Refused" amount="−5,00 £" tone="bad" testID="line-2" />
			</DerivationStep>
		</Derivation>
	);
	expect(screen.getByText('Window cleaner')).toBeTruthy();
	expect(screen.getByText('−20,00 £')).toBeTruthy();
	fireEvent.click(screen.getByTestId('void-1'));
	expect(onPress).toHaveBeenCalledTimes(1);
	expect(screen.getByText('Refused')).toBeTruthy();
});
```

- [ ] **Step 2: Run it** — `pnpm exec jest --maxWorkers=2 --coverage=false src/derivation/derivation.test.tsx` from `packages/components`. Expected: FAIL, `DerivationLine` is not exported.
- [ ] **Step 3: Implement `DerivationLine`** in `index.tsx`; export it with `DerivationStep`. Add one sub-line under the gallery's paid-out-like step (a reason, an amount, a Void action) so the cell shows the variant.
- [ ] **Step 4: Run it** — PASS. `pnpm exec tsc --noEmit` from `packages/components` clean.
- [ ] **Step 5: Commit** — `feat(components): DerivationLine — a step's sub-line with its reason, amount and one action`.

### Task 2: the register panel's reads — `closeTime`, the two drawer glyphs

**Files:**
- Modify: `packages/core/src/services/register-session/use-register-session.ts` (~line 289: the returned object)
- Modify: `packages/components/src/icon/names.ts`, `packages/components/scripts/icons/maps/hugeicons.json`, `packages/components/scripts/icons/maps/solar.json`; run `pnpm svg` from `packages/components`
- Test: `packages/core/src/services/register-session/use-register-session.test.tsx`, `packages/core/src/seam.test.ts`

**Interfaces:**
- Produces: `useRegisterSession().closeTime: string | null | undefined` — the store's `expected_close_time` (`HH:MM`) the hook already reads for `overdue`; and icon names `paidIn`, `paidOut`.

- [ ] **Step 1: Write the failing test** in `use-register-session.test.tsx` beside the `overdue` test: `closeTime` returns the store's `expected_close_time` (`'17:30'`) and `undefined` when the store has none.
- [ ] **Step 2: Run it** — FAIL (`closeTime` undefined on the result).
- [ ] **Step 3: Return `closeTime`** from the hook (one line, with the doc comment `/** The store's HH:MM close time; what `overdue` is measured against. */`). Add `'paidIn', // Cash into the drawer (paid in)` and `'paidOut', // Cash out of the drawer (paid out)` to `names.ts`; map each in both JSON maps to a glyph that draws an arrow into / out of a drawer (Hugeicons and Solar/Tabler each have one; name the chosen glyph in the commit body); run `pnpm svg`.
- [ ] **Step 4: Run** `use-register-session.test.tsx` and `src/seam.test.ts` — PASS. `node --test scripts/check-event-labels.test.mjs` from the repo root — PASS.
- [ ] **Step 5: Commit** — `feat(register): useRegisterSession exposes closeTime; paidIn and paidOut glyphs in both icon families`.

### Task 3: `FigureTile`, the header and the two figure tiles

**Files:**
- Create: `packages/core/src/screens/main/pos/cart/figure-tile.tsx`
- Modify: `packages/core/src/screens/main/pos/cart/user-sheet.tsx` (`SalesTile` draws a `FigureTile`; nothing else in the file)
- Modify: `packages/core/src/screens/main/pos/cart/register-panel.tsx` (the header block and a new tiles row above the movement tiles)
- Test: `packages/core/src/screens/main/pos/cart/register-panel.test.tsx`, `packages/core/src/screens/main/pos/cart/user-sheet.test.tsx` (existing tiles tests stay green)

**Interfaces:**
- Produces: `FigureTile({ label, value, sub, testID })` — `View testID className="border-border flex-1 rounded-lg border px-3 py-2.5"`, `Text variant="key"` label, `AmountFigure size="tile"` value, optional `Text variant="key"` sub (the recipe `SalesTile` draws today).
- Consumes: `ToneDisc` (`@wcpos/components/tone-disc`), `useRegisterBinding().registers` (`services/register/use-register-binding`), `useNowMs` (`hooks/use-relative-time`), `Opener` (already in the panel), `useStoreDay().timezone` + `formatDate`/`zoneOptions` (as `user-sheet.tsx` formats `HH:mm`).

Header, per § 4.2: leading `ToneDisc tone="muted" icon="register" size="sm" testID="register-panel-disc"`; `DialogTitle numberOfLines={1}` = `binding.registerName`, or `t('register.register')` when `registers.length === 1`; `DialogDescription testID="register-panel-description"` = parts joined with ` · `: the store name (`store.name`), then while open `t('register.open_since', { time })` and the age, then the opener's display name (`Opener`, Suspense); while closed with a last closure `t('register.closed_at_time', { time })` (the closure's `closed_at`). The age is `ageLabel(openedMs, nowMs)` in the panel: `t('register.age_h_m', { h, m })` ("3 h 20 m") when ≥ 1 h, else `t('register.age_m', { m })` ("20 m"); `nowMs` from `useNowMs(60_000)`. The X-report `IconButton` stays at the header's right, unchanged.

Tiles row (`View className="flex-row gap-2 px-4"`, above the movement tiles, only while `session`): `FigureTile testID="register-panel-drawer" label=t('register.in_the_drawer')` value `—` when `figuresPending` (sub `t('register.figures_after_sync')`) else `format(expected.cash)`; `FigureTile testID="register-panel-session-sales" label=t('register.session_sales')` value `format(sessionSales)` sub `t('register.sales_count', { count: salesCount })`, where `sessionSales = Number(terms.cashSales.amount) − Number(terms.cashRefunds.amount) + Σ others` (`others` as the panel computes it today: every non-cash `expected` entry). Blind cashier: ONE tile, label `Session sales`, value `t('register.sales_count', { count })`, no money.

Strings: `register.register` "Register", `register.open_since` "open since {time}", `register.closed_at_time` "closed {time}", `register.age_h_m` "{h} h {m} m", `register.age_m` "{m} m", `register.session_sales` "Session sales".

- [ ] **Step 1: Write the failing tests** in `register-panel.test.tsx` (the existing fixture: an open session at a known `opened_at_gmt`, expected cash 345.03, 2 sales, a card tender): `the header is the recipe: disc, register name, store · open since · age · opener` (fake timers so the age is deterministic, e.g. 3 h 20 m after `opened_at_gmt`), `the two figure tiles: In the drawer and Session sales with the count`, `a blind cashier gets one tile with the count and no money`, `a seeded session's drawer tile reads — with the sync note`.
- [ ] **Step 2: Run** `register-panel.test.tsx` — the four FAIL; the existing 23 still pass or fail only on the header's old `register-panel-amount` (update those assertions in the same step: the amount now lives on `register-panel-drawer`).
- [ ] **Step 3: Implement** `figure-tile.tsx`; `SalesTile` returns `<FigureTile testID="user-sheet-sales-today" label=… value={format(total)} sub={sub} />`; the panel's header and tiles as specified. Delete the old `AmountFigure` title and the `in_the_drawer · name · opened_at_by` description.
- [ ] **Step 4: Run** `register-panel.test.tsx` and `user-sheet.test.tsx` — PASS.
- [ ] **Step 5: Commit** — `feat(register): the panel's header is the recipe and its figures are tiles`.

### Task 4: the ledger as the `Derivation` rail

**Files:**
- Modify: `packages/core/src/screens/main/pos/cart/register-panel.tsx` (the `DialogBody`'s `terms` block; delete `term`, `amount`, `fold`, `expanded`, `STATIC_ROW` where no longer used)
- Modify: the movement tiles' glyphs (`paidIn`, `paidOut`, `cashDrawer`)
- Test: `register-panel.test.tsx`

**Interfaces:**
- Consumes: `Derivation`, `DerivationStep`, `DerivationLine` (Task 1); `activeMovements` (already computed), `terms`, `actions.voidMovement`.

The rail (`Derivation testID="register-panel-ledger" className="px-4 pt-2"`), one step per term that happened, in this order, each `label` the term with its count (`t('register.term_count', { term, count })` → "Cash sales · 3"; the float's label is `t('register.opened_suffix', { time })` "Opened 09:02"), `title` the term's plain name, `trailing` the amount (`Text className="tabular-nums"`; omitted for blind):
1. Float — always (`—` when `figuresPending`).
2. Cash sales — when `terms.cashSales.count > 0`.
3. Cash refunds — when `Number(terms.cashRefunds.amount) !== 0` (minus).
4. Paid in — when any active `paid_in` movement OR `terms.paidIn.length > 0` (a server-baseline count with no local rows draws the step without sub-lines); sub-lines: one `DerivationLine` per active `paid_in` row (`label` reason, `amount` format, `action` Void `testID="movement-void-<id>"` disabled unless `session.status === 'open'`, `note` `t('register.refused_row')` + `tone="bad"` when `sync_status === 'failed'`).
5. Paid out — same, amounts as minus (`testID` rows keep `movement-row-<id>` on the line's `testID`).
6. No sale — when `terms.noSales > 0`; label "No sale · n", no amount; sub-lines reasons with Void, no amount.
7. Expected in the drawer — `state="result"`, `title` `t('register.expected_in_drawer')`, trailing the expected (`—` when pending); omitted for blind (then the last drawn term is the rail's last step).

The movement tiles: `paid_in → 'paidIn'`, `paid_out → 'paidOut'`, `no_sale → 'cashDrawer'`.

Strings: `register.term_count` "{term} · {count}".

- [ ] **Step 1: Rewrite the existing tests** that read the rows (`the body is the drawer's derivation and ends in Expected`, `records paid out and Undo inserts a void`, `no sale hides amount…`, `hides every amount … for blind cashiers`) against the rail's testIDs and text, and add: `zero terms are not drawn; a voided movement's step disappears`, `a refused movement is a bad sub-line with Refused and still offers Void`, `the float and Expected read — on a seeded session`.
- [ ] **Step 2: Run** — FAIL on the rail testIDs.
- [ ] **Step 3: Implement** the rail; delete the row helpers and the fold state.
- [ ] **Step 4: Run** `register-panel.test.tsx` — PASS; `pnpm exec tsc --noEmit` from `packages/core` clean.
- [ ] **Step 5: Commit** — `feat(register): the drawer's ledger is the Derivation rail; movements are sub-lines with their Void`.

### Task 5: one last-closure row, and the closure pane pushed inside the panel

**Files:**
- Modify: `register-panel.tsx` (the `lastClosure` block; the pane stack)
- Test: `register-panel.test.tsx`

**Interfaces:**
- Consumes: `ClosurePanel` (`../../reports/closures/closure-panel`, `{ row, onClose, onBack }`), `Badge` (`variant`, `tinted`, `size="lg"`), `useStoreDayLabel(store.id)` (`hooks/use-store-day-label`: `relative`-style heading and `time`), `useCurrencyFormat`.

The row: `MenuRow testID="register-panel-open-closure"` label `Closure N · <day> <HH:mm> · <counted cash>` (N = `server_number ?? number`; day = `heading(lastClosure.business_day)` from `useStoreDayLabel(store.id)`, which already answers Today / Yesterday / the dated form; time = `time(lastClosure.closed_at)`; the amount omitted for blind), `trailing` a `Badge tinted size="lg"`: `Unsynced` (`warning`) when `!synced_rows_at`, else `Corrected` (`warning`) when `corrections_count`, else by `variance.cash`: `Exact` (`ok`), `<amount> over` (`ok`), `<amount> short` (`bad`) — the same words `closure-list.tsx` uses. `disabled={reportsDenied}` with the existing restricted note. Pressing sets the pane to `closure`. Removed: the Reports `router.push`, the `closure-reprint` row and `useSessionReport(lastClosure, true)`, the `closure-unsynced` note (it is the badge now), the `listed_in_health` note. Kept: `closure-sync-error`.

The pane stack: `const [pane, setPane] = React.useState<'register' | 'closure'>('register')`; the panel's existing `close(next)` wrapper (#3054: it already clears the movement and the error on close) also resets it to `register`. When `pane === 'closure' && lastClosure`, `DialogContent` renders `<ClosurePanel row={lastClosure} onBack={() => setPane('register')} onClose={() => onOpenChange(false)} />` instead of the header, body and footer (the pushed mode renders its own header with ‹ and its own footer; the panel's `DialogContent` keeps the side, size and portal host).

- [ ] **Step 1: Rewrite/add tests**: `the closure row reads Closure N · day time · amount with the result badge` (exact / over / short / Unsynced / Corrected: five short cases on one fixture), `pressing the closure row pushes the closure pane; ‹ returns to the register`, `× on the pushed pane closes the panel`, `a blind cashier's closure row is disabled with its note and no amount`; delete `opens the last closure in Reports Closures…`, `shows Unsynced until … offers Reprint`, `shows the server number and offers Reprint…`, `hides acknowledged closure reprinting…` (their facts move into the new ones). Mock `ClosurePanel` as the Global Constraints say.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the row and the pane.
- [ ] **Step 4: Run** `register-panel.test.tsx` — PASS.
- [ ] **Step 5: Commit** — `feat(register): one closure row with its result; the closure pane is pushed inside the panel`.

### Task 6: Close register knows the time; the closed states

**Files:**
- Modify: `register-panel.tsx` (the `DialogFooter`)
- Test: `register-panel.test.tsx`

Footer: `label: overdue ? t('register.close_register_past', { time: closeTime }) : t('register.close_register')`; `disabled: !session || figuresPending` (unchanged); the press unchanged (slice 5 replaces the dismissal with the count pane). Closed with a last closure: the header reads `closed HH:MM`, no tiles row, no movement tiles' enabled state (as today), no rail (`terms` is undefined), the closure row only, Close register disabled. Closed with nothing and no refused movement: `null` (unchanged).

Strings: `register.close_register_past` "Close register · it's past {time}".

- [ ] **Step 1: Write the failing tests**: `Close register reads the time once it is past the store's close time`, `closed with a last closure: the header, the closure row only, Close register disabled`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `register-panel.test.tsx` — PASS. Then the full verification list from the brief.
- [ ] **Step 5: Commit** — `feat(register): Close register says when it is past closing time`.

### Task 7: docs

- `packages/core/src/screens/main/pos/cart/LEDGER.md`: one line for the panel's recipe (header 4.2, tiles, the rail, the pushed closure pane).
- `packages/components/src/derivation/` has no ledger; the `DerivationLine` doc comment is its record.
- This plan is committed as `packages/core/specs/2026-10-28-cashier-register-map-slice-4-plan.md`.
