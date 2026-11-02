# Cashier/register map · slice 3 (the confirm) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one centred confirm in front of every switch the cashier sheet offers: hand the till to another cashier, switch store (the drawer stays open here), switch register, and Sign out with an open register asking to close it first; with the three guards (a payment in flight, a count in progress on this device, offline).

**Architecture:** `UserSheet` (slice 2) already owns one in-flight flag (`act`) and the three bands as `MenuRow` choice rows. This slice lifts the three actions (cashier login, store switch, register bind) out of the bands into the sheet, so a row only _asks_ (`onChoose(request)`) and the sheet answers with one `SwitchConfirm` (`AlertDialog`, four parameterisations of one `SwitchRequest` union); on confirm the sheet runs the same action it ran before through `act`. `AlertDialogFooter` gains the `secondary` slot the Sign out case needs. The payment-in-flight signal is one new read over two things that already exist (the terminal payments service snapshot, the pay frame's mount); the counting signal is the `counting_here` mark slice 1 already writes. Nothing new is written to the server; no carry, no RadioGroup (slice 6).

**Tech Stack:** React Native + Web, `@wcpos/components` (`AlertDialog*`, `Notice`, `AmountFigure`, `MenuRow`), `useSyncExternalStore`, Jest + Testing Library (jsdom).

**Spec:** `packages/core/specs/2026-10-28-cashier-register-map-design.md` § 4.3 (rows open the confirm), § 4.6 (without the carry), § 4.9. Depends on slices 1 and 2 (merged: #3034, #3044, #3045).

**Split at the budget gate (2026-10-29):** Tasks 1–5 in full measured 431 production lines against the 400 ceiling (the moved `switchUser` body counts as added lines). **3a** (this branch): Task 3's `useOpenOrdersOptional`, Task 4 without the `sign-out` case, Task 5 without the guards, Task 6. **3b** (next PR off `next`, ≤ 200): Task 1 (`AlertDialogFooter secondary`), Task 2 (`usePaymentInFlight`), Task 3's `countingHere`, the `sign-out` case and `onSignOutAnyway`, the `hold`/`counting`/`online` guards and the `user-sheet-hold` Notice, their strings and tests. The full work is preserved on `codex/switch-confirm-full`; 3b writes the count call as `act(async () => { await actions.startCounting(); })`.

3b assembled 2026-10-29 on `codex/switch-guards`.

## Global Constraints

- Lane `next`; one PR, ≤ 400 added production lines (tests, strings, `.md` files excluded). Count with `git diff --numstat origin/next -- packages ':!*.test.*' ':!*.test-utils.tsx' ':!*.json' ':!*.md' | awk '{a+=$1} END {print a}'` after prettier.
- Jest from `packages/core` (and from `packages/components` for Task 1): `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec jest --maxWorkers=2 --coverage=false <files>`; one jest process at a time; never the whole suite.
- Components only: the confirm is `AlertDialog` + `AlertDialogContent` + `AlertDialogHeader`/`Title`/`Description` + `AlertDialogFooter` slots (never a `Button` in a footer; the footer owns order and phone stacking). The figure tile recipe is the one `Figures` in `user-sheet.tsx` already draws (`border-border flex-1 rounded-lg border px-3 py-2.5`, label `Text variant="key"`, `AmountFigure size="tile"`). A disabled reason on a row is the `MenuRow` `description`; a reason that holds the whole sheet is one `Notice tone="info"` above the bands.
- Every string through `t('literal.key')`; new keys in `packages/core/src/contexts/translations/locales/en/core.json` (each task lists its own). Plain words: till, drawer, float, count, close; never session, variance.
- `AlertDialogFooter secondary` is a `FooterButton` drawn `outline`: desktop order cancel · secondary · confirm, phone order confirm · secondary · cancel (§ 4.6). The jest stand-in `packages/core/jest/footer.test-utils.tsx` `AlertDialogFooter` learns the slot in the same task (it renders Cancel · secondary · confirm).
- Spec correction carried by this PR (docs): § 4.6 "Which register in Y" names the pointer `sites[siteUuid].registers[storeId]`; the code (slice 1) keys it `sites[siteUuid].bindings[String(storeId)]`, read through `useRegisterDirectory(storeId).registerId`. Amend the spec sentence; do not move the pointer.
- The redirect-gateway half of "a payment in flight" has no global flag today: this slice marks the pay frame's mount (`usePayFrame`) in the new `payment-in-flight.ts` module. The terminal half reads the service snapshot. Both are reads; neither adds state to an order.
- `packages/core/src/seam.test.ts` runs with Task 3's tests (the new `useRegisterSession` member is `countingHere`, a noun, never `update…`/`set…`).
- `scripts/check-event-labels.mjs` reads every dotted quoted string under `services/register-session` and `services/register` as an event type: Task 3 adds no string there.
- Under test, `user-sheet.test.tsx` mocks `@wcpos/components/alert-dialog` (line 30: `AlertDialog` renders its children only when `open`, footer from `footer.test-utils`) — the confirm renders inside the sheet tests through that mock; the stale `AlertDialogAction`/`AlertDialogCancel` entries in that mock are harmless and stay.

## Review Focus

1. A terminal payment collecting on another cart while the cashier opens the sheet: every row and Sign out disabled, one Notice saying why; the moment the leg reaches `final` the rows are live again. → Task 2's service test and Task 5's hold test.
2. This device counting (the count pane open in the cart column), the cashier taps another cashier: the row is disabled with _Finish or abandon the count first_; the store and register rows are not held by it. → Task 5's counting test.
3. Offline: the store rows and Another account… are disabled with _Needs the store to switch_; a saved cashier can still be handed the till (the confirm opens and the login runs). → Task 5's offline test.
4. Sign out while the register is closed or the device is unbound: no confirm, the logout runs at once as today. → Task 5's sign-out test.
5. A seeded session with figures pending: the hand-over confirm's drawer tile shows `—` and _Figures arrive with the next sync_; the sign-out confirm's Close register is disabled (§ 4.9 rule 1), Sign out anyway stays live. → Task 4's pending test.

---

### Task 1: `AlertDialogFooter secondary`

**Files:**

- Modify: `packages/components/src/alert-dialog/index.tsx` (`AlertDialogFooterProps`, `AlertDialogFooter` lines 81-147)
- Modify: `packages/components/src/alert-dialog/LEDGER.md` (line 9)
- Modify: `packages/core/jest/footer.test-utils.tsx` (`AlertDialogFooter` stand-in)
- Test: `packages/components/src/alert-dialog/alert-dialog.test.tsx`

**Interfaces:**

- Produces: `AlertDialogFooterProps.secondary?: FooterButton` — an outline button of the footer's `size`, between cancel and confirm on desktop (`cancel · secondary · confirm`), between confirm and cancel on phone (`confirm · secondary · cancel`); it does NOT close the dialog itself (the caller's `onPress` decides). Absent → the footer renders exactly as today.
- Consumes: `FooterButton` from `../dialog` (already imported as a type).

- [ ] **Step 1: Failing test** (beside `orders cancel and confirm by device`, reuse its `DeviceScope`):

```tsx
it.each([false, true])(
	'places the secondary between cancel and confirm by device (%s)',
	(phone) => {
		const secondary = jest.fn();
		render(
			<DeviceScope phone={phone}>
				<AlertDialog open>
					<AlertDialogContent inline>
						<AlertDialogFooter
							testID="footer"
							confirm={{ label: 'Close register' }}
							secondary={{ label: 'Sign out anyway', onPress: secondary, testID: 'secondary' }}
						/>
					</AlertDialogContent>
				</AlertDialog>
			</DeviceScope>
		);
		const labels = within(screen.getByTestId('footer'))
			.getAllByRole('button')
			.map((b) => b.textContent);
		expect(labels).toEqual(
			phone
				? ['Close register', 'Sign out anyway', 'Cancel']
				: ['Cancel', 'Sign out anyway', 'Close register']
		);
		expect(screen.getByTestId('secondary')).toHaveClass('border-border', 'bg-card'); // the outline variant, as Cancel
		fireEvent.click(screen.getByTestId('secondary'));
		expect(secondary).toHaveBeenCalledTimes(1);
	}
);
```

- [ ] **Step 2: Run it, expect FAIL** (`secondary` is not a prop; three buttons expected, two found). Run from `packages/components`: `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec jest --maxWorkers=2 --coverage=false src/alert-dialog/alert-dialog.test.tsx`.
- [ ] **Step 3: Implement** `secondary?: FooterButton` on the props; in the body `const alternative = secondary ? <Button {...rest} leftIcon={icon} variant="outline" size={size} className={buttonClass}>{label}</Button> : null;` and render `phone ? action · alternative · dismiss : dismiss · alternative · action`. Doc comment on the prop: `/** One alternative to the confirm (outline): the Sign out anyway beside Close register. */`.
- [ ] **Step 4: Stand-in**: in `footer.test-utils.tsx` `AlertDialogFooter({ confirm, cancel, secondary, size, testID })` renders Cancel, then `secondary` (via `actionButton`, `data-variant="outline"`), then confirm.
- [ ] **Step 5: Run the test, expect PASS**; also `pnpm exec tsc --noEmit` from `packages/components`; `packages/components/src/dialog/footer.test.tsx` still passes (its `@ts-expect-error` cases name `intent`/`record`, not `secondary`).
- [ ] **Step 6: LEDGER line 9** — `9. The footer takes an optional secondary slot (outline, between cancel and confirm; after the confirm on phone) for the one confirm that offers an alternative to its verb — evidence: spec § 4.6 Sign out with an open register (Close register · Sign out anyway); test "places the secondary between cancel and confirm by device".`
- [ ] **Step 7: Commit** `feat(components): AlertDialogFooter secondary slot (outline, between cancel and confirm)`.

### Task 2: The payment-in-flight read

**Files:**

- Create: `packages/core/src/screens/main/pos/checkout/payments/payment-in-flight.ts`
- Modify: `packages/core/src/screens/main/pos/checkout/pay-page/use-pay-frame.ts` (mount effect)
- Test: `packages/core/src/screens/main/pos/checkout/payments/payment-in-flight.test.tsx`

**Interfaces:**

- Produces: `usePaymentInFlight(): boolean` — true while any terminal leg in `getTerminalPaymentsService().getSnapshot()` has `phase !== 'final'`, or while at least one pay frame is mounted. `markPayFrame(open: boolean): void` — increments/decrements a module counter and notifies subscribers; `usePayFrame` calls `markPayFrame(true)` in a mount effect whose cleanup calls `markPayFrame(false)`.
- Consumes: `getTerminalPaymentsService` (`services/terminal-payments/index.ts:25`; `.subscribe(listener)` and `.getSnapshot()` at `service.ts:591-597`), `React.useSyncExternalStore`.

- [ ] **Step 1: Failing tests** (mock `../../../../../services/terminal-payments` with a tiny store `{ subscribe, getSnapshot }` whose snapshot is a settable `Map`):

```tsx
it('is false with no legs and no pay frame', () => {
	expect(renderHook(() => usePaymentInFlight()).result.current).toBe(false);
});
it('is true while a terminal leg is not final, false once it is', () => {
	setLegs(new Map([['o1', { phase: 'polling' }]]));
	const { result } = renderHook(() => usePaymentInFlight());
	expect(result.current).toBe(true);
	act(() => setLegs(new Map([['o1', { phase: 'final' }]])));
	expect(result.current).toBe(false);
});
it('is true while a pay frame is mounted', () => {
	const { result } = renderHook(() => usePaymentInFlight());
	act(() => markPayFrame(true));
	expect(result.current).toBe(true);
	act(() => markPayFrame(false));
	expect(result.current).toBe(false);
});
```

- [ ] **Step 2: Run, expect FAIL** (module missing). From `packages/core`.
- [ ] **Step 3: Implement** the module: a `frames` counter with a `Set<() => void>` of listeners; `usePaymentInFlight` = `useSyncExternalStore(service.subscribe, () => [...service.getSnapshot().values()].some((leg) => leg.phase !== 'final'))` OR `useSyncExternalStore(subscribeFrames, () => frames > 0)`. Header comment: why both halves (§ 4.6 guard: terminal waiting, redirect gateway open) and that the pay frame publishes no flag of its own.
- [ ] **Step 4:** in `usePayFrame`, one `React.useEffect(() => { markPayFrame(true); return () => markPayFrame(false); }, []);` with a one-line comment pointing at the guard.
- [ ] **Step 5: Run, expect PASS**; run `src/screens/main/pos/checkout/pay-page/use-pay-frame.test.ts*` if present (it may need the new module mocked: `jest.mock('../payments/payment-in-flight', () => ({ markPayFrame: jest.fn() }))`).
- [ ] **Step 6: Commit** `feat(pos): one read for a payment in flight (terminal leg not final, or a pay frame mounted)`.

### Task 3: `countingHere` on `useRegisterSession` and the optional open-orders read

**Files:**

- Modify: `packages/core/src/services/register-session/use-register-session.ts` (return object; `live` is already read for `figuresPending`)
- Modify: `packages/core/src/screens/main/pos/contexts/current-order/context.ts`
- Test: `packages/core/src/services/register-session/use-register-session.test.tsx`, `packages/core/src/screens/main/pos/contexts/current-order/context.test.tsx` (create if absent)

**Interfaces:**

- Produces: `useRegisterSession().countingHere: boolean` = `!!live?.counting_here` (the mark `startCounting` writes and `backToSelling`/the close clear; slice 1). `useOpenOrdersOptional(): OpenOrderHit[]` in `context.ts` = `React.useContext(CurrentOrderContext)?.openOrders ?? []` (the rail's sheet renders outside the provider and reports no carts, as `useCurrentOrderOptional` does for the record).

- [ ] **Step 1: Failing tests**: in `use-register-session.test.tsx`, beside the `figuresPending` test, "reports counting on this device from the cached mark" — record a live session with `counting_here: true` via `recordLiveSession`, expect `result.current.countingHere` true, then `false` after `markCountingHere(…, false)`. In `context.test.tsx`: `useOpenOrdersOptional` returns `[]` outside the provider and the provider's `openOrders` inside.
- [ ] **Step 2: Run, expect FAIL.** - [ ] **Step 3: Implement** (two lines and a doc comment each). - [ ] **Step 4: Run, expect PASS**, plus `src/seam.test.ts`.
- [ ] **Step 5: Commit** `feat(register): countingHere on the session hook; optional open-orders read for the rail`.

### Task 4: `SwitchConfirm`

**Files:**

- Create: `packages/core/src/screens/main/pos/cart/switch-confirm.tsx`
- Modify: `packages/core/src/screens/main/pos/cart/user-sheet.tsx` (export the two tiles out of `Figures`: `SalesTile` and `DrawerTile`, below)
- Modify: `packages/core/src/contexts/translations/locales/en/core.json`
- Test: `packages/core/src/screens/main/pos/cart/switch-confirm.test.tsx`

**Interfaces:**

- Produces:

```ts
export type SwitchRequest =
	| { kind: 'cashier'; credential: ReadonlyWpCredentialsRecord }
	| { kind: 'store'; store: ReadonlyStoreRecord }
	| { kind: 'register'; register: Register; state: string } // state = the Register band's description line for that row
	| { kind: 'sign-out' };
export function SwitchConfirm(props: {
	request: SwitchRequest | null; // null = closed
	portalHost?: string;
	onOpenChange: (open: boolean) => void; // false after cancel, confirm or secondary
	onConfirm: (request: SwitchRequest) => void; // the verb
	onSignOutAnyway: () => void; // the sign-out case's secondary
}): JSX.Element | null;
```

`user-sheet.tsx` exports `SalesTile({ sub }: { sub?: string })` (label `register.your_sales_today`, `AmountFigure` of `useSalesToday()`, optional `Text variant="key"` sub-line) and `DrawerTile({ label, onOpen, busy }: …)` (today's drawer tile with its `figuresPending`/`blind`/closed branches; `onOpen` optional → not pressable); `Figures` becomes the two side by side with the sheet's labels. Same markup, moved, not rewritten.

- Consumes: `useRegisterSession()` (`session`, `expected`, `lastClosure`, `blind`, `figuresPending`, `salesCount`, `binding`), `useRegisterDirectory(store.id)` for the store case (`services/register/use-register-binding.ts:228`), `useOpenOrdersOptional`, `useAwaitingStoreCount`, `useDocField(wpCredentials, v => v.last_access)` + `useStoreDay().timezone`, `useCurrencyFormat`, `AlertDialogFooter secondary` (Task 1).
- Title · description · body · footer per kind (strings are the new keys below; `{name}` is the target's display name):
  - `cashier`: **`register.hand_till_to`** · `register.hand_over_reloads` (+ ` ` + `register.drawer_stays_open_on` when `binding.status === 'bound' && session`) · `SalesTile sub={[t('register.sales_count',{count: salesCount}), signedIn && t('register.on_the_till_since',{time})].filter(Boolean).join(' · ')}` + `DrawerTile label={t('register.drawer_stays_at')}` + `Notice tone="info" testID="switch-confirm-waits"` (title `register.waits_here_for_you`, description = `[carts > 0 && t('register.open_carts_count',{count: carts}), unsent > 0 && t('register.unsent_sales_count',{count: unsent})].filter(Boolean).join(' · ')`; the Notice is omitted when both are 0) · confirm `register.hand_over_to` `testID="switch-confirm-confirm"`.
  - `store`: **`register.switch_to_question`** · `register.store_switch_reloads` + ` ` + one of `register.store_register_closed` / `register.store_register_open_since` (`{time}` from `session.opened_at_gmt`, `HH:mm`) / `register.store_register_choose`, chosen from `useRegisterDirectory(store.id)`: `y.registers.find(r => r.id === y.registerId) ?? (y.registers.length === 1 ? y.registers[0] : undefined)` → its `session` null = closed, non-null = open since, undefined = choose; + ` ` + `register.drawer_stays_here` when this device's `session` exists · no body · confirm `register.switch_to`.
  - `register`: **`register.switch_to_question`** · `register.register_switch_moves_device` (`{name}` = target, `{current}` = `binding.registerName`; the second sentence only when `session`) · `Notice tone="info" title={state} description={register.session ? t('register.you_join_it') : t('register.you_open_with_float')}` · confirm `register.switch_to`.
  - `sign-out`: **`register.still_open_close_first`** (`{name}` = `binding.registerName`, `{amount}` = `format(expected.cash)`), or `register.still_open_close_first_blind` (no amount) when `blind || figuresPending` · `AlertDialogDescription` = `register.open_till_stays_open` · no body · confirm `register.close_register` (`disabled: figuresPending`, then the description also carries `register.figures_after_sync`) · `secondary` `register.sign_out_anyway` `testID="switch-confirm-secondary"` · cancel.
  - Every footer: `cancel={{ testID: 'switch-confirm-cancel' }}`; content `testID="switch-confirm"`. Confirm and secondary call their callback then `onOpenChange(false)`.
- New `core.json` keys (`register.`): `hand_till_to` "Hand the till to {name}?", `hand_over_reloads` "The POS reloads as {name}.", `drawer_stays_open_on` "The drawer stays open on {register}.", `drawer_stays_at` "Drawer stays at", `waits_here_for_you` "Waits here for you", `open_carts_count_one` "{count} open cart" / `_other` "{count} open carts", `unsent_sales_count_one` "{count} unsent sale" / `_other` "{count} unsent sales", `hand_over_to` "Hand over to {name}", `switch_to_question` "Switch to {name}?", `switch_to` "Switch to {name}", `store_switch_reloads` "The POS reloads in {name}.", `store_register_closed` "Its register is closed.", `store_register_open_since` "Its register is open since {time}.", `store_register_choose` "You'll choose a register there.", `drawer_stays_here` "{register}'s drawer stays open here.", `register_switch_moves_device` "This device moves to {name}. {current}'s drawer stays open for whoever is there.", `register_switch_moves_device_short` "This device moves to {name}.", `you_open_with_float` "You'll open it with a float.", `you_join_it` "You join it.", `still_open_close_first` "{name} is still open at {amount}. Close it first?", `still_open_close_first_blind` "{name} is still open. Close it first?", `open_till_stays_open` "A till left open stays open for the next cashier. The closure records who closed it.", `sign_out_anyway` "Sign out anyway". Reuse `register.close_register`, `register.sales_count`, `register.on_the_till_since`, `register.figures_after_sync`, `register.your_sales_today`, `register.register_closed_last_closure`.

- [ ] **Step 1: Failing tests** in `switch-confirm.test.tsx` (copy the mock block of `user-sheet.test.tsx` for `useRegisterSession` (`mockDrawer`), `use-register-binding` (add `useRegisterDirectory: () => mockDirectoryY`), `useAwaitingStoreCount`, `../contexts/current-order/context` (`useOpenOrdersOptional: () => mockOpenOrders`), translations via `createTestT()`, `@wcpos/components/alert-dialog` as the sheet test mocks it):

```tsx
it('renders nothing while there is no request', …);
it('hand over: the tiles, the waiting notice and the verb', () => {
	mockOpenOrders = [a, b]; mockAwaiting = 1;
	render(<SwitchConfirm request={{ kind: 'cashier', credential: amy }} onOpenChange={onOpenChange} onConfirm={onConfirm} onSignOutAnyway={jest.fn()} />);
	expect(screen.getByTestId('switch-confirm').textContent).toContain('Hand the till to Amy Okafor?');
	expect(screen.getByTestId('switch-confirm-waits').textContent).toBe('Waits here for you2 open carts · 1 unsent sale');
	expect(screen.getByTestId('user-sheet-drawer').textContent).toContain('Drawer stays at');
	fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
	expect(onConfirm).toHaveBeenCalledWith({ kind: 'cashier', credential: amy }); expect(onOpenChange).toHaveBeenCalledWith(false);
});
it('hand over: no notice when nothing waits', …) // carts 0, unsent 0 → queryByTestId('switch-confirm-waits') null
it('hand over with figures pending: the drawer tile says so', …) // mockDrawer.figuresPending = true → '—' and 'Figures arrive with the next sync'
it.each([['closed', null, 'Its register is closed.'], ['open', { opened_at_gmt: '2026-10-28T09:02:00' }, 'Its register is open since 09:02.']])('store: %s register in the target store', …);
it('store: unknown register when the target has several and none bound', …) // 'You'll choose a register there.'
it('register: the state notice and the verb', …) // 'Closed · last closure #41' + 'You'll open it with a float.'; confirm → onConfirm(request)
it('sign out: close first, or sign out anyway', () => {
	render(<SwitchConfirm request={{ kind: 'sign-out' }} … />);
	expect(screen.getByTestId('switch-confirm').textContent).toContain('Front counter is still open at $345.03. Close it first?');
	fireEvent.click(screen.getByTestId('switch-confirm-secondary'));
	expect(onSignOutAnyway).toHaveBeenCalledTimes(1); expect(onConfirm).not.toHaveBeenCalled();
});
it('sign out with figures pending: Close register is disabled, Sign out anyway is not', …);
it('sign out for a blind cashier names no amount', …);
```

- [ ] **Step 2: Run, expect FAIL** (module missing).
- [ ] **Step 3: Implement** `switch-confirm.tsx` as one component with a `switch (request.kind)` building `{ title, description, body, confirm, secondary }` then one `AlertDialog` render; extract the two tiles in `user-sheet.tsx` first (its own suite must stay green: run `user-sheet.test.tsx` after the extraction, before the confirm exists).
- [ ] **Step 4: Run both suites, expect PASS**; `pnpm exec eslint` + `prettier --check` on the three files; `pnpm test` from `packages/eslint` (text ladder: the tiles keep `Text variant="key"`; i18n: literal keys only).
- [ ] **Step 5: Commit** `feat(cashier): SwitchConfirm — one AlertDialog for hand over, switch store, switch register and sign out with an open register`.

### Task 5: The sheet asks before it acts; the three guards

**Files:**

- Modify: `packages/core/src/screens/main/pos/cart/user-sheet.tsx` (`UserRows`, `StoreBand`, `RegisterBand`, `UserSheet`)
- Modify: `packages/core/src/contexts/translations/locales/en/core.json`
- Test: `packages/core/src/screens/main/pos/cart/user-sheet.test.tsx`

**Interfaces:**

- Produces: the bands take `onChoose: (request: SwitchRequest) => void` and `busy`/`hold` only; `switchUser` (its body unchanged) moves into `UserSheet`, `bind` is read there from `useRegisterBinding()` (already called there), `handleSwitchStore` stays there. `UserSheet` holds `const [request, setRequest] = React.useState<SwitchRequest | null>(null)` and renders `<SwitchConfirm request={request} portalHost={portalHost ?? undefined} onOpenChange={(o) => { if (!o) setRequest(null); }} onConfirm={run} onSignOutAnyway={() => void act(() => logout())} />`. `run(request)`: `cashier` → `void act(() => switchUser(credential))`; `store` → `void act(async () => { if (await handleSwitchStore(store)) onOpenChange(false); })`; `register` → `void act(() => bind(register.id))`; `sign-out` → `openRegister(); void act(() => actions.startCounting())` where `openRegister` is the existing drawer-tile `onOpen` body (POS: `onOpenRegister` or `requestRegisterPanel()`; elsewhere `router.push('/(app)/(drawer)/(pos)')` first) and the sheet closes. (Slice 5 moves the count into the panel's pane; until then Close register is today's door: the count in the cart column.)
  - Sign out footer: `onPress: () => (binding.status === 'bound' && session ? setRequest({ kind: 'sign-out' }) : void act(() => logout()))`.
  - Guards, read in `UserSheet` and passed down: `const paying = usePaymentInFlight()`; `const { countingHere, session } = useRegisterSession()`; `const online = useOnlineStatus().status === 'online-website-available'`.
    - `paying` → `Notice tone="info" testID="user-sheet-hold" title={t('register.finish_payment_first')}` above the Cashier band; every row `disabled`, no `onPress`; Sign out `disabled`; Another account… hidden (as while `busy`).
    - `countingHere` → the other cashiers' rows `disabled` with `description={t('register.finish_count_first')}`; store and register rows untouched.
    - `!online` → store rows `disabled` with `description={t('register.needs_store_to_switch')}`; Another account… replaced by `<MenuRow label={t('register.another_account')} description={t('register.needs_store_to_switch')} disabled testID="user-sheet-another-account-offline" />`; cashier rows stay live (§ 5.1: hand over to a saved cashier works offline).
  - New keys: `register.finish_payment_first` "Finish the payment first", `register.finish_count_first` "Finish or abandon the count first", `register.needs_store_to_switch` "Needs the store to switch".
- Consumes: Tasks 2, 3, 4.

- [ ] **Step 1: Update the existing tests that act on a row directly** (they now go through the confirm): `switches credentials without retaining…` and `signs out to connect when the other cashier has no stores` click the row THEN `switch-confirm-confirm`; the store band tests (`switches store…`, `keeps the sheet open and shows a toast when hydration fails`, `holds the store band while a cashier switch is in flight`, `…while a register bind is pending`) click the row then the confirm; the register band test at ~773 likewise; `holds every other session-changing action while a switch is hydrating` is unchanged (rows disabled → no confirm). Add the mocks: `jest.mock('../checkout/payments/payment-in-flight', () => ({ usePaymentInFlight: () => mockPaying }))`, `let mockPaying = false`; `mockDrawer.countingHere = false`; `@wcpos/hooks/use-online-status` → `{ useOnlineStatus: () => ({ status: mockOnline ? 'online-website-available' : 'offline' }) }` (check whether the file already mocks it through `use-register-binding`'s mock; the sheet now reads it directly).
- [ ] **Step 2: Failing tests**:

```tsx
it('asks before handing the till over, and runs the login on confirm', …) // click row → confirm visible, login not called; click confirm → login called
it('cancelling the confirm leaves everything as it was', …) // click row, click switch-confirm-cancel → no login, sheet open
it('holds every row and Sign out while a payment is in flight, and says why once', () => {
	mockPaying = true; render(…);
	expect(screen.getByTestId('user-sheet-hold').textContent).toContain('Finish the payment first');
	for (const id of ['user-sheet-user-other', 'user-sheet-store-store-b', 'user-sheet-register-back']) expect(screen.getByTestId(id).getAttribute('aria-disabled')).toBe('true');
	expect((screen.getByTestId('user-sheet-sign-out') as HTMLButtonElement).disabled).toBe(true);
	expect(screen.queryByTestId('switch-confirm')).toBeNull();
});
it('holds only the cashier rows while this device is counting', …) // mockDrawer.countingHere = true → other cashier disabled with 'Finish or abandon the count first'; store-b and register-back not disabled
it('offline: store rows and Another account are held, a saved cashier is not', …) // description 'Needs the store to switch'; user-sheet-another-account-offline present; clicking user-sheet-user-other opens the confirm
it('Sign out with an open register asks to close first; Close register opens the count', …) // click sign out → switch-confirm; click confirm → startCounting called, requestRegisterPanel consumed (POS) ; logout not called
it('Sign out anyway signs out', …) // secondary → mockLogout once
it('Sign out with the register closed signs out at once', …) // mockDrawer.session = null → logout, no confirm
```

- [ ] **Step 3: Run, expect FAIL.** - [ ] **Step 4: Implement** per Interfaces. - [ ] **Step 5: Run `user-sheet.test.tsx`, `switch-confirm.test.tsx`, `src/seam.test.ts`; tsc from `packages/core` AND from `apps/main` (`NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc --noEmit`, ~70 s; typed routes); eslint, prettier; `pnpm test` from `packages/eslint`; count the budget.**
- [ ] **Step 6: Commit** `feat(cashier): every switch asks first — the confirm in front of hand over, store, register and sign out; payment, count and offline guards`.

### Task 6: Standards, ledgers, spec correction

**Files:**

- Modify: `CODING_STANDARDS.md` § Situation (overlay table: add the row "A switch or sign-out needs a yes · `SwitchConfirm` (centred `AlertDialog` over the cashier sheet; z-70 above the panel)"; keep column widths, no table reflow beyond the row)
- Modify: `packages/core/src/screens/main/pos/cart/LEDGER.md` (one line: the confirm in front of every switch, the three guards; evidence: spec § 4.6, this PR)
- Modify: `packages/core/src/screens/main/pos/checkout/LEDGER.md` or the nearest ledger for `payments/` (one line: the payment-in-flight read and the pay frame mark)
- Modify: `packages/core/specs/2026-10-28-cashier-register-map-design.md` § 4.6 "Which register in Y": `register-document.ts` keys `sites[siteUuid].bindings[storeId]` (slice 1), read through `useRegisterDirectory(storeId).registerId`.

- [ ] **Step 1:** make the four edits. - [ ] **Step 2:** `pnpm exec prettier --check` on the `.md` files touched. - [ ] **Step 3: Commit** `docs(cashier): the confirm in the standards table and the ledgers; § 4.6 names the per-store pointer as the code keys it`.

## Self-review

- Spec coverage: § 4.6 table rows 1–4 → Task 4 (carry/RadioGroup excluded by § 5 slice 3); guards → Task 5; `AlertDialogFooter secondary` → Task 1; "Which register in Y" → Task 4 store case through `useRegisterDirectory`; § 4.9 rule 1 → Task 4 (pending tile, disabled Close register); rule 2 is the carry's (slice 6). § 4.3 "a tap on another opens the … confirm" → Task 5.
- Types: `SwitchRequest` is defined once in `switch-confirm.tsx` and imported by `user-sheet.tsx`; `Register` is the module-private type at `services/register/use-register-binding.ts:20` — Task 4 adds `export` to it (one word, no other change); `countingHere` (Task 3) is the name Task 5 reads.
- Deviations from the spec's letter, each stated above: the elapsed `3 h 20 m` on the sales tile is `since HH:MM` (no elapsed formatter exists; slice 4's header "age" brings one); the payment-in-flight reason is one Notice over the sheet rather than a description on every row; Close register in the sign-out confirm is today's door (the count in the cart column) until slice 5 moves it into the panel.
- Budget: Task 1 ≈ 15, Task 2 ≈ 40, Task 3 ≈ 8, Task 4 ≈ 200 (the tiles move, net ≈ 0), Task 5 ≈ 70 net, Task 6 docs — about 330 of 400.
