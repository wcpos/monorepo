Coding standards for the WCPOS monorepo, including the owner's UI design rules.
`/code-review` reads this file on the Standards axis.

## React, TypeScript, and Logging

Applies to `**/*.{ts,tsx}`.

### Namespace Imports

Always use namespace imports for React hooks: `React.useState`, `React.useRef`, etc. Never destructure hooks from `react`.

### useEffect Rules

- `useEffect` is a last resort. Prefer derived state, event handlers, or external stores such as React Query or RxJS.
- If used, add a comment explaining why.
- Never use `useEffect` to react to state you just set; handle that in the event handler.
- Mount-only effects must use `[]` deps. Use a ref if you need a value without re-triggering.

### Logging

- No `console.log`; use `import { log } from '@wcpos/utils/logger'`.
- Error codes: `import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated'`.

### TypeScript

- No `any`. Use strict types and generics.

## Table and List Pagination

- Auto-pagination requires a measured, positive-size viewport. Hidden/inactive screens can stay mounted with zero layout; zero geometry is not "at the bottom".
- Apply this gate to scroll, content-size, layout, and rendered-row callbacks; recheck when the viewport becomes visible so short pages still fill normally.
- Reuse the shared virtualized list where applicable. Custom ScrollViews must preserve the same hidden/visible contract and test it; do not disable scrolling or background sync globally.

## Styling and Theming

Applies to `**/*.tsx` and `**/global.css`.

### Semantic Color Classes

Prefer semantic classes over hardcoded colors to preserve theme compatibility.

| Class               | Purpose                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg-background`     | Main app background                                                                                                                                                                                 |
| `bg-card`           | Card/elevated surfaces                                                                                                                                                                              |
| `bg-sidebar`        | Navigation sidebar                                                                                                                                                                                  |
| `bg-muted`          | Muted elements/buttons                                                                                                                                                                              |
| `text-warning-text` | warning words and every warning glyph (register-count lock, open-orders clock, Icon `warning`); `warning` is the fill (register-bar, StatusBadge dot, Badge); state classes come from `lib/tone.ts` |
| `bg-table-header`   | Data table headers                                                                                                                                                                                  |

### Theme Switching and Native Issues

- Use `Uniwind.setTheme('name')` or the `useUniwind()` hook.
- Prefer `className` over inline styles.

### Status Bar

Use `react-native-edge-to-edge` and match the status bar to the background context:

```typescript
import { SystemBars } from 'react-native-edge-to-edge';

const { theme } = useUniwind();
const style = theme === 'light' ? 'dark' : 'light';
<SystemBars style={style} />;
```

### Typography

Base font size: Web = 14px, Native = 16px. Use rem-based classes for proportional scaling: `text-xs`, `text-sm`, `text-base`, `text-lg`.

## Translations

1. Write `t('namespace.descriptive_key')` — key only. Never `t(key, 'English')` or
   `t(key, { defaultValue: 'English' })`.
2. Put the English in `en/core.json`, with `{interpolation}` placeholders. Pass interpolation
   variables as the second argument: `t('health.database.n_stuck', { n })`.

3. Test fakes for `t` must resolve from the catalog (`packages/core/jest/translate.ts`) or return
   the key — never from an inline default.

## E2E selectors

E2E tests must use stable `testID` selectors for app UI. Do not use localized UI text as selectors: no `getByText`, no `getByPlaceholder`, no `getByLabel`, and no `getByRole(..., { name })` in `apps/main/e2e`. If a UI element needs to be exercised by E2E, add a stable `testID` to the component and select it with `getByTestId()`. (Reading a testID-addressed cell's `textContent` is fine; _selecting_ by text is not.)

**Assertions follow the same referent discipline.** Never assert on a composite or translated sentence when a value-bearing testID exists: `data-table-count` renders `Showing {shown} of {total}`, so a digit regex on it (`/[1-9]/`, `/\b1\b/`) matches the SERVER total and passes on an empty grid — the exact failure that let a dead scope database pass readiness on 2026-08-19 (#1336, #1345). Assert `data-table-loaded-count` (the rendered-row count on its own; `display:none`, so use text assertions, not visibility). Where a composite string deliberately IS the referent (e.g. probing the server total), say so in a comment naming which constituent is being read.

Tests must be language-agnostic because demo stores may run in any locale.

1. Prefer `getByTestId`; add `testID` props to components, which map to `data-testid` on web.
2. Use structural locators such as `getByRole`, element counts, and attribute selectors.
3. No `getByText`, dynamically rendered list items included — give each row an id-bearing `testID` (owner ruling 2026-10-01, resolving the older exception against the policy above).
4. Verify network behavior with `waitForResponse` for API assertions rather than asserting translated text.
5. Anchor text assertions to testID-located elements, e.g. `toContainText` on a `getByTestId` locator.

## E2E store-agnostic

E2E specs must pass against **any** store — never against one store's remembered contents. A spec that hardcodes a product name, an order number, or a customer that "should exist" is deterministically wrong the day the store drifts, and it reads as a product regression (this cost a full diagnosis loop on 2026-08-07).

- **Create-and-find is the primary pattern.** A spec that needs data creates its own record with a unique probe token (single alphanumeric word, ≥ 3 chars for the search tokenizer — see `mintSearchProbeToken` in `apps/main/e2e/search-probe.ts`), acts on it, and asserts on _that_ record. This also exercises the full pipeline: server write → sync demand → materialization → rendered row.
- **No fixture-content assumptions.** Never assert absolute row counts, other records' names/ids, or hidden-column values. Count assertions are relative; row assertions target the probe's id-bearing testID.
- **Both permalink styles.** Any direct REST call must tolerate pretty (`/wp-json/...`) and plain (`?rest_route=...`) permalinks — see `probeRequest` in `search-probe.ts`.
- **Infra identities are keyed by well-known username, never server-specific ids.**
- **Declared-missing environment is a skip; broken environment is a failure.** Zero rows in scope, or a capability the environment never claimed (no writer credentials configured, the anonymous demo user's known catalog read-only 403) produce `test.skip` with a reason naming exactly what's missing — the spec lights up when the environment provides it. But when the environment _declares_ a capability (credentials configured) and the operation still fails (401/403/500), that is a **test failure**, not a skip — otherwise an auth or creation regression turns CI green while the covered behavior silently goes untested.
- **Leftover probe records on dev stores are acceptable** (owner ruling, 2026-08-07): unique per-run tokens make past probes invisible to future runs; delete in teardown only best-effort, never letting teardown fail a test.

## WCPOS Naming Convention

Due to copyright considerations, use these product names:

| Correct   | Incorrect           |
| --------- | ------------------- |
| WCPOS     | WooCommerce POS     |
| WCPOS Pro | WooCommerce POS Pro |

Guidelines:

- In code, UI, and documentation, use `WCPOS` or `WCPOS Pro`.
- WordPress.org slug exception: `woocommerce-pos` remains unchanged.
- GitHub repository name exceptions: `woocommerce-pos` and `woocommerce-pos-pro` remain unchanged.
- Existing database field exceptions: fields like `wcposVersion` and `wcposProVersion` remain unchanged.
- ZIP filename exceptions: `woocommerce-pos.zip` and `woocommerce-pos-pro.zip` remain unchanged.

## Design

The owner's UI design position. The long form with sources and rationale is `docs/design/ui-design-guidelines.md` in `wcpos/roadmap`. A PR that breaks one of these rules needs a stated reason in its body, not a quiet exception.

### The two sentences everything else serves

1. **As simple as possible on the surface, with deep complexity a few taps away.** The default
   screen shows only what the common case needs. Everything else exists, is reachable in one or
   two taps, and is never deleted to make the screen look clean.
2. **Clean and modern, following Apple's touch-screen guidance, and it should spark small moments
   of joy for the cashier.** Joy here means speed, precision and a quiet acknowledgement when
   something completes. It never means decoration.

### Who is standing in front of it

A cashier at a counter, standing, arm's length from a shared tablet, under shop lighting, with a
customer waiting. Sometimes a stall-holder who last opened the app four months ago. Judge every
screen at 5 pm with a queue: can the next action be found in under a second without reading?

### Rules

#### 1. One number, one action

Each screen has one figure that leads and one primary action. Nothing else competes with them
in size, weight or colour. A second amount (a split leg, a custom amount) appears only when it
differs from the first, and then as a plan (_Payment 1 of 2_), not a second total.

#### 2. Touch first

- Minimum tap target 44 × 44 pt (Apple HIG); 48 pt preferred (Material, about 9 mm). Gaps of at
  least 8 pt between adjacent targets, about 12 pt of padding around a bordered control.
- Keys and tiles the cashier hits every sale (tender keypad, payment tiles, product grid, Pay) are
  at least 56 pt tall on a tablet. Kiosk research keeps finding fewer touch errors up to about
  20 mm, so a bigger key is never wasted space.
- The same CSS size is smaller in millimetres on a phone than on a 24" counter screen; check the
  physical size on the device class, not the number in the stylesheet.
- Destructive actions (void, cancel payment, delete) sit apart from constructive ones, never in
  the same row at the same weight.
- No hover-only affordances. Hover and keyboard are desktop extras layered on a touch design.
- A press shows a visible pressed state within 100 ms. Silence after a tap is a bug.

#### 3. Apple's grammar, our accent

- Navigation, modality, sheets, popovers, safe areas and typography follow the Human Interface
  Guidelines. Full-screen for multi-step tasks; sheets for short, dismissable ones; popovers for
  small choices; never an enlarged centred modal for a task that grew.
- **Back points where the content goes.** A back arrow on a pane that sits to the left of what it
  returns to is wrong; use a close (×) or a labelled action instead.
- System fonts. Tabular numerals for every amount. Base size 14 px web, 16 px native; nothing
  below 12 px, and never below 14 px for anything the cashier reads at arm's length.
  Text a cashier reads is never under 12 px in any step (`text-xs` is the floor). `text-2xs`
  (11 px) is only for glyph-like text: avatar initials, badge counts. There is no `text-3xs`.

#### 4. Layout is a grid, not a wrap

Tiles are equal width in fixed columns and keep their order. Width never follows label length.
Five or six payment gateways is normal for a WooCommerce store: design the grid for that, not for
two. Phones stack to one or two columns; tablets and desktop use the space they have.

- There are two layouts and nothing in between (owner, 2026-10-02): the navigation rail with
  the register's two columns in a window at least 768 wide and 480 tall, the phone layout
  (tabs) below that. The boundary is `useIsPhone()` in `@wcpos/components/lib/device`, which a
  `DeviceScope` (a gallery cell, a test) overrides; layout classes read it too
  (`cn(phone && 'hidden')`), never a width-only `sm:`/`md:`/`lg:` (a phone on its side is 844
  wide; the uniwind ratchet refuses new ones). A screen that wants more room for dense content
  reads the theme's `roomy`; it does not add a breakpoint.

#### 5. State is visible, not explained

- Offline, saving, refused, disabled: one badge in one place, at the top of the pane.
- A disabled control says why in a few words beside it. Unavailable options are folded or dimmed
  so they never compete with live ones at full size.
- No walls of text. An error, empty or trouble state is one line, the actions, and a link to
  docs.wcpos.com. Explanations live in the docs, not the app.
- Never rely on colour alone; pair it with an icon or a word.

#### 6. Motion means something

- Durations 150–250 ms for most transitions, ease-out; nothing over 400 ms on a path the cashier
  is waiting on. Animations are interruptible and never block the next tap.
- Every completion gets a beat: the change-due line appears as the amount is typed, the total
  settles, the _Paid_ stamp lands, a capture gets a short haptic on native. That is the joy.
- Respect reduce-motion. No confetti, no mascots, no emoji in the UI, no animation for its own
  sake.
- Anything that moves is smooth, and a beat is a pleasure (owner, 2026-10-01): "fun, smooth and
  joyful", so that adding to the cart is worth doing just to watch it land. In practice:
  - Animate only `transform` and `opacity`, with Reanimated, on every platform. A slide that is
    a plain open/closed state is a Reanimated CSS transition (`SlideOver`): on web the browser
    runs it off the main thread, so the screen re-rendering around it cannot drop it. Shared
    values are for motion that follows something (a gesture, two panes on one value).
  - Leave on an accelerating curve (`EASE_EXIT`); the shared ease creeps at the end. A scrim
    fades its colour, never its own opacity, or its panel fades with it.
  - Anything focused while it is moving is focused with `preventScroll`.
  - Whatever slides keeps what it slides over on stage: both move as one (`PaneStack`), or the
    cover comes out of an edge and goes back into it (`SlideOver`). Nothing animates on mount.
  - A tile that opens onto more tiles deals them out of itself and gathers them back
    (`pos/products/deal-stack.tsx`): the tile walks to the first slot and is the way back,
    and the grid it came from fades underneath and stays mounted.
  - What arrives is complete on its first visible frame: no skeleton, spinner or late image
    inside a moving surface. A beat fires for the cashier's own action, never because a row was
    recycled or another order came into view.
  - A beat may use a spring and run past 250 ms (the in-cart count settles in about half a
    second) because nobody waits on it; it must pick up from where it is when tapped again.
  - Film it before calling it done: record the frames and read them one by one.

#### 7. Calm colour, semantic tokens

- Use the semantic tokens in `apps/main/global.css` (`bg-background`, `bg-card`, `text-muted-foreground`,
  `bg-primary`, `text-destructive`, `bg-success`, …). Never a hex or an `oklch()` in a component.
- One accent colour for the primary action per screen. Semantic colours (success, warning,
  destructive, info) only carry meaning, never decoration.
- A state has one name on every surface: `ok`, `warning`, `bad`, `info` or `muted`, read from the
  tone map (`packages/components/src/lib/tone.ts`). `destructive` names an ACTION (Button, IconButton,
  MenuRow), never a state, and is the same red as `bad` (`--bad: var(--destructive)`).
- **Primary is the theme's accent, never red; brand red is destructive only** (owner ruling,
  2026-09-11). `bg-primary` is blue in the default light and dark themes and varies by theme
  (Ocean teal, Sunset orange, Monochrome grey): use the token and let it vary. The marketing site's
  red-as-action does not carry into the app: red on a till means void, cancel, refund, and Pay
  never shares a colour with Void.
- Text contrast 4.5:1, UI and icon contrast 3:1 (WCAG). Light and dark are both first-class; check
  every new surface in both.
- Flat surfaces, hairline borders, one radius. No gradients, glass or drop shadows to make a card
  look "premium"; hierarchy comes from spacing, weight and colour, in that order.

#### 8. Words the cashier uses

- Buttons are verbs with the object on them: _Take 18,00 £ in Cash_, _Close register_, _Reprint copy_.
- A label that repeats what is already on the element is noise: no _OTHER_ above _SumUp Terminal_,
  no _Cash_ kind above _Cash_. Kinds are icons.
- Plain words: products, not SKUs; sync, not replication. Every string is translated; it must
  survive German length and Spanish plurals without wrapping the layout.
- Brand voice: direct, not blunt; calm, not cute. Error copy says what happened and what to do next.

#### 9. Before you draw, open the real screen

- Inventory what the existing screen does (every state, every string) and rehost it. A mockup that
  invents a simplified version of an existing surface evaluates a straw man.
- Then look at what Square, Shopify POS, Lightspeed, Toast, Zettle and SumUp do for the same task.
  The cashier's expectation is the tie-breaker; deviate only with a stated reason.
- Take zero leads from WordPress or WooCommerce admin idioms for app UI.

#### 10. Definition of done for a UI change

- Walked every state as a cashier: empty, loading, saving, error, offline, disabled, long text,
  part-paid, phone width, dark mode.
- Screenshots of the states that changed are in the PR body, tablet and phone.
- No new explanatory paragraph in the app. No new hex colour. No new `useEffect` for layout.
- Touch targets and contrast checked, not assumed.
- Every interactive element carries a stable `testID`.

#### 11. Settings and admin forms

Applies to every settings form the owner edits, in the app and in the plugins' WordPress admin
screens (owner, 2026-10-21: _"what is variance, is it a time? is it money? You need better guidelines on
UI because this is not intuitive"_). The long form with the cited examples is section 11 of
`docs/design/ui-design-guidelines.md` in `wcpos/roadmap`.

- **A setting is a sentence the owner would say.** The label is the behaviour in the words used at
  the counter; the control sits where the value goes in the sentence: _Ask a manager when the count
  is out by more than [£ 5.00]_.
- **Every value carries its unit inside the control.** A currency symbol in a money field, a time
  picker for a time, a suffix for minutes or percent. Never a bare box.
- **Optional behaviour is a switch, and its value appears when the switch is on.** "Leave blank for
  none" is a bug: blank is not a choice a person makes on purpose.
- **The help line says what happens at the till, in one sentence.** Never the format, never the
  label again.
- **Plain words.** Float, drawer, count, short or over, close. Never variance, threshold, session,
  expected.
- **The common case is one switch.** Everything that only matters when it is on is hidden while it
  is off.
- **Inherited or customised is shown on the field, never implied by blank:** _Site default · value ·
  Customise_, or _Overridden · value · Use site default_.
- **Defaults are prefilled and visible in the control**, not described in a tip.

### Components: one answer per element, app-wide

The owner's rule (2026-10-13, Card readers run): _"I don't want a special UI carved out for this
sheet, it needs to be consistent across the whole app. If a suggestion is not consistent with
similar UI elements, warn me."_ So every element below has ONE home and ONE set of rules. A fix
goes into the shared component in `packages/components`, never into a screen's own override, and
a request that would make one screen differ from this table is answered with the table first,
then built only if the owner confirms the exception.

#### Buttons (`@wcpos/components/button`)

The seven kept variants (decision 1[^board]) and the title bar's `bare`; nothing else is in the cva union, so TypeScript refuses any other.

| Variant                         | Role                                                                                                                                               | Where it sits                                                                 | Examples                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `default` (filled `bg-primary`) | Primary: the action the screen exists for; and the swipe strip's Edit block beside its solid Remove (the swipe grammar: solid tiles, white words)  | one per screen, full width on a phone; the strip is the one exception         | _Take 18,00 € in Cash_, _Try again_ after a refusal, _Sync order_ (the cart's unsaved sale), _Connect a reader_ when nothing is connected |
| `outline`                       | Secondary: the reversible alternative beside the primary                                                                                           | same row or stacked under the primary, never heavier than it                  | _Disconnect_, _Choose another way_, _Close_, _Help_, _Sync_ as a record's own action                                                      |
| `ghost` (muted label at rest)   | Quiet: navigation, escapes, more                                                                                                                   | after the buttons, on its own line, or in a toolbar                           | _Reader guide_, _Details_, _Cancel_ on a scan                                                                                             |
| `link`                          | Text that behaves as a button: no surface, the size's height                                                                                       | after the content; inline it is `DocsLink`, which drops the padding           | _Open docs_, _Reader settings_                                                                                                            |
| `outline-destructive`           | Destructive: what loses something (never filled)                                                                                                   | the footer's leading group, apart from the primary                            | _Void_, _Cancel payment_, _Restore defaults_, _Cancel on terminal_                                                                        |
| `ghost-destructive`             | The quiet form of the same, in a dense row                                                                                                         | inside a table or list row                                                    | _Remove_ on a queued email's row                                                                                                          |
| `destructive` (solid red)       | Only the confirm inside an `AlertDialog`, the swipe Remove block, and a gate's `destructive` primary when the gate itself is the confirm of a loss | the alert's footer, the swipe strip, the reset confirm on the root crash gate | _Delete_ in _Delete this order?_, _Reset and restart_                                                                                     |
| `bare`                          | A desktop title-bar item: no surface on hover or press, the muted key-rank label turns to the foreground (Paul, 2026-10-30)                        | the title-bar strip only (`IconButton` has the same `bare`)                   | the title bar's store button, bell and avatar                                                                                             |
| any, `disabled`                 | Unavailable, with one line beside it saying why                                                                                                    | in the SAME slot the live button uses                                         | _Connecting…_, _Installing…_                                                                                                              |

| Size      | Height                          | Where                                                                        |
| --------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `sm`      | 36 (`h-9`)                      | in table rows and dense toolbars                                             |
| `default` | 44 (`h-ctl`, the control token) | everywhere else                                                              |
| `lg`      | 56 (`h-14`)                     | the pane's one sale button: Pay, Take payment, Open/Close register, New sale |

Heights are at the Regular scale step; Compact and Spacious scale them with `--spacing`, and `h-ctl`
never goes under 44 on a touch screen. They are what is drawn: a `sm` Button, `IconButton size="sm"` and
`Chip size="sm"` still owe the finger a 44 pt target (§2). No height or radius class on a Button (lint enforces it); a small pill is a
`Chip size="sm"`, never a Button. A row with a ⋮ menu puts remove or forget as the menu's last red row;
`ghost-destructive` is for a dense row that has no menu. A selected choice is a
`Chip`, never a Button that toggles its variant. Icon-only actions are an `IconButton` (44, `size="sm"`
32 in dense rows), with an `accessibilityLabel`.

Saving (owner, 2026-10-23 and 2026-10-25): an edit to a record that already exists (a setting, a field of the open
cart, a product, a customer, a coupon, an order) saves as it is made — `useFormChangeHandler` validates the changed path
and writes it, the shared `SavedMark` acknowledges it beside the label, and the footer is Close plus the record's own
actions, never Cancel or Save. A record the store owns reaches the store through the outbox, not a button: `localPatch`
enqueues a store mutation for every non-cart write and the queue coalesces them per record, so "Saved" means saved on the
device and on its way. ONE explicit button remains only for an action named for what it does — creating a record
(_Add customer_, _Add to cart_), moving money (_Pay_, _Refund_), sending something (_Send_), a status intent on an order
(a status is an intent, never an echo) and the footer's record actions (_Sync_, _Delete_) — and the word Save is on no
button. The two kinds never share one form: where a sheet carries both, the intent lives in its own bordered card with
its own form and button, as the cart's Order details sheet does with its Hand over card.

Rules: a slot never empties while its state changes (Connect → Connecting… → Disconnect is one
slot; the ⋮ beside it stays put); buttons are 44 pt minimum, 48 pt default on a phone; Pay
never shares a colour with Void (§7).

#### Footers

A footer's buttons are chosen by role: `DialogFooter` and `AlertDialogFooter` take slots and own the variant, the order, the side and the phone stacking; a `Button` is never written inside a footer (ruled 2026-10-25, after two Sync buttons shipped in two looks).

| Slot            | Variant                                       | Side                                           | Examples                                                                      |
| --------------- | --------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `intent`        | `default`                                     | rightmost; phone first                         | Add to cart, Send, the cart's Sync order                                      |
| `secondary`     | `outline`                                     | right, before intent; phone after intent       | Print, Email receipt, Download PDF, Update customer too                       |
| `record`        | `outline`                                     | left, after destructive; phone after close     | Sync, Re-open                                                                 |
| `destructive`   | `outline-destructive`                         | left, after aside; phone after record          | Void, Delete, Refund, Restore defaults, Sign out                              |
| `close`         | `outline`                                     | right, before secondary; phone after secondary | always present; Cancel with an intent, Close without, Close on a record shell |
| `aside`         | no button                                     | leftmost; phone last                           | Count, status line                                                            |
| alert `confirm` | `destructive` for a loss, otherwise `default` | rightmost; phone first                         | Delete, Confirm                                                               |
| alert `cancel`  | `outline`                                     | before confirm; phone after confirm            | Cancel                                                                        |

One intent per footer. A record action is never the intent. The footer chooses Cancel versus Close from `DialogLabels`; the caller never chooses the word.

Every footer carries the dismiss: `close` defaults on, and `close={false}` is for a footer whose intent is the dismissal (the written closure's Done), nothing else (ruled 2026-10-29, after the cart's Order details sheet shipped without one). A form that saves as it is edited has nothing to cancel: `RecordDialog` wraps its body (tabs and footer) in `DismissIsClose`, so the dismiss reads Close beside Sync order or Re-open; a call site never chooses the word. Outside an overlay shell (a Reports panel's phone page) there is no dialog to close and no dismiss is drawn.

The ESLint `designSystemOwnershipSelectors` footer selector in `packages/eslint/index.js` refuses a button written inside a footer, including its `aside` prop; a button rendered by a child component inside `aside` (the tax rates' sync control) is the caller's responsibility and the one place this rule is review, not lint.

#### Situation → overlay

One shell (`lib/overlay`) and one answer per situation (decisions 5 and 6[^board]); on a phone every
anchored menu, select and popover becomes a bottom sheet (a tooltip stays a tooltip) and every side panel
becomes a page.

| Situation                                                           | Overlay                                                            | Notes                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Edit or add a record (line, fee, customer, product, order, printer) | side panel, `DialogContent side`                                   | `right` on a page; on the POS `usePanelSide` puts it over the other column                       |
| Confirm a loss                                                      | `AlertDialog`                                                      | no ×, the scrim does not dismiss, the confirm is solid `destructive`                             |
| Row actions                                                         | `DropdownMenu` on an `IconButton` ⋮                                | destructive last and red, after a separator                                                      |
| Display or column settings                                          | side panel (`UISettingsDialog`)                                    | on every screen, never a popover                                                                 |
| Pick one of a few                                                   | `Select` or `DropdownMenuRadioItem`                                | never a popover full of buttons                                                                  |
| A small non-modal choice (the bell, a date range, the quantity box) | `Popover`                                                          | a list, a picker or a keypad with at most a Done; never a settings form                          |
| The cashier (switch user, register, store; sign out)                | `UserSheet` (`right` on every screen, the POS included)            | the one cashier surface on every screen; the stores and registers are its bands                  |
| A switch needs a yes (hand over, store, register)                   | `SwitchConfirm` (one centred `AlertDialog` over the cashier sheet) | the verb carries its object (_Hand over to Amy_, _Switch to Front counter_); never `destructive` |
| A multi-step task (checkout)                                        | full screen                                                        | never a centred modal that grew                                                                  |

#### Chips, badges and switches

| Element                                                                                  | Component                                                                                                                                                                                                        | Sizes                                                                                           |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A selectable choice (a filter, a reader)                                                 | `Chip`, `on` when selected (border and text go primary)                                                                                                                                                          | default 44 (`h-ctl`); `size="sm"` 32 (`h-8`) only in a dense table cell or a row's filter strip |
| A count, or a short state tag in a dense row ("1 stuck", "Unsynced")                     | `Badge` (solid tone by `variant`); `tinted` for a quiet state label beside a row's own text (a printer scan's _Ready_): the tone's wash, words in the foreground (`muted` has no wash and stays the solid muted) | `sm` 16, default 20, `lg` 24; full radius                                                       |
| A named state ("Signed in", "Out of stock", an order's status)                           | `StatusBadge`: a tone dot and the word                                                                                                                                                                           | the text's own line height                                                                      |
| A few-way view switch (List / Grid, Fixed / Percent)                                     | `SegmentedControl`                                                                                                                                                                                               | 44 (`min-h-ctl`)                                                                                |
| A choice the cashier hits by position (a split option, a payment method, a denomination) | `Tile`                                                                                                                                                                                                           | 64 at Regular (`min-h-tile`)                                                                    |
| Sections inside a panel                                                                  | `Tabs`                                                                                                                                                                                                           | 44 (`h-ctl`) triggers                                                                           |
| An on/off setting                                                                        | `Switch`                                                                                                                                                                                                         | —                                                                                               |

A Button is never a toggle. Among pills, full radius belongs to `Chip` and `Badge` alone; a circular control (`Switch`, `RadioGroup`, a `Slider` thumb) is its own shape.

#### Gutters

Spacing is decided by the system, never per surface (owner, 2026-10-18: the icon rail had been
left at a 4 px inset and the gap was offered as a choice; it is not one).

- One scale: 4, 8, 12, 16, 32 (`p-1`, `p-2`, `p-3`, `p-4`, `p-8`). Nothing in between.
- Every container insets its children from its own edges by the gutter of its density, and the
  children share that one gutter:

  | Container                                                                                                                                                                                                                                                                                                               | Gutter                                                                                                | Today                                                                                                                                                                                                                                                  |
  | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Inside a control: an icon from its button's edge, a row's lines from its card edge                                                                                                                                                                                                                                      | 4                                                                                                     | `gap-1`, hitSlop                                                                                                                                                                                                                                       |
  | Between controls, and a dense strip of them: the icon rail (48 + 2×8), the front drawer's items, the gap between chips, the cart column's rows, a card to its own caption row (the count and the sync button are the card's controls, not a content area)                                                               | 8                                                                                                     | drawer `mx-2`, chips `gap-2`, `TableSurface` `mb-2`, `TileGround` `pb-1` + the tile's 4, rail 16 spacing units = 12 + 2 + 2 (64 at Regular; the drawer reads it through `useRailWidth`)                                                                |
  | Between content areas on the page ground — the page gutter: `PageBar`'s controls from the top and the sides, the chip row, `TableSurface`'s sides, the caption row's bottom, `ListColumn`'s rows, `AreaPage` around its card, the area nav rail, the hold banner and the upgrade strip, the Reports ground              | 12 at Regular: the `--spacing-gutter` token, 3 units (10.5 / 12 / 15), so it follows the density step | `p-gutter`, `px-gutter`, `mx-gutter`, `gap-gutter`…: `PageBar` `pt-gutter px-gutter`, `ListColumn`, `ChipRow` `p-gutter`, `TableSurface` `mx-gutter` (its `mb-2` is the row above), the caption row's `pb-gutter`, `TileGround`, `AreaPage` `p-gutter` |
  | Inside a surface: a card's body, a pane's body, a panel's header and footer, a bordered notice; the screen edge of a gate or sign-in screen; and the phone's screen edge: its bar, chip row and page padding (Apple's 16 pt root-view minimum applies at the device edge; the gutter is for the ground inside a window) | 16                                                                                                    | `p-4`                                                                                                                                                                                                                                                  |

  Sources: Windows app design (Content layout and spacing): 8 epx between buttons, 12 between
  content areas, 16 between a surface and edge text. UIKit: 8 pt default view margins; 16/20 is
  the root view's minimum, i.e. the screen edge. Owner, 2026-10-22: 16/20 read too spacious for
  an application pane.

- A container's width follows from its items and its gutter (the icon rail is 12 + 2 + 2 = 16 spacing units, 64 at Regular),
  not the other way round.
- Nothing sits flush against a container's edge except the container's own border or surface.
  A lifted item (`bg-card` on the ground) that touches the edge reads as the container, not as an
  item; that is the tell that a gutter is missing.
- The bottom edge is a container edge like the top one: the last row of a page or pane (the
  table's caption row) sits one gutter above it, as the first row sits one gutter below the top.
- A section heading inside a list (the orders day heading) is a band, not a row: `h-band`, the
  `--spacing-band` token, 7 units (24.5 / 28 / 35), uppercase `text-xs` muted on the ground (`bg-background`) with
  the rows' bottom rule. At row height it reads as an empty item (owner, 2026-10-23).
- Between the rows of a page or pane there is exactly one gutter, and the bar is a row: on wide
  widths `PageBar` has no height of its own, its controls sit the gutter from the top and the
  sides, and the row under it (the chip row, a page body) brings the gutter between them. A bar
  that centres a 44 control in a fixed 64 puts 10 above the search and 26 under it; that is the
  tell (owner, 2026-10-20).
- Two panes across a resize handle: the handle is the gutter, one page gutter wide with the 4 px grip centred in it (`@wcpos/components/panels`), and the edge of a pane that faces it keeps no inset of its own, so the two panes' surfaces sit one page gutter apart, the gap any two content areas get; an 8 px handle beside a full gutter had put nearly two there. The POS products column names the cart's side through `GroundInnerEdge` (`@wcpos/components/lib/ground`, the one gutter table, which every surface on the ground reads: `PageBar`, `ChipRow`, `TableSurface`, the tile ground and the caption row); the cart is flush with the handle (owner, 2026-10-23).
- One page gutter at every width: a page does not double its inset on `md` while its neighbour
  keeps the page gutter (Settings sat at 32 beside Products at 16 until 2026-10-20).
- A new container takes its gutter from this table. A mockup does not offer padding as an option.
- The list surfaces (Products, Orders, Customers, Coupons, the POS products column) share one
  construction: `ListPage` (ground, bar, Pro guard) and `ListColumn` (`ChipRow`, rows, body on
  `TableSurface` or `TileGround`, caption row), so a change to any of them moves every list as
  one (owner, 2026-10-22).

#### Page bars

- Every non-POS drawer destination (Orders, Products, Customers, Coupons, Settings, Store health, Support, Reports, Closures) uses `PageBar`, most of them through `ManagementBar`; sign-in and recovery screens have no bar.
- The bar has the title left where there is one (`text-base` semibold, no store suffix), then search, actions, the bell and the avatar below `lg`, with no rule under it and no height of its own: its controls sit the page gutter from the top and the sides and the row under it brings the page gutter between them (Gutters, above); on a phone the bar is 44 and search is its own 44 row under it, with no rule under either.
- The list pages (Products, Orders, Customers, Coupons) carry no title: the search names the page and the rail marks it (owner, 2026-10-18). Support and Reports keep theirs. Settings and Store health show no bar on `lg`: the rail carries the avatar, those pages need neither the bell nor the offline badge (owner's call; the POS and the list pages keep theirs), and the upgrade notice and the held-session banner render above the area rail; below `lg` they keep the bar.
- The POS keeps its `RegisterBar` (48, on the cart card) as ruled 2026-09-11; under the desktop title bar it draws nothing, because the title bar carries its place and pill (Paul, 2026-10-30). The POS products column's search row is a `PageBar` too: no title (its column, an `EdgeSurface`, pads the top inset, so the bar has none left to pad), the scan, view and settings controls as its actions.
- The phone search row is `PageBar`'s: on a phone, a bar with a search shows it on its own 44 row under the control row (no rule: the row under it brings its own gutter, owner 2026-10-23) when that row has a title, a scope control, a back crumb or the menu to share it with. A row of nothing but icon actions (the POS products column, whose register bar above carries the place and the menu) keeps the search in its middle, beside the actions, and spends no second row (owner, 2026-10-28).
- A side menu's active item is the Settings lift (`bg-card` on `bg-background`); the rail keeps its white square.
- An area page (Settings, Store health) is one card on the page ground with its heading inside (`text-xl` semibold, an optional muted line, then a hairline rule), at `max-w-4xl` centred, the page gutter around the card at every width: `AreaPage` in `navigation-area/` (owner, 2026-10-18).

#### Gate screens

A screen that replaces the whole app (a protocol refusal, a plugin too old, a missing route) is a `GateScreen` (`@wcpos/components/gate-screen`): the sign-in mark, one card, a tone disc, a title in foreground ink, one line, one primary, at most one outline secondary, one docs link, nothing else.
The family has three members: `GateScreen` inside the providers, `FallbackScreen` (`@wcpos/components/error-boundary`) as the fallback of a boundary around a whole route, and `PreThemeGate` (`@wcpos/components/gate-screen/pre-theme`) above the providers, where no className resolves; a boundary around part of a screen keeps the inline bar.
A new gate is registered in `apps/main/components/gate-screens.test.ts`, which also refuses an `EmptyState` and a `Button` hand-centred in a `View`.
The title never takes a tone colour: the disc carries it, and `bad` stays the only red surface.
A coded gate's copy comes from the error registry (`error-registry.json`), one source for the screen, the log row and the docs page.
The lint refuses a hand-centred `absoluteFill` (`StyleSheet.absoluteFill` with `justifyContent: 'center'`) under `screens/` and `app/`.

[^board]: The visual reference for these tables and the twelve decisions (ruled 2026-10-16) is the board `~/Projects/wcpos-handoffs/design-system-gallery-2026-10-16.html`.

#### Rows and cards

A device is a list row, not a card (Paul, 2026-10-29): no border box; a hairline between rows; an
icon square (40 pt, tinted by state: success / destructive / muted), line 1 the name (14 medium)
with an optional chip, line 2 the identifiers (serial · location), line 3 ONE state line (dot +
words, or the error in `text-destructive`). The action slot sits at the right of the same line on
a wide pane and under the lines on a phone. One `DeviceRow` in a `DeviceList`
(`@wcpos/components/device-row`) is the Printers, Receipt templates, Card readers, Scanners and
Customer displays row; the list rules between rows, never above the first or under the last.

#### Property rows

A record's edit form is a list of facts, one row per fact: key · value · verb (Paul, 2026-10-25; boards `~/Projects/wcpos-handoffs/2026-10-25-property-rows-system.html` and `…-every-form.html`). Components: `PropertyList`, `PropertyRow`, `PropertyVerb`, `PropertyAddRow`, `PropertyAdd`, `PropertyPlaceholder` (`@wcpos/components/property-row`); which facts are rows is `useFieldPresence` in core. Nothing folds: no Collapsible, Accordion or chevron heading on a record form.

1. **The name test.** A field is offered behind an add button only if its label alone tells a shop owner what they get (Sale price, Barcode, Tax ID). One that fails stays a row with a help line, or leaves the form.
2. **Settings have no add buttons.** A setting always has a value; offering is for records (customer, product, order line, coupon).
3. **Asked is identity, the till's job, or what Woo requires** (customer: name, email, phone). Asked facts are rows even when empty, with a placeholder (`Add Email`); the rest are offered and, once added, sit in their canonical place until their Remove.
4. **One row, one fact.** Woo's pairs merge: First + Last → Name; Tax status + Tax class → Tax; Manage stock + Quantity → Stock.
5. **A copy is derived**, never a checkbox and a hidden form: Shipping reads _Same as billing_ with the verb that breaks the link (_Use a different address_), and the write carries the copy.
6. **Set elsewhere is locked:** the value, where it is set, and _Open ↗_.
7. **An off-by-default exceptional switch is offered** (Featured, Virtual); adding it adds the row switched on. A switch whose default matters is a row.
8. **Conditional settings nest** under their switch, indented one gutter, never behind a fold.
9. **Troubleshooting rows stay findable:** a row at the end with a one-line help, never offered, never folded.
10. **Developer facts go to the JSON tab** (Parent ID, Meta IDs, raw meta), not the form.
11. **Lists are one row per item plus an add button,** in Woo's words: _Custom field_, not Meta Data.
12. **Explicit intent keeps its verb button** (Update status, Send, Generate, Process refund): an action, not a fact.

A compound fact (an address) is one line closed and its parts as indented rows open; open lasts for the dialog's life. Verbs are link Buttons, add buttons outline `sm` Buttons with a plus, never Chips.

#### Sheets, modals and menus on a phone

- A full-size modal IS the screen: no scrim gutter, no radius, card colour to the safe-area
  edges, top-aligned (`DialogContent` from `dialog` with `size="full"` does this on native).
- A bottom sheet (a ⋮ menu, a picker, a short choice) sits on the screen edge and paints the
  bottom inset itself in card colour; the shell leaves that strip unpadded. Both live in
  `lib/overlay` and `dialog/index.tsx`; a sheet that shows a bar under it is a bug there,
  not a reason for local padding.
- A sheet's rows are 48 pt, one icon + one verb each; a destructive row is last and red.
- The sheet header is title + close; a segmented switch (Payments / Legacy) is its own row
  under the header on a phone, never in the header row.

#### Where the shared component is

`MenuRow` (`menu-row/`) is the shared action/choice row inside sheets, popovers and side-panel menus: `rounded-md`, one size, a check slot for `choice`, destructive last and red. `MenuRowSeparator` separates groups, never individual rows.

`packages/components/src/<name>/` with its `LEDGER.md`. Before styling anything on a screen,
check that folder: if the element exists, use it as is; if it needs a new state, add the state
there with a test and a line in the ledger; if it does not exist, say so before building a local
one.

### Anti-patterns that have already been rejected

- The centred modal that grew: enlarging it is the one fix the design systems forbid.
- A paragraph under the tiles telling the cashier how the screen works.
- Full-size dead tiles for gateways that are not set up.
- A kind label on every tile when only the title differs.
- A back arrow pointing away from where the content is.
- Hosted-artifact-only mockups; write the HTML to disk and open it.

## Native and E2E fixes

The diagnosis playbook is `.claude/rules/native-e2e-diagnosis.mdc` and `apps/main/.maestro/README.md`; these are the rules a fix must follow once the cause is known.

- Fix the class at the throw site, not the instance at the catch site: name a cancellation `AbortError` where it is thrown (`Object.assign(new Error(msg), { name: 'AbortError' })`) so every downstream classifier inherits it — never extend a catch-site regex. Pattern: `packages/sync-engine/src/maintenance/variation-prefetch.ts`.
- A native/web platform divergence gets a unit test in `packages/sync-engine/src/platform-seam.test.ts`, so `vitest` catches the next one, not Maestro.
- Never "fix" a red box by trying to silence LogBox; `LogBox.ignoreAllLogs()` is a no-op outside `__DEV__`.
- A red that matches no row in the Maestro README's failure table earns a new row in the same PR as its fix.
- A harness retry is for a lost press on the starved runner, and every retry emits a `WCPOS_E2E …` log line; an app defect (a tab that does not re-centre, an input that appends, a button that accepts a second press) is fixed in the app with a unit test.
- Android relaunches via `openLink`, never `launchApp` (`pm grant` hang). Tablets have a permanent rail: never wait for the drawer to close.
