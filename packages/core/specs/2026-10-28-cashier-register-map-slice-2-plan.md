# Cashier/register map · slice 2 (the cashier sheet) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one sheet for who and where: the cashier sheet slides from the products side on the POS, carries the cashier's figures and the drawer's door, lists cashiers, stores and registers as bands of choice rows, and replaces the separate switch-store sheet and the bar's store sheet.

**Architecture:** `UserSheet` keeps its host (`CashierEntry`, one per screen tree) and gains three bands built from reads that already exist (`credentialsListResource`, `storeListResource`, `useRegisterBinding().registers`, `useRegisterSession`); two tiny request modules (the shape of `register-picker-request.ts`) let the bar's store title open the sheet and let the rail's sheet open the register panel on the POS. The switches themselves stay what they are today (a reload for a cashier or store, a bind for a register); slice 3 puts the confirm in front of them.

**Tech Stack:** React Native + Web, `@wcpos/components` (`Dialog*`, `MenuRow`, `Notice`, `Avatar`, `AmountFigure`), observable-hooks, Jest + Testing Library (jsdom).

**Spec:** `packages/core/specs/2026-10-28-cashier-register-map-design.md` § 4.1, § 4.2, § 4.3, § 4.8. Depends on slice 1 (`readLiveSession` from `@wcpos/query/register-session`) for the Register band's live state; everything else is independent of it.

## Global Constraints

- Lane `next`; one PR, ≤ 450 added production lines (tests, strings, docs, the deleted files excluded; every deletion this plan names is authorised and does not count).
- Jest from `packages/core`: `NODE_OPTIONS=--max-old-space-size=6144 pnpm exec jest --maxWorkers=2 --coverage=false <files>`; one jest process at a time; never the whole suite.
- Components only: no `Button` inside a footer; a switch row is a `MenuRow` (`menu-row--choice` story: the check on the current one); the Awaiting store rows become a `Notice`; the two web links stay plain `MenuRow`s; the figure tile is the closure sheet's recipe (`border-border rounded-lg border px-3 py-2.5`, label `text-muted-foreground text-sm`, `AmountFigure size="tile"`).
- Every string through `t()`; new keys in `packages/core/src/contexts/translations/locales/en/core.json`: `register.on_the_till_since` (`since {time}`), `register.in_the_drawer_tile` (`In the drawer`), `register.register_closed_last_closure` (`Register closed · last closure {n}`), `register.cashier` (`Cashier`), `register.store` (`Store`), `register.register` (`Register`), `register.open_since_name` (`Open since {time} · {name}`), `register.closed_last_closure_short` (`Closed · last closure #{number}`), `register.counting_short` (`Counting`). Reuse `register.your_sales_today`, `register.another_account`, `register.switch_register_blocked_cart`, `register.awaiting_store_*`, `common.wordpress_admin`, `common.desktop_app`, `register.sign_out`, `register.current`.
- The deleted test file `switch-store-sheet.test.tsx` needs the `Test-Removal:` trailer in the commit that deletes it, before the first push (its three behaviours move into `user-sheet.test.tsx`, Task 4).
- Adding `readLiveSession` as an import into `user-sheet.tsx`: `user-sheet.test.tsx` does not mock `@wcpos/query/register-session`, so nothing to add there; the suites that mock it literally do not render the sheet.
- `packages/core/src/seam.test.ts` runs with every task's tests (a new hook member named like a mutator would trip it).

## Review Focus

1. The sheet opened from the rail on the Orders screen: the drawer tile must land on the POS with the panel open, not do nothing. → Task 2's rail test.
2. Products on the right (`pos-products` position `right`): the sheet comes from the right on the POS, not the left. → Task 1's side test.
3. One store on the login, one register on the store (Free): no Store band, no Register band, no empty headings. → Task 4's one-store test and Task 5's one-register test.
4. A cart attributed to this register: Register rows disabled with the reason, the Cashier rows still enabled. → Task 5's attributed test.
5. The store switch failing to hydrate: the sheet stays open with the toast, the blocking overlay gone. → Task 4's failure test (moved from the deleted sheet).

---

### Task 1: The sheet's side and header

**Files:**
- Modify: `packages/core/src/screens/main/pos/cart/user-sheet.tsx` (`UserSheet` props and the `DialogContent side`; the header's description)
- Modify: `packages/core/src/screens/main/components/cashier-entry/index.tsx` (pass `portalHost` through as today; nothing else yet)
- Test: `packages/core/src/screens/main/pos/cart/user-sheet.test.tsx`

**Interfaces:**
- Produces: `UserSheet` computes its side from the ROUTE, not the portal host (the rail's entry on the POS passes `portalHost={null}`, `drawer-content/index.tsx:147-151`): `const onPOS = useSegments().includes('(pos)')` (expo-router), `const cartSide = usePanelSide('cart')`, `const side = onPOS ? cartSide : 'right'`. The portal host keeps deciding only where the dialog portals. The header description is one string built from parts joined by ` · `: store name, register name (only when the store has more than one register, `binding.registers.length > 1`), `t('register.on_the_till_since', { time })` where `time` is the credential's `last_access` formatted `HH:MM` in the store day's timezone, omitted when `last_access` is empty.
- Consumes: `usePanelSide` (`../contexts/overlay-side`), `useRegisterBinding`, `useDocField(wpCredentials, v => v.last_access)`.

- [ ] **Step 1: Failing tests** (the file mocks `../contexts/overlay-side` at line 116 as `() => 'right'`; change that mock to a settable `let mockCartSide = 'left'` returned by `usePanelSide`):

```ts
it('comes from the products side on the POS, whichever host portals it, and from the right elsewhere', () => {
	mockCartSide = 'left'; mockSegments = ['(app)', '(drawer)', '(pos)'];
	let r = render(<UserSheet open onOpenChange={() => {}} portalHost="pos" />);
	expect(screen.getByTestId('user-sheet')).toHaveAttribute('data-side', 'left');
	r.unmount();
	r = render(<UserSheet open onOpenChange={() => {}} portalHost={null} />); // the rail's entry on the POS
	expect(screen.getByTestId('user-sheet')).toHaveAttribute('data-side', 'left');
	r.unmount();
	mockCartSide = 'right';
	r = render(<UserSheet open onOpenChange={() => {}} portalHost={null} />); // products on the right
	expect(screen.getByTestId('user-sheet')).toHaveAttribute('data-side', 'right');
	r.unmount();
	mockSegments = ['(app)', '(drawer)', 'orders'];
	render(<UserSheet open onOpenChange={() => {}} portalHost={null} />);
	expect(screen.getByTestId('user-sheet')).toHaveAttribute('data-side', 'right');
});
it('describes the cashier by store, register and sign-in time', () => {
	// credentials last_access '2026-10-28T13:05:00Z', two registers on the store, register name 'Front counter'
	render(<UserSheet open onOpenChange={() => {}} portalHost="pos" />);
	expect(screen.getByTestId('user-sheet-description').textContent).toBe('UK Store · Front counter · since 13:05');
});
```

  If `DialogContent` does not expose `data-side` in the jsdom render, assert through the file's `DialogContent` mock instead (add one that records its `side` prop), the way `register-panel.test.tsx` fakes the dialog.

- [ ] **Step 2: Run the file, see the two fail.**
- [ ] **Step 3: Implement** the side rule and the description (`testID="user-sheet-description"` on the `DialogDescription`).
- [ ] **Step 4: Run the file: PASS** (the existing header test still passes).
- [ ] **Step 5: Commit** `feat(cashier): the cashier sheet opens from the products side on the POS and describes store, register and sign-in`.

### Task 2: The figure tiles and the register door

**Files:**
- Modify: `packages/core/src/screens/main/pos/cart/user-sheet.tsx` (the body's first block, replacing the `SalesToday` static row)
- Create: `packages/core/src/screens/main/pos/cart/register-panel-request.ts` (the exact shape of `register-picker-request.ts`: `requestRegisterPanel()`, `consumeRegisterPanelRequest(): boolean`, `useRegisterPanelRequested(): boolean`). **Only a focused consumer claims a request:** the phone POS keeps both tabs mounted (`(tabs)/_layout.tsx`, `lazy: false`), each with a `RegisterBar`, so the consuming effect runs `useIsFocused()` (`@react-navigation/native`) and returns without consuming when false; the claim (`consume…()`) happens before the open, in the same effect.
- Modify: `packages/core/src/screens/main/pos/cart/register-bar.tsx` (consume the request: `useRegisterPanelRequested()` true → `onPanelOpenChange(true)` and `consumeRegisterPanelRequest()`, in an effect; pass `onOpenRegister={() => onPanelOpenChange(true)}` to `BarControls`)
- Modify: `packages/core/src/screens/main/components/bar-controls/index.tsx` (prop `onOpenRegister?: () => void` passed to `CashierEntry`)
- Modify: `packages/core/src/screens/main/components/cashier-entry/index.tsx` (prop `onOpenRegister?: () => void` passed to `UserSheet`; when absent the sheet's door navigates: `router.push('/(app)/(drawer)/(pos)')` then `requestRegisterPanel()`)
- Modify: `packages/core/src/screens/main/components/drawer-content/rail/index.tsx` (nothing: the rail's entry has no `onOpenRegister`, so it navigates)
- Test: `user-sheet.test.tsx`, `register-bar.test.tsx`, `cashier-entry/index.test.tsx`

**Interfaces:**
- Produces: in the sheet, two figure tiles in a `flex-row gap-2`: **Your sales today** (`testID="user-sheet-sales-today"`, `useSalesToday()` formatted) and **In the drawer** (`testID="user-sheet-drawer"`, pressable: `onOpenRegister ? onOpenRegister() : navigate-and-request`, then `onOpenChange(false)`), whose value is `format(expected.cash)` with the sub-line `opened HH:MM by <Avatar size="sm" of the opener>` when a session is open; `t('register.register_closed_last_closure', { n })` when closed with a last closure; the tile absent when `binding.status !== 'bound'`. Blind cashier: the drawer tile shows `t('register.sales_count', { count: salesCount })` instead of the figure.
- Consumes: `useRegisterSession()` (`session`, `expected`, `lastClosure`, `blind`, `salesCount`, `binding`), `credentialsListResource(site)` for the opener's name (as `Opener` in `register-panel.tsx:52-60`), `useRouter` from `expo-router`.

- [ ] **Step 1: Failing tests:**

```ts
// user-sheet.test.tsx
it('shows the drawer as a door and opens the register panel on the POS', () => {
	const onOpenRegister = jest.fn();
	render(<UserSheet open onOpenChange={onOpenChange} portalHost="pos" onOpenRegister={onOpenRegister} />);
	expect(screen.getByTestId('user-sheet-drawer').textContent).toContain('345,03');
	fireEvent.click(screen.getByTestId('user-sheet-drawer'));
	expect(onOpenRegister).toHaveBeenCalled();
	expect(onOpenChange).toHaveBeenLastCalledWith(false);
});
it('from the rail, the drawer door goes to the POS and asks for the panel', () => {
	render(<UserSheet open onOpenChange={onOpenChange} portalHost={null} />);
	fireEvent.click(screen.getByTestId('user-sheet-drawer'));
	expect(mockPush).toHaveBeenCalledWith('/(app)/(drawer)/(pos)');
	expect(consumeRegisterPanelRequest()).toBe(true);
});
it('says the register is closed with its last closure when there is no session', () => {
	// session null, lastClosure { number: 12 }
	expect(screen.getByTestId('user-sheet-drawer').textContent).toContain('Register closed · last closure 12');
});
// register-bar.test.tsx
it('opens the register panel when the rail asked for it, on the focused bar only', () => {
	requestRegisterPanel();
	mockFocused = false; // the hidden tab's bar
	render(<RegisterBar panelOpen={false} onPanelOpenChange={hiddenOpen} />);
	mockFocused = true;
	render(<RegisterBar panelOpen={false} onPanelOpenChange={onPanelOpenChange} />);
	expect(hiddenOpen).not.toHaveBeenCalled();
	expect(onPanelOpenChange).toHaveBeenCalledWith(true);
	expect(consumeRegisterPanelRequest()).toBe(false);
});
```

- [ ] **Step 2: Run the three files, see the new tests fail.**
- [ ] **Step 3: Implement.** The sheet's `useRegisterSession` is available on every screen (the bridge is mounted at the store-session level); if a test renders the sheet without the session providers, mock the hook as `register-panel.test.tsx` does.
- [ ] **Step 4: Run the three files: PASS.**
- [ ] **Step 5: Commit** `feat(cashier): the sheet carries the cashier's sales and the drawer as a door to the register panel`.

### Task 3: The Awaiting store Notice and the Cashier band

**Files:**
- Modify: `user-sheet.tsx` (`AwaitingStore` → `Notice`; `UserRows` → a band)
- Test: `user-sheet.test.tsx` (`describe('awaiting store')` tests keep their assertions on the text; add the band test)

**Interfaces:**
- Produces: `<Notice tone="warning" testID="user-sheet-awaiting-store">` with the count line and the existing sub-line. The **Cashier** band: a band heading `t('register.cashier')` (the panel's `h-band … uppercase` recipe), then one `MenuRow` per credential on this site including the current one, the current one with the check (`trailing={<Icon name="check" />}` or the `menu-row--choice` prop, whichever `MenuRow` exposes), the others `onPress={switchUser}` exactly as today; then `AddUserButton` as today. `SectionHeading` and the `Switch user` heading go.
- Consumes: as today.

- [ ] **Step 1: Failing test:**

```ts
it('lists every cashier saved on this device with the current one checked', () => {
	render(<UserSheet open onOpenChange={() => {}} portalHost="pos" />);
	expect(screen.getByTestId('user-sheet-cashier-current')).toBeTruthy(); // the current credential's row
	expect(screen.getByTestId('user-sheet-user-other')).toBeTruthy();
});
```

- [ ] **Step 2: Run, see it fail. Step 3: Implement. Step 4: Run the file: PASS** (the `awaiting store` describe and `'switches credentials without retaining…'` unchanged).
- [ ] **Step 5: Commit** `feat(cashier): awaiting-store as a Notice; the cashiers as a band with the current one checked`.

### Task 4: The Store band replaces the switch-store sheet

**Files:**
- Modify: `user-sheet.tsx` (the Store band; the blocking overlay from `switch-store-sheet.tsx` moves in verbatim: the `Portal name="store-switch-overlay"` block and the `onOpenChange` guard that refuses dismissal while `isSwitching`)
- Delete: `packages/core/src/screens/main/pos/cart/switch-store-sheet.tsx`, `packages/core/src/screens/main/pos/cart/switch-store-sheet.test.tsx` (trailer `Test-Removal: switch-store-sheet.test.tsx — its three behaviours now run in user-sheet.test.tsx (the Store band)`)
- Create: `packages/core/src/screens/main/components/cashier-entry/cashier-sheet-request.ts` (the `register-picker-request.ts` shape: `requestCashierSheet()`, `consumeCashierSheetRequest(): boolean`, `useCashierSheetRequested(): boolean`)
- Modify: `cashier-entry/index.tsx` (an effect: `useCashierSheetRequested()` true and `useIsFocused()` true → consume, then `setOpen(true)`; an unfocused entry never consumes, so on the phone the hidden tab's bar entry leaves the request to the visible one; the rail's entry has no navigator screen of its own and counts as focused)
- Modify: `register-bar.tsx` (the store title's `onPress` becomes `requestCashierSheet()`; delete the `SwitchStoreSheet` host, `storeOpen` state and import)
- Modify: `packages/core/src/screens/main/pos/cart/LEDGER.md` line 68 (the overlay now lives in the cashier sheet's Store band)
- Test: `user-sheet.test.tsx`, `register-bar.test.tsx`, `cashier-entry/index.test.tsx`, `use-switch-store.suspense.test.tsx` (its `describe('user menu store switcher')` renders the sheet; keep it green)

**Interfaces:**
- Produces: the **Store** band only when `stores.length > 1`: heading `t('register.store')`, one `MenuRow` per `storeListResource(wpCredentials)` row, `testID={`user-sheet-store-${localID}`}`, the current (`localID === store.localID`) checked and not pressable, the others `onPress={() => handleSwitchStore(row)}` from `useSwitchStore()`, all disabled while `isSwitching`. The `describe('switch store')` tests change: `'closes the sheet and opens the store switch on its own host…'` becomes `'lists the other stores in the Store band when the login has more'`.
- Consumes: `useSwitchStore` (`./use-switch-store`), `storeListResource` (`../../hooks/store-list-resource`).

- [ ] **Step 1: Failing tests in `user-sheet.test.tsx`** (moved from the deleted file, retargeted at the band):

```ts
describe('store band', () => {
	it('offers no store band on a login with one store', () => { /* mockStores = ['store-a'] */ expect(screen.queryByTestId('user-sheet-store-band')).toBeNull(); });
	it('switches to the chosen store from the band', async () => { /* as 'switches to the chosen store, then closes' asserted handleSwitchStore + close */ });
	it('blocks the app and refuses dismissal while a switch is hydrating', () => { /* the overlay testID 'store-switch-overlay' and onOpenChange(false) ignored */ });
	it('keeps the sheet open and shows a toast when hydration fails', async () => { /* Toast.show called, sheet still open */ });
});
// register-bar.test.tsx
it("the store title asks for the cashier sheet instead of a sheet of its own", () => {
	fireEvent.click(screen.getByTestId('register-bar-store'));
	expect(consumeCashierSheetRequest()).toBe(true);
	expect(screen.queryByTestId('switch-store-sheet')).toBeNull();
});
// cashier-entry/index.test.tsx
it('opens one sheet for one request when two entries are mounted and one is focused', () => {
	requestCashierSheet();
	mockFocused = false; render(<CashierEntry testID="hidden" placement="bar" portalHost="pos" />);
	mockFocused = true; render(<CashierEntry testID="shown" placement="bar" portalHost="pos" />);
	expect(screen.getAllByTestId('user-sheet')).toHaveLength(1);
	expect(consumeCashierSheetRequest()).toBe(false);
});
```

- [ ] **Step 2: Run the four files, see the new tests fail.** Step 3: Implement; delete the two files. **Step 4: Run the four files: PASS.**
- [ ] **Step 5: Commit** with the trailer: `feat(cashier): the stores are a band of the cashier sheet; the switch-store sheet goes` + `Test-Removal: …`.

### Task 5: The Register band

**Files:**
- Modify: `user-sheet.tsx` (the band; delete the `Switch register` `MenuRow` and the `onSwitchRegister` prop)
- Modify: `cashier-entry/index.tsx`, `bar-controls/index.tsx`, `register-bar.tsx`, `drawer-content/rail/index.tsx`, `navigation-area/index.tsx` and the phone tab layouts that pass `onSwitchRegister` (delete the prop end to end; `register-picker-request.ts` stays for the unbound picker in the cart column, which the Register band does not replace)
- Test: `user-sheet.test.tsx`, `cashier-entry/index.test.tsx` (`'opens the one cashier surface from the avatar, on the host and with the rows it is given'` drops its `onSwitchRegister` expectation)

**Interfaces:**
- Produces: the **Register** band only when `binding.registers.length > 1`: heading `t('register.register')`, one `MenuRow` per register, `testID={`user-sheet-register-${id}`}`, label the name, description from the register's state: `row.session ?? readLiveSession(site.uuid, row.id)` → `t('register.open_since_name', { time, name })` for `open`, `t('register.counting_short')` for `counting`, else `t('register.closed_last_closure_short', { number: row.last_closure?.number ?? '—' })`; the current (`id === binding.registerId`) checked; the others `onPress={() => bind(id)}` (`useRegisterBinding().bind`), disabled with `description={t('register.switch_register_blocked_cart')}` while `attributed` (today's rule, `isCartAttributed(currentOrder.payload)`); the band hidden while `binding.status !== 'bound'` (the cart column's picker owns the unbound case).
- Consumes: `useRegisterBinding()` (`registers`, `registerId`, `status`, `bind`), `readLiveSession` (slice 1).

- [ ] **Step 1: Failing tests:**

```ts
describe('register band', () => {
	it('offers no register band on a store with one register', () => { expect(screen.queryByTestId('user-sheet-register-band')).toBeNull(); });
	it('lists each register with its live state and binds the tapped one', async () => {
		// registers: Front counter (bound, session open since 09:02 by Amy), Back office (closed, last_closure 41)
		expect(screen.getByTestId('user-sheet-register-back').textContent).toContain('Closed · last closure #41');
		fireEvent.click(screen.getByTestId('user-sheet-register-back'));
		await waitFor(() => expect(mockBind).toHaveBeenCalledWith('back'));
	});
	it('disables the other registers with the reason while a cart is attributed', () => {
		expect(screen.getByTestId('user-sheet-register-back')).toHaveAttribute('aria-disabled', 'true');
		expect(screen.getByTestId('user-sheet-register-back').textContent).toContain('Finish or park the current sale');
	});
});
```

  The existing `'allows switching from an empty attributed template'` (line 279) asserted the old row; rewrite it against `user-sheet-register-back` being enabled on an empty attributed template.

- [ ] **Step 2: Run, see them fail. Step 3: Implement; delete `onSwitchRegister` end to end. Step 4: Run `user-sheet.test.tsx`, `cashier-entry/index.test.tsx`, `register-bar.test.tsx`, `bar-controls/index.test.tsx`, `drawer-content/index.test.tsx`, `navigation-area/index.test.tsx`, `apps/main/__tests__/pos-phone-tab-bar.test.tsx` (if it passes the prop): PASS.**
- [ ] **Step 5: Commit** `feat(cashier): the registers are a band of the cashier sheet with their live state`.

### Task 6: The foot, the standards row and the ledgers

**Files:**
- Modify: `user-sheet.tsx` (the two links under a hairline at the foot: a `View className="border-border mt-auto border-t"` wrapping the two `MenuRow`s; `Platform.isWeb` as today)
- Modify: `CODING_STANDARDS.md:384` (the row: `The cashier (switch user, register, store; sign out)` → overlay `UserSheet` (products side on the POS via `usePanelSide('cart')`, `right` elsewhere) · notes: the one cashier surface on every screen; the stores and registers are its bands)
- Modify: `packages/core/src/screens/main/pos/contexts/overlay-side/LEDGER.md` line 3 (append: `_(amended 2026-10-28: the cashier opens over the products like the register sheets; the bell alone stays right; spec packages/core/specs/2026-10-28-cashier-register-map-design.md § 4.1)_`)
- Modify: `packages/core/src/screens/main/pos/cart/LEDGER.md` (line 50's switch rule unchanged; a new line for the bands and the door)
- Test: `user-sheet.test.tsx` (`'keeps only the WordPress admin and desktop links beside the till actions'` → asserts the links are the last rows and under the foot container `user-sheet-foot`)

- [ ] **Step 1: Adjust the test; run; fail. Step 2: Implement. Step 3: Run `user-sheet.test.tsx` and `src/seam.test.ts`: PASS.**
- [ ] **Step 4: Lint the changed files; count added lines (`git diff --stat origin/next -- ':!*.test.*' ':!*.json' ':!*.md'` ≤ 450).**
- [ ] **Step 5: Commit** `docs(core): the cashier sheet's side and bands in the standards and ledgers`; push; PR to `next` with the spec reference and the test commands.

---

## Self-review

- **Spec § 4.3 coverage:** header (T1), figure tiles and the door (T2), Notice and Cashier band (T3), Store band and the deleted sheet and the bar's title (T4), Register band and the picker rule (T5), links at the foot and Sign out unchanged (T6), the side rule (T1), the standards row and ledgers (T6). "Another account…" stays as `AddUserButton` (T3). The confirm is slice 3 and is not here.
- **Types:** `onOpenRegister?: () => void` is the one new prop, carried `RegisterBar → BarControls → CashierEntry → UserSheet`; `onSwitchRegister` is removed from all four in T5. `requestRegisterPanel` / `consumeRegisterPanelRequest` / `useRegisterPanelRequested` (T2) and `requestCashierSheet` / `consumeCashierSheetRequest` / `useCashierSheetRequested` (T4) mirror `register-picker-request.ts` exactly.
- **Review focus:** 1 → T2 rail test; 2 → T1 side test (the products-right case is in it; the side comes from the route, so the rail's null host on the POS is covered too); 3 → T4 one-store test, T5 one-register test; 4 → T5 attributed test; 5 → T4 failure test.
- **Proportion:** signatures and tests only; bodies left to the implementer. The `last_access` field exists on the credential schema (`packages/database/src/collections/schemas/wp-credientials.ts:49`); whether login refreshes it is for T1's implementer to check, and if it does not, the header omits the time rather than inventing one.
