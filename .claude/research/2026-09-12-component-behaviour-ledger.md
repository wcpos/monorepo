# Component behaviour ledger — census of `packages/components/src`

_Produced 2026-09-12 for [wcpos/roadmap#285](https://github.com/wcpos/roadmap/issues/285) (part of #282). Branch: `research/component-ledger`._

## What this is

Every component folder in `packages/components/src` (excluding `lib/` and the top-level
`*.d.ts` files), with the cross-platform fixes and feedback-driven customisations it carries
today, each line tied to its evidence. This is the evidence base for the component map and for
the "preserved or struck" gate on every rebuild ticket: nothing in here should be dropped in a
rebuild without a deliberate decision recorded against the line.

**Count:** 58 component folders. The ticket says 59; the tree holds 58
(`ls packages/components/src | grep -v '\.d\.ts$' | grep -v '^lib$'`). Treat 58 as
the real number.

**Total ledger lines: 262.**

## At a glance

- **Deepest ledgers** (most learning to preserve): `virtualized-list` 19, `combobox` 17,
  `select` 17, `tree-combobox` 14, `button` 13, `dnd` 12, `form` 12, `modal` 12, `webview` 11,
  `dialog` 10.
- **Nine carry nothing** — no behaviour commit, no explanatory comment: `data-table`, `hstack`,
  `logo`, `portal`, `pressable`, `slider`, `sort-icon`, `tree-select`, `vstack`. These are the
  cheap ones to rebuild or drop.
- **Nine have a real file-level platform split today**: `collapsible` (`primitives.web.tsx`),
  `dnd` (`index.web.ts`), `image`, `keyboard-controller`, `tooltip`, `webview` (`index.web.tsx`),
  `select` (`trigger.web.tsx`), `toast` (`sonner.web.tsx`), `virtualized-list`
  (`virtualized-list.web.tsx`). A further fifteen branch inline on `Platform.OS` /
  `Platform.select` with no separate file: `accordion`, `alert-dialog`, `button`, `calendar`,
  `combobox`, `dialog`, `dropdown-menu`, `hover-card`, `icon-button`, `modal`, `popover`,
  `progress`, `switch`, `tabs`, `tree-combobox`.
- **Recurring themes across the ledger**: Android accessibility pruning of portal children —
  one commit, `8278ba5598` (PR #1623, issue #1614), patched seven files at once across
  `combobox`, `hover-card`, `popover`, `select`, `select-multi`, `tooltip` and `tree-combobox`;
  React-Native-Web `Pressable` swallowing DOM events on touch (`aedbb11e62`, issue #126,
  upstream react-native-reusables#274); React Compiler incompatibilities forcing
  `'use no memo'` and ref-held state; and the September 2026 overlay batches
  (`89fe07768d` PR #1974, `da8191c571` PR #1991) that introduced shared motion and z-index
  constants across the overlay family.

## How it was produced

- Per-folder reading and history mining delegated to Codex (`gpt-6-astra`, read-only sandbox,
  reasoning effort high), run from `/Users/kilbot/Projects/monorepo-v2` in six alphabetical
  batches of ~10 folders, one batch at a time.
- Per folder Codex read every source file, ran
  `git log --follow --format='%h %ad %s' --date=short -- packages/components/src/<name>`,
  pulled the body and diffstat of each promising commit, and grepped the folder for
  workaround/hack/android/ios/web/fabric/because/so-that/upstream/crash comments.
- Chore, formatting, lint and dependency-bump commits were skipped by instruction.
- Claude spot-checked two components per batch against the source and the git history and
  corrected what did not hold up; the summary table's **split** and **usage** columns are
  computed independently by Claude, not taken from Codex.

## What "evidence" means here

Each ledger line cites at least one of:

- **a commit** — `<hash> <date> <subject>`, plus the PR or issue number when the subject or body
  names one (numbers are quoted only where they actually appear; none are inferred);
- **a code comment or expression** — quoted verbatim with `file:line`.

A line marked _(inferred — no explicit evidence)_ is Codex's reading of the code with no commit
or comment behind it: treat those as hypotheses, not findings. A component with `- none found`
is a thin pass-through whose history holds no behaviour commit — those are the cheap ones to
rebuild.

## Caveats

- **Usage counts in the summary table** count files under `packages/core/src` and `apps/main`
  that match the barrel specifier `@wcpos/components/<name>'` — that includes test files and
  `jest.mock()` calls. The per-component **Usage** paragraphs carry Codex's narrower count of
  real importers where it separated them; where the two differ, the section text says so.
- Indirect use (a component reached only through another, e.g. `FormCombobox` re-exporting
  `combobox`) is excluded from direct-import counts and noted in the section text.
- Prop frequencies are approximate: they come from grepping JSX attributes at call sites and
  do not see props passed through spreads.
- `git log --follow` on a directory path follows one path only, so a folder that was renamed or
  split may have history older than what is shown. Where history looks suspiciously short
  (`collapsible` is the clearest case), the behaviour usually arrived wholesale in the
  vendoring commit `2185fd1be3 2025-06-13 remove rn-primitives, update deps`.
- The source tree read was the working tree at `/Users/kilbot/Projects/monorepo-v2`
  (on `main`); it differs from `origin/next` only by an 18-line addition in `button/index.tsx`.

## Summary

| Component | rn-primitives base | Platform split today | Ledger lines | Usage files |
|---|---|---|---:|---:|
| [`accordion`](#accordion) | `accordion` | `Platform.*` in 1 file(s) | 5 | 1 |
| [`alert-dialog`](#alert-dialog) | `alert-dialog`, `slot` | `Platform.*` in 1 file(s) | 5 | 28 |
| [`avatar`](#avatar) | — | — | 3 | 9 |
| [`badge`](#badge) | `slot` | — | 1 | 3 |
| [`button`](#button) | — | `Platform.*` in 1 file(s) | 13 | 176 |
| [`calendar`](#calendar) | — | `Platform.*` in 1 file(s) | 4 | 3 |
| [`card`](#card) | — | — | 2 | 24 |
| [`checkbox`](#checkbox) | `checkbox` | — | 2 | 4 |
| [`collapsible`](#collapsible) | `hooks`, `slot`, `types` | `primitives.web.tsx` | 1 | 24 |
| [`combobox`](#combobox) | `hooks`, `popover`, `slot` | `Platform.*` in 1 file(s) | 17 | 25 |
| [`data-table`](#data-table) | — | — | 0 | 0 |
| [`dialog`](#dialog) | `dialog`, `slot`, `types` | `Platform.*` in 1 file(s) | 10 | 34 |
| [`dnd`](#dnd) | — | `index.web.ts` | 12 | 3 |
| [`docs-link`](#docs-link) | `slot` | — | 1 | 28 |
| [`dropdown-menu`](#dropdown-menu) | `dropdown-menu` | `Platform.*` in 1 file(s) | 3 | 18 |
| [`error-boundary`](#error-boundary) | — | — | 2 | 77 |
| [`form`](#form) | — | — | 12 | 50 |
| [`format`](#format) | — | — | 3 | 5 |
| [`hover-card`](#hover-card) | `hover-card` | `Platform.*` in 1 file(s) | 1 | 1 |
| [`hstack`](#hstack) | — | — | 0 | 189 |
| [`icon`](#icon) | — | — | 3 | 77 |
| [`icon-button`](#icon-button) | — | `Platform.*` in 1 file(s) | 4 | 46 |
| [`image`](#image) | — | `index.web.tsx` | 2 | 8 |
| [`input`](#input) | `hooks` | — | 6 | 18 |
| [`keyboard-controller`](#keyboard-controller) | — | `index.web.tsx` | 1 | 2 |
| [`label`](#label) | `label`, `slot`, `types` | — | 1 | 10 |
| [`list-item`](#list-item) | — | — | 2 | 2 |
| [`loader`](#loader) | — | — | 4 | 17 |
| [`logo`](#logo) | — | — | 0 | 2 |
| [`modal`](#modal) | `dialog`, `slot`, `types` | `Platform.*` in 1 file(s) | 12 | 37 |
| [`numpad`](#numpad) | — | — | 6 | 1 |
| [`panels`](#panels) | — | — | 4 | 4 |
| [`popover`](#popover) | `popover` | `Platform.*` in 1 file(s) | 4 | 10 |
| [`portal`](#portal) | `portal` | — | 0 | 8 |
| [`pressable`](#pressable) | — | — | 0 | 1 |
| [`print`](#print) | — | — | 1 | 3 |
| [`progress`](#progress) | `progress` | `Platform.*` in 1 file(s) | 4 | 4 |
| [`radio-group`](#radio-group) | `label`, `radio-group`, `slot` | — | 4 | 7 |
| [`select`](#select) | `hooks`, `popover`, `select`, `slot`, `types` | `trigger.web.tsx`; `Platform.*` in 2 file(s) | 17 | 39 |
| [`slider`](#slider) | `slider` | — | 0 | 5 |
| [`sort-icon`](#sort-icon) | — | — | 0 | 2 |
| [`status-badge`](#status-badge) | — | — | 1 | 16 |
| [`suspense`](#suspense) | — | — | 2 | 73 |
| [`switch`](#switch) | `switch` | `Platform.*` in 1 file(s) | 4 | 4 |
| [`table`](#table) | `slot`, `table`, `types` | — | 7 | 14 |
| [`tabs`](#tabs) | `tabs` | `Platform.*` in 1 file(s) | 9 | 23 |
| [`text`](#text) | `slot`, `types` | — | 2 | 301 |
| [`textarea`](#textarea) | — | — | 4 | 2 |
| [`toast`](#toast) | — | `sonner.web.tsx` | 6 | 42 |
| [`toggle`](#toggle) | `toggle` | — | 2 | 0 |
| [`toggle-group`](#toggle-group) | `toggle-group` | — | 1 | 6 |
| [`tooltip`](#tooltip) | `slot`, `tooltip`, `types` | `index.web.tsx`; `Platform.*` in 1 file(s) | 6 | 36 |
| [`tree`](#tree) | — | — | 2 | 11 |
| [`tree-combobox`](#tree-combobox) | `hooks`, `popover` | `Platform.*` in 1 file(s) | 14 | 5 |
| [`tree-select`](#tree-select) | — | — | 0 | 0 |
| [`virtualized-list`](#virtualized-list) | — | `virtualized-list.web.tsx` | 19 | 8 |
| [`vstack`](#vstack) | — | — | 0 | 193 |
| [`webview`](#webview) | `hooks` | `index.web.tsx` | 11 | 10 |

---

## Sections

### accordion


**Job:** An expandable, compound section list with animated content and configurable chevron placement.

**Base:** `@rn-primitives/accordion`, `react-native`, and `react-native-reanimated`. No platform-specific files; `index.tsx` branches on `"Platform.OS !== 'web'"` for root composition and `"Platform.OS === 'web'"` for the trigger and content wrapper.

**Behaviour ledger:**
- Uses a native Pressable but a web View inside the primitive trigger — evidence: code: `"const Trigger = Platform.OS === 'web' ? View : Pressable;"` in `packages/components/src/accordion/index.tsx:43`.
- Uses web accordion CSS animations versus native content fades — evidence: code: `"isExpanded ? 'web:animate-accordion-down' : 'web:animate-accordion-up'"` in `packages/components/src/accordion/index.tsx:101`, code: `"exiting={FadeOutUp.duration(200)}"` in `packages/components/src/accordion/index.tsx:118`.
- Allows the chevron on either side for the redesigned sites list — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: `"chevronPosition?: 'left' | 'right';"` in `packages/components/src/accordion/index.tsx:52`.
- Exposes outer-header styling for flex sizing — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: `"ClassName applied to the outer AccordionPrimitive.Header wrapper (useful for flex sizing)."` in `packages/components/src/accordion/index.tsx:53`.
- Removes inherited hover underlining from trigger text — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: `"<TextClassContext.Provider value=\"font-medium\">"` in `packages/components/src/accordion/index.tsx:73`.

**Usage:** 1 importing file, also 1 grep match: `packages/core/src/screens/auth/components/sites.tsx` (the sole importer). Observed explicit JSX attributes across imported component-family tags, excluding spreads and implicit children: `value` (2), `className` (2), `type` (1), `collapsible` (1), `onValueChange` (1); the last three tie with other attributes.


### alert-dialog


**Job:** A confirmation-dialog family providing a portal, overlay, descriptive content, and action/cancel controls.

**Base:** `@rn-primitives/alert-dialog`, `@rn-primitives/slot`, `react-native`, and `react-native-reanimated`, with the local Button. No platform-specific files; `index.tsx` uses `"Platform.select({ web: AlertDialogOverlayWeb, default: AlertDialogOverlayNative })"`.

**Behaviour ledger:**
- Paints confirmations above side panels sharing the portal host — evidence: `da8191c571 2026-09-11 feat(pos): overlay batch 6 — order meta owns status, cashier and note; products settings open over the cart (#1991)`, PR #1991, code: `"// z-70: a confirmation must paint above a side panel (DialogContent is z-60) even when both"` in `packages/components/src/alert-dialog/index.tsx:25`.
- Uses shared native overlay fade durations instead of independent defaults — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: `"exiting={FadeOut.duration(OVERLAY_FADE_MS)}"` in `packages/components/src/alert-dialog/index.tsx:50`.
- Aligns the native scrim with the web scrim at black/70 — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: `"className={cn('z-70 flex items-center justify-center bg-black/70 p-2', className)}"` in `packages/components/src/alert-dialog/index.tsx:44`.
- Preserves dialog dismissal after a caller-supplied cancel handler instead of allowing the prop spread to replace it — evidence: `a805360120 2026-04-04 fix(pr277): address review comments and lint typecheck blocker`, PR #277, code: `"onPress: userOnPress,"` in `packages/components/src/alert-dialog/index.tsx:149`.
- Removes the foreground-tinted shadow override for native rendering — evidence: `05ad25913b 2025-11-04 update shadows and rounding for native`, code: `"'web:duration-200 border-border bg-background z-70 max-w-lg gap-4 rounded-lg border py-4 shadow-lg',"` in `packages/components/src/alert-dialog/index.tsx:75`.

**Usage:** 16 actual importing files; the requested grep matches 28 files including mocks. Representative paths: `packages/core/src/screens/auth/components/site.tsx`, `packages/core/src/screens/auth/components/sites.tsx`, `packages/core/src/screens/auth/components/wp-user.tsx`, `packages/core/src/screens/main/components/header/user-menu.tsx`, `packages/core/src/screens/main/coupons/cells/actions.tsx`. Observed explicit JSX attributes across imported family tags, excluding spreads and implicit children: `onPress` (19), `open` (18), `onOpenChange` (18), `variant` (17), `testID` (17).


### avatar


**Job:** A profile or site image with configurable shape, size, colour, and initials fallback.

**Base:** `react-native` View, `class-variance-authority`, and local Image/Text components; no `@rn-primitives/*` import. Platform: no split.

**Behaviour ledger:**
- Defaults to initials when the image source is missing or loading fails — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: `"onError={() => setErrored(true)}"` in `packages/components/src/avatar/index.tsx:130`.
- Resets image-error state using source content rather than source-object identity — evidence: `bf4403a2ea 2026-05-22 fix: address remaining PR blockers`, code: `"if (sourceKey !== prevSourceKey) {"` in `packages/components/src/avatar/index.tsx:110`.
- Returns a question-mark initial for empty or whitespace-only names — evidence: `87cb134e9a 2026-04-21 fix: harden components and localize auth copy`, code: `"if (!trimmed) return '?';"` in `packages/components/src/avatar/index.tsx:169`.

**Usage:** 5 actual importing files; grep matches 9 including mocks. Paths: `packages/core/src/screens/auth/components/site.tsx`, `packages/core/src/screens/auth/components/wp-user.tsx`, `packages/core/src/screens/main/components/customer-select.tsx`, `packages/core/src/screens/main/components/header/user-menu.tsx`, `packages/core/src/screens/main/orders/view/sections/customer.tsx`. Observed explicit JSX attributes, excluding spreads: `source` (6), `fallback` (5), `size` (3), `variant` (3), `recyclingKey` (2).


### badge


**Job:** A compact notification count or dot indicator.

**Base:** `react-native` View, `class-variance-authority`, and local Text/TextClassContext; no `@rn-primitives/*` import. Platform: no split.

**Behaviour ledger:**
- Isolates badge text colours from enclosing button hover/active text styles — evidence: `b324f90140 2026-08-19 fix(components): a badge keeps its own colours wherever it is nested (#1369)`, issue #1369, code: `"<TextClassContext.Provider value={undefined}>"` in `packages/components/src/badge/index.tsx:104`.

**Usage:** 2 actual importing files; grep matches 3 including a mock. Both paths: `packages/core/src/screens/main/components/drawer-content/logs-badge.tsx`, `packages/core/src/screens/main/components/header/notification-bell.tsx`. Observed explicit JSX attributes: `count` (2), `max` (2), `variant` (2), `size` (2); no fifth attribute.


### button


**Job:** A styled pressable action family including text labels, grouped buttons, and removable pills.

**Base:** `react-native` Pressable/View, `class-variance-authority`, and `expo-haptics`; no `@rn-primitives/*` import. No platform-specific files; `index.tsx` branches on `"Platform.OS !== 'web' && !disabled && !disableHaptics"`.

**Behaviour ledger:**
- Always forwards a boolean disabled state to prevent Android accessibility remaining latched disabled after re-enabling — evidence: `c99855da17 2026-08-27 fix(native-e2e): Open POS accessibility latch + the two remaining nightly defects (#1614) (#1616)`, issue #1614, PR #1616, code: `"const disabled = !!(props.disabled || loading);"` in `packages/components/src/button/index.tsx:227`.
- Disables pointer interception for disabled web buttons — evidence: `87cb134e9a 2026-04-21 fix: harden components and localize auth copy`, code: `"'web:pointer-events-none web:cursor-not-allowed web:hover:opacity-50 opacity-50 active:opacity-50'"` in `packages/components/src/button/index.tsx:280`.
- Restricts ghost hover colours to web while retaining native pressed-state colours — evidence: `1eabc2c781 2026-05-02 fix(theming): reduce Uniwind theme transition cancellations on native`, `33cd3be328 2026-05-02 fix: address theme transition review feedback`, code: `"ghost: 'web:group-hover:text-accent-foreground group-active:text-accent-foreground',"` in `packages/components/src/button/index.tsx:156`.
- Lets button icons inherit foreground colour from text context instead of overriding it with the button variant — evidence: `a41901b742 2026-03-07 fix: button icon inherits color from text context instead of variant`, code: `"return <Icon name={icon as IconName} size={size as IconProps['size']} />;"` in `packages/components/src/button/index.tsx:234`.
- Separates compact label typography from the smaller xs hit area — evidence: `b6f74171bd 2026-08-18 fix(ui): preserve compact action hit areas`, code: `"compact: 'h-9 px-3',"` in `packages/components/src/button/index.tsx:107`, code: `"compact: 'text-xs',"` in `packages/components/src/button/index.tsx:183`.
- Provides a square sidebar variant with semantic foreground and hover colours — evidence: `fc33684565 2026-08-18 fix(ui): make destructive confirms use the destructive variant`, code: `"'web:hover:bg-sidebar-foreground/10 active:bg-sidebar-foreground/10 rounded-none bg-transparent',"` in `packages/components/src/button/index.tsx:95`.
- Provides a transparent ghost-quiet variant with de-emphasised label text — evidence: `fc33684565 2026-08-18 fix(ui): make destructive confirms use the destructive variant`, code: `"'text-muted-foreground web:group-hover:text-accent-foreground group-active:text-accent-foreground',"` in `packages/components/src/button/index.tsx:176`.
- Provides a link variant without a button hover surface — evidence: `fc33684565 2026-08-18 fix(ui): make destructive confirms use the destructive variant`, code: `"link: 'text-primary web:hover:underline',"` in `packages/components/src/button/index.tsx:178`.
- Preserves injected onPress handlers on removable pill labels for asChild trigger composition — evidence: `4f0e72e463 2026-03-11 fix: restore onPress forwarding in removable ButtonPill`, PR #175 referenced as the regression source, code: `"// NOTE: props (including onPress) must be spread onto the label Button."` in `packages/components/src/button/index.tsx:413`.
- Prevents pill removal clicks from bubbling into surrounding triggers — evidence: `186b25c5c3 2026-04-09 fix: restore scalar order filter params`, code: `"event?.stopPropagation?.();"` in `packages/components/src/button/index.tsx:407`.
- Gives pill removal controls an overridable accessibility label with a Remove default — evidence: `a68a9dfee1 2026-03-07 fix: add default accessibility label for ButtonPill remove button and drop redundant role`, code: `"accessibilityLabel={removeAccessibilityLabel ?? 'Remove'}"` in `packages/components/src/button/index.tsx:425`.
- Exposes a separate testID for pill removal controls — evidence: `00f86c0049 2026-07-18 feat(e2e): add P0 native testID backlog for the Maestro suite`, wayfinder #688, code: `"testID={removeTestID}"` in `packages/components/src/button/index.tsx:426`.
- Adds optional light haptic feedback to enabled native presses — evidence: code: `"if (Platform.OS !== 'web' && !disabled && !disableHaptics) {"` in `packages/components/src/button/index.tsx:260`, code: `"void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);"` in `packages/components/src/button/index.tsx:261`.

**Usage:** 112 actual importing files, including 1 type-only importer; grep matches 176 including mocks. Representative paths: `packages/core/src/screens/auth/components/demo-button.tsx`, `packages/core/src/screens/auth/components/store-select.tsx`, `packages/core/src/screens/auth/components/url-input.tsx`, `packages/core/src/screens/auth/components/wp-user.tsx`, `packages/core/src/screens/main/components/coupon/coupon-form.tsx`. Observed explicit JSX attributes across imported family tags, excluding spreads and implicit children: `variant` (164), `onPress` (163), `testID` (135), `size` (125), `disabled` (44). These direct-import counts exclude consumers reached through wrappers such as AlertDialogAction.


### calendar


**Job:** A themed calendar adapted for selecting and displaying a date range.

**Base:** `react-native-calendars`, `date-fns`, and Uniwind’s `useCSSVariable`, with `react-native` Platform. No platform-specific files; `index.tsx` branches on `"Platform.OS === 'web'"` for weekday-header font size.

**Behaviour ledger:**
- Clamps the highlighted range end to maxDate and ignores selections beyond maxDate — evidence: `323b415688 2025-04-04 update calendar component`, code: `"to: maxDateObj && dateRange.to > maxDateObj ? maxDateObj : dateRange.to,"` in `packages/components/src/calendar/index.tsx:65`, code: `"if (maxDateObj && selectedDate > maxDateObj) return;"` in `packages/components/src/calendar/index.tsx:104`.
- Moves the range start backward while retaining the previous start as the end when an earlier day is selected — evidence: `323b415688 2025-04-04 update calendar component`, code: `"onDateRangeChange({ from: selectedDate, to: dateRange.from });"` in `packages/components/src/calendar/index.tsx:108`.
- Refreshes calendar month/day names when the supplied locale changes — evidence: `323b415688 2025-04-04 update calendar component`, code: `"// Update locale configuration when language changes"` in `packages/components/src/calendar/index.tsx:40`.
- Uses larger weekday-header text on native than web — evidence: `323b415688 2025-04-04 update calendar component`, code: `"textDayHeaderFontSize: Platform.OS === 'web' ? 12 : 14,"` in `packages/components/src/calendar/index.tsx:156`.

**Usage:** 3 importing files, including 2 type-only importers; grep also matches 3. Paths: `packages/core/src/screens/main/components/order/filter-bar/calendar.tsx`, `packages/core/src/screens/main/components/order/filter-bar/date-range-pill.tsx`, `packages/core/src/screens/main/coupons/filter-bar/date-range-pill.tsx`. Observed explicit JSX attributes: `maxDate` (1), `dateRange` (1), `onDateRangeChange` (1), `locale` (1); no fifth attribute.


### card


**Job:** A styled content container with header, title, description, content, and footer sections.

**Base:** `react-native` View/Text and local TextClassContext; no `@rn-primitives/*` import. Platform: no split.

**Behaviour ledger:**
- Uses an untinted medium shadow after the native shadow adjustment — evidence: `05ad25913b 2025-11-04 update shadows and rounding for native`, code: `"className={cn('border-border bg-card rounded-lg border shadow-md', className)}"` in `packages/components/src/card/index.tsx:10`.
- Rounds the header’s top corners to match the card after the native rounding adjustment — evidence: `05ad25913b 2025-11-04 update shadows and rounding for native`, code: `"return <View className={cn('flex flex-col rounded-t-lg p-6', className)} {...props} />;"` in `packages/components/src/card/index.tsx:17`.

**Usage:** 13 actual importing files; grep matches 24 including mocks. Representative paths: `packages/core/src/screens/auth/components/sites.tsx`, `packages/core/src/screens/auth/connect.tsx`, `packages/core/src/screens/main/components/pro-preview-overlay.tsx`, `packages/core/src/screens/main/coupons/index.tsx`, `packages/core/src/screens/main/customers/index.tsx`. Observed explicit JSX attributes across imported family tags: `className` (37), `testID` (3); no other explicit attributes.


### checkbox


**Job:** A checkbox with an additional visual indeterminate state.

**Base:** `@rn-primitives/checkbox` and `react-native` View. Platform: no split in files or Platform branches; styling explicitly differs through `"native:h-[20] native:w-[20] native:rounded"` and web-only focus classes.

**Behaviour ledger:**
- Displays a filled minus indicator independently of the primitive’s checked indicator for indeterminate selections — evidence: `54e2de9747 2024-08-29 update components`, code: `"<Icon name=\"minus\" className=\"text-primary-foreground h-3 w-3\" />"` in `packages/components/src/checkbox/index.tsx:26`.
- Uses native-specific dimensions and rounding while keeping keyboard focus rings web-only — evidence: code: `"web:peer native:h-[20] native:w-[20] native:rounded web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-1"` in `packages/components/src/checkbox/index.tsx:17`.

**Usage:** 4 importing files, also 4 grep matches. Paths: `packages/core/src/screens/main/coupons/cells/actions.tsx`, `packages/core/src/screens/main/customers/cells/actions.tsx`, `packages/core/src/screens/main/reports/orders/header-select.tsx`, `packages/core/src/screens/main/reports/orders/row-select.tsx`. Observed explicit JSX attributes: `onCheckedChange` (4), `checked` (4), `aria-labelledby` (2), `indeterminate` (1), `disabled` (1). Additional indirect use exists through `FormCheckbox`, exported from `@wcpos/components/form`; it is excluded from these direct-import counts.


### collapsible


**Job:** A disclosure container with a trigger, open-state chevron, and conditionally mounted content.

**Base:** Local primitives using `react-native`, `@rn-primitives/hooks`, and `@rn-primitives/slot`; the web implementation additionally wraps `@radix-ui/react-collapsible`. Platform split: `primitives.web.tsx` versus default `primitives.tsx`; no Platform branches.

**Behaviour ledger:**
- Moves web DOM mutations into helpers to avoid React Compiler return-value mutation complaints — evidence: code: `"Helper to mutate DOM dataset properties outside component scope"` in `packages/components/src/collapsible/primitives.web.tsx:17`, code: `"so the react-compiler doesn't flag them as return-value mutations."` in `packages/components/src/collapsible/primitives.web.tsx:18`.

**Usage:** 13 actual importing files; grep matches 24 including mocks. Representative paths: `packages/core/src/screens/main/components/coupon/collapsible-section.tsx`, `packages/core/src/screens/main/components/customer/customer-form.tsx`, `packages/core/src/screens/main/components/customer/tax-ids-form.tsx`, `packages/core/src/screens/main/components/meta-data-form.tsx`, `packages/core/src/screens/main/components/ui-settings/columns-form.tsx`. Observed explicit JSX attributes across imported family tags, excluding spreads and implicit children: `testID` (11), `className` (4), `open` (3), `onOpenChange` (2), `defaultOpen` (2).


### combobox


**Job:** A searchable, virtualized option picker supporting single and multiple selection.

**Base:** `@rn-primitives/popover`, `@rn-primitives/hooks`, `@rn-primitives/slot`, `react-native`, `react-native-reanimated`, `react-native-gesture-handler`, and local Input/VirtualizedList components. No platform-specific implementation files; `combobox.tsx` branches on `"Platform.OS !== 'web'"`, `"Platform.OS === 'android'"`, and derived `"if (isNative)"` / `"if (!isNative)"` conditions. Phone presentation additionally branches on `isPhone`.

**Behaviour ledger:**
- Gives native portal animation wrappers full bounds without intercepting outside taps so Android accessibility can reach their children — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, issue #1614, code: `"pointerEvents=\"box-none\""` in `packages/components/src/combobox/combobox.tsx:209`, code: `"style={isNative ? StyleSheet.absoluteFill : undefined}"` in `packages/components/src/combobox/combobox.tsx:210`.
- Uses the gesture-handler ScrollView for Android popover lists — evidence: `04ca6a7a5b 2026-06-08 Fix Android combobox popover scrolling`, code: `"renderScrollComponent={isAndroid ? GestureHandlerScrollView : undefined}"` in `packages/components/src/combobox/combobox.tsx:329`.
- Explicitly sizes native lists by item count within a height cap instead of relying on web flex sizing — evidence: `04ca6a7a5b 2026-06-08 Fix Android combobox popover scrolling`, code: `"const listHeight = getNativeListHeight(itemCountForHeight, estimatedItemSize, maxHeight);"` in `packages/components/src/combobox/combobox.tsx:316`.
- Reserves native list height for an empty-state component after filtering removes all options — evidence: `04ca6a7a5b 2026-06-08 Fix Android combobox popover scrolling`, code: `"filteredData.length === 0 && ListEmptyComponent ? 1 : filteredData.length;"` in `packages/components/src/combobox/combobox.tsx:313`.
- Presents a bottom sheet below the phone breakpoint on both native and web — evidence: `2a9bd23d1e 2026-09-11 spike(ui): side-panel Modal presentation + phone bottom-sheet Combobox (#1960)`, PR #1960, code: `"<PhoneSheetShell"` in `packages/components/src/combobox/combobox.tsx:191`.
- Sizes phone lists from viewport/safe-area sheet metrics rather than the desktop popover cap — evidence: `2a9bd23d1e 2026-09-11 spike(ui): side-panel Modal presentation + phone bottom-sheet Combobox (#1960)`, PR #1960, code: `"const maxHeight = isPhone ? sheet.listMaxHeight : NATIVE_LIST_MAX_HEIGHT;"` in `packages/components/src/combobox/combobox.tsx:315`.
- Pins popover fade timing to shared overlay constants — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: `"exiting={FadeOut.duration(POPOVER_FADE_MS)}"` in `packages/components/src/combobox/combobox.tsx:208`.
- Decodes selected labels consistently with listed labels while allowing opaque identifiers to opt out — evidence: `0266c5971c 2026-08-25 fix(ui): decode HTML entities across server-supplied name surfaces`, `8652644642 2026-08-25 fix(ui): address review — store pill trigger, coupon list, decodeLabels opt-out`, code: `"in the list made one widget read \"Men's\" open and \"Men&#039;s\" closed."` in `packages/components/src/combobox/combobox.tsx:147`.
- Toggles multi-select options with checkmarks while leaving the popover open — evidence: `c3258ae521 2026-03-25 feat(combobox): toggle behavior and checkmarks for multi-select items`, code: `"// Popover stays open in multi-select mode"` in `packages/components/src/combobox/combobox.tsx:369`.
- Condenses multi-select labels using a configurable display-length limit — evidence: `5e71d05ac7 2026-03-25 feat(combobox): condensed display label for multi-select values`, code: `"return getDisplayLabel(selectedValues, placeholder, maxDisplayLength);"` in `packages/components/src/combobox/combobox.tsx:124`.
- Preserves the caller’s open-change callback while clearing the search filter — evidence: `6440490d99 2026-03-25 fix: address review feedback from coderabbitai`, code: `"onOpenChangeProp?.(open);"` in `packages/components/src/combobox/combobox.tsx:74`.
- Treats an empty-string option value as selected rather than as a placeholder — evidence: `6440490d99 2026-03-25 fix: address review feedback from coderabbitai`, code: `": (value as Option<any> | undefined)?.value !== undefined;"` in `packages/components/src/combobox/combobox.tsx:131`.
- Includes the original item in selection callbacks — evidence: `527100ea46 2026-02-10 fix: pass item through Combobox onValueChange callback`, code: `"onValueChange({ value, label, item });"` in `packages/components/src/combobox/combobox.tsx:371`.
- Forwards input changes to callers as well as the internal search filter — evidence: `1a927a96b2 2026-03-11 fix: address review feedback from chatgpt-codex-connector, coderabbitai`, code: `"onChangeText?.(currentText);"` in `packages/components/src/combobox/combobox.tsx:244`.
- Exposes option selection through accessibility semantics — evidence: `85c8adcc8d 2026-04-30 fix: expose selected combobox option for e2e`, code: `"aria-selected={selected}"` in `packages/components/src/combobox/combobox.tsx:381`.
- Adds disabled-trigger opacity and a web not-allowed cursor — evidence: `ab0c067a69 2025-12-11 fix disabled state for combobox`, code: `"className={cn(disabled && 'web:cursor-not-allowed opacity-50', className)}"` in `packages/components/src/combobox/combobox.tsx:104`.
- Moves web keyboard focus from the search input toward the first option on ArrowDown — evidence: code: `"// Special case: down arrow from input should move to first item"` in `packages/components/src/combobox/combobox.tsx:258`.

**Usage:** 21 actual importing files, including 3 type-only importers; grep matches 27 including mocks. Representative paths: `packages/core/src/screens/main/components/country-state-select/country-combobox.tsx`, `packages/core/src/screens/main/components/country-state-select/state-combobox.tsx`, `packages/core/src/screens/main/components/currency-select.tsx`, `packages/core/src/screens/main/components/customer-select.tsx`, `packages/core/src/screens/main/components/language-select.tsx`. Observed explicit JSX attributes across imported family tags, excluding spreads and implicit children: `value` (28), `placeholder` (25), `onValueChange` (13), `data` (12), `renderItem` (12); the last two tie with other attributes. Additional indirect use exists through `FormCombobox`, exported from `@wcpos/components/form`; it is excluded from these direct-import counts.


### data-table


**Job:** This folder now contains shared table types and column metadata augmentation, not a rendered DataTable component.

**Base:** Type-only imports from `@tanstack/react-table`; no split.

**Behaviour ledger:**
- none found

**Usage:** Observed: **2 importing files**, both importing `@wcpos/components/data-table/types`: `packages/core/src/table-types.d.ts`, `apps/main/table-types.d.ts`. Core also re-exports its types. **JSX props: none**; no component tags remain here. The broader grep’s 18 matches include the separate `packages/core/src/screens/main/components/data-table` implementation and mocks.


### dialog


**Job:** A composable modal dialog supporting centered content, side panels, bottom sheets, and separate scrolling bodies and footers.

**Base:** `@rn-primitives/dialog`, `@rn-primitives/slot`, `react-native`, `react-native-reanimated`, `react-native-safe-area-context`, and the local keyboard-controller wrapper. No platform-suffixed files; `index.tsx` uses `"Platform.select({ web: DialogOverlayWeb, default: DialogOverlayNative })"`, `"Platform.OS !== 'web' || side === 'center' || !open || !node"`, and `"Platform.OS === 'web' && side !== 'center'"`.

**Behaviour ledger:**
- Native overlays account for safe-area insets and keyboard padding — evidence: `10f397594c 2025-03-24 Fix transparent modals`, code: "keyboardVerticalOffset={insets.bottom}" in `packages/components/src/dialog/index.tsx:160`.
- Dialog content uses z-60 following the modal stacking fix — evidence: `941db52f6a 2025-03-28 Use containedTransparentModal to fix stacking issue`, code: "bg-card z-60 max-h-full max-w-full" in `packages/components/src/dialog/index.tsx:189`.
- Keyboard avoidance imports through the web-compatible local wrapper — evidence: `60f77d4098 2025-04-04 add keyboard-controller wrapper for web`, code: "import { KeyboardAvoidingView } from '@wcpos/components/keyboard-controller';" in `packages/components/src/dialog/index.tsx:19`.
- Side presentations use directional motion with a flexible scrolling body and pinned footer — evidence: `daf8fca838 2026-09-11 feat(ui): overlay batch 3 — Dialog gains side presentation; full-form dialogs open as right panels`, code: "side !== 'center' && 'flex-1'" in `packages/components/src/dialog/index.tsx:333`.
- Web side panels flatten Radix’s intermediate wrapper so percentage heights resolve against the overlay — evidence: `ae4d1fae09 2026-09-11 fix(dialog): directional web exit for side panels, flatten the Radix wrapper`, PR #1977, code: "side !== 'center' && '[&>[role=dialog]]:contents'" in `packages/components/src/dialog/index.tsx:83`.
- Web side panels exit toward their presentation edge rather than only fading — evidence: `ae4d1fae09 2026-09-11 fix(dialog): directional web exit for side panels, flatten the Radix wrapper`, PR #1977, code: "cn('web:animate-out web:fade-out-0', exitSlide[side])" in `packages/components/src/dialog/index.tsx:258`.
- Named portal hosts also resolve to DOM containers so web POS panels do not cover the navigation drawer — evidence: `a49db27e0b 2026-09-11 feat(pos): overlays slide in from the products side, opposite the cart (#1985)`, PR #1985, code: "<DialogPortal hostName={portalHost} container={container}>" in `packages/components/src/dialog/index.tsx:234`.
- Web side-panel autofocus waits until the slide finishes and prevents scrolling, with a non-focusable scrim and reduced-motion timer — evidence: `c6e0a7b979 2026-09-11 fix(dialog): side panels focus after the slide, without scrolling the POS (#1989)`, PR #1989, code: "target.focus({ preventScroll: true });" in `packages/components/src/dialog/index.tsx:123`.
- Headers reserve space for the close button — evidence: code: "NOTE: extra space on right for the close button" in `packages/components/src/dialog/index.tsx:279`.
- Titles supply themed foreground text through the text context — evidence: code: "DialogTitle with proper text color for all themes" in `packages/components/src/dialog/index.tsx:314`.

**Usage:** Observed: **25 importing files**, excluding mock-only matches. Examples: `packages/core/src/screens/main/components/ui-settings/index.tsx`, `packages/core/src/screens/main/pos/cart/add-customer.tsx`, `packages/core/src/screens/main/receipt/receipt-actions.tsx`, `packages/core/src/screens/main/settings/printer/setup/printer-setup-dialog.tsx`. Top explicit JSX attributes across exported tags, excluding spreads and implicit children: `testID` **14**, `size` **13**, `onPress` **13**, `open` **12**, `onOpenChange` **12** (`side` also ties at **12**).


### dnd


**Job:** Sortable lists and drag handles for reordering items through platform-specific drag implementations.

**Base:** Native imports `react-native`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`, `expo-haptics`, and `uniwind`; web imports `react-dom`, `@atlaskit/pragmatic-drag-and-drop`, `@atlaskit/pragmatic-drag-and-drop-hitbox`, and `@atlaskit/pragmatic-drag-and-drop-flourish`. Split: `index.web.ts` exports `web/*`; `index.ts` exports `native/*`. No `Platform.OS` or `Platform.select` branches.

**Behaviour ledger:**
- Native position and layout stores use plain records instead of Maps for worklet compatibility — evidence: `7c6616ae88 2025-12-14 fix dnd on native`, code: "Record types for shared values (Maps don't work in Reanimated worklets)" in `packages/components/src/dnd/native/types.ts:108`.
- Native layout registration and position updates are scheduled onto the gesture worklets’ UI thread — evidence: `7c6616ae88 2025-12-14 fix dnd on native`, code: "Schedule update on UI thread where gesture worklets read it" in `packages/components/src/dnd/native/context.tsx:97`.
- Native gesture callbacks manipulate shared drag state directly instead of invoking context functions from worklets — evidence: `7c6616ae88 2025-12-14 fix dnd on native`, code: "Set drag state directly on shared values (don't call context function from worklet)" in `packages/components/src/dnd/native/sortable-item.tsx:178`.
- Native layout removal uses inline delete to avoid computed-destructuring minification bugs — evidence: `65e0cc3cc7 2026-01-23 fix: bypass TanStack Table minification bug and migrate to scheduleOnRN`, code: "Use delete instead of computed property destructuring due to minification bugs" in `packages/components/src/dnd/native/context.tsx:122`.
- Explicit drag handles restrict drag initiation to the handle on web and native — evidence: `8ad03137a3 2026-01-22 feat(dnd): add DragHandle component for explicit drag initiation`, code: "Only dragging from this element will initiate the drag operation." in `packages/components/src/dnd/native/sortable-item.tsx:386`.
- Invalid web handle containment warns and falls back to whole-item dragging — evidence: `a5474ba230 2026-01-22 fix(dnd): add containment validation and documentation for DragHandle`, code: "const validDragHandle = dragHandle && element.contains(dragHandle) ? dragHandle : undefined;" in `packages/components/src/dnd/web/sortable-item.tsx:107`.
- Native handle registration runs only on mount and unmount rather than each context change — evidence: `8c11023a40 2026-02-07 fix: audit and fix 12 problematic useEffect patterns across codebase`, code: "Mark that a drag handle is being used — mount/unmount only" in `packages/components/src/dnd/native/sortable-item.tsx:399`.
- Native drop indicators follow the theme’s primary color instead of a hardcoded color — evidence: `1eabc2c781 2026-05-02 fix(theming): reduce Uniwind theme transition cancellations on native`, code: "const indicatorColor = useCSSVariable('--color-primary') as string;" in `packages/components/src/dnd/native/drop-indicator.tsx:21`.
- Native context-owned shared values use compiler-compatible setters — evidence: `9a8efbd1b1 2026-09-02 fix(react): clear the nineteen Rules-of-React compiler skips`, code: "activeId.set(id);" in `packages/components/src/dnd/native/sortable-item.tsx:180`.
- Web hover feedback reserves its border space to avoid layout shifts — evidence: `7c6616ae88 2025-12-14 fix dnd on native`, code: "Uses transparent border by default to prevent layout shift on hover" in `packages/components/src/dnd/web/sortable-item.tsx:46`.
- Web drop monitors read current items and callbacks rather than stale closures — evidence: code: "Use refs to avoid stale closures in the monitor callback." in `packages/components/src/dnd/web/sortable-list.tsx:29`.
- Web nested lists reject drops from another list — evidence: code: "Key for nested lists: only accept drops from the same list" in `packages/components/src/dnd/web/sortable-item.tsx:158`.

**Usage:** Observed: **2 importing files**, both listed: `packages/core/src/screens/main/components/ui-settings/columns-form.tsx`, `packages/core/src/screens/main/pos/products/filter-bar/filter-bar-list.tsx`. Top explicit JSX attributes, excluding implicit children: `listId` **2**, `items` **2**, `getItemId` **2**, `onOrderChange` **2**, `renderItem` **2** (`className` also ties at **2**).


### docs-link


**Job:** A consistently styled documentation link with a trailing external-link arrow.

**Base:** React and local `Button`, `ButtonText`, `HStack`, and `Icon` components, with `@wcpos/utils/open-external-url`; no split inside this folder, with platform hand-off delegated to that utility.

**Behaviour ledger:**
- Documentation links share one visual treatment and route through the system-browser hand-off, including Electron — evidence: `372bebd5ba 2026-08-20 feat(ui): one source of truth for totals, DocsLink component, per-hour request estimate`, code: "onPress={() => openExternalURL(href)}" in `packages/components/src/docs-link/index.tsx:33`.

**Usage:** Observed: **16 importing files**, excluding mock-only matches. Examples: `packages/core/src/screens/auth/components/url-input.tsx`, `packages/core/src/screens/main/health/database.tsx`, `packages/core/src/screens/main/logs/row-detail.tsx`, `apps/main/components/health/performance-screen.tsx`. Explicit JSX attributes: `href` **17**, `testID` **16**, `className` **1**, React `key` **1**; no fifth attribute, excluding implicit children.


### dropdown-menu


**Job:** A composable dropdown action menu with submenus, checkbox items, radio items, and destructive variants.

**Base:** `@rn-primitives/dropdown-menu`, `react-native`, and `react-native-reanimated`. No platform-suffixed files; `index.tsx` branches on `"Platform.OS !== 'web'"` for absolute-fill overlays and native fade animations. The `"Platform.OS === 'web'"` icon expression is commented out, not an active split.

**Behaviour ledger:**
- Submenu labels no longer flex-grow following the “Select Store” text fix — evidence: `c28abfa355 2025-07-01 fix menu text for 'Select Store'`, code: "<View className=\"flex-row items-center gap-2\">{children}</View>" in `packages/components/src/dropdown-menu/index.tsx:52`.
- Native menus animate entry and exit using the shared overlay fade duration — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "entering={Platform.OS !== 'web' ? FadeIn.duration(OVERLAY_FADE_MS) : undefined}" in `packages/components/src/dropdown-menu/index.tsx:106`.
- The native animation wrapper has full-bleed bounds and box-none pointer handling to preserve Android accessibility and outside taps — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "a11y prunes out-of-bounds children — see popover/index.tsx." in `packages/components/src/dropdown-menu/index.tsx:104`.

**Usage:** Observed: **10 importing files**, excluding mock-only matches. Examples: `packages/core/src/screens/main/components/header/user-menu.tsx`, `packages/core/src/screens/main/components/sync-button.tsx`, `packages/core/src/screens/main/customers/cells/actions.tsx`, `packages/core/src/screens/main/settings/printing/printer-row.tsx`. `DropdownMenuItem` is re-exported from `./item`; `DropdownMenuTrigger` aliases the primitive trigger. Top explicit JSX attributes: `onPress` **39**, `testID` **21**, `disabled` **9**, `align` **9**, `variant` **9**.


### error-boundary


**Job:** A react-error-boundary wrapper with a default dismissible error display.

**Base:** `react-error-boundary`, composed with local layout, text, icon, and tooltip components; no split.

**Behaviour ledger:**
- Narrow containers or very long errors show the message in a tooltip instead of inline — evidence: code: "if (containerWidth < 200 || errorMessage.length > 1000)" in `packages/components/src/error-boundary/fallback.tsx:31`.
- Both fallback layouts expose the same stable test identifier — evidence: `029fad548c 2026-04-30 Enforce stable testIDs in E2E tests`, code: "testID=\"error-boundary-fallback\"" in `packages/components/src/error-boundary/fallback.tsx:34` and `packages/components/src/error-boundary/fallback.tsx:59`.

**Usage:** Observed: **46 importing files**, excluding mock-only matches. Examples: `packages/core/src/contexts/hydration-providers.tsx`, `packages/core/src/extensions/slots/slot.tsx`, `packages/core/src/screens/auth/connect.tsx`, `apps/main/app/_layout.tsx`. Across **74 JSX usages**, explicit attributes are React `key` **3** and `FallbackComponent` **2**; no others, excluding implicit children.


### form


**Job:** React Hook Form adapters providing field controls, labels, validation messages, accessibility references, and debounced persistence.

**Base:** `react-hook-form`, `react-native`, `react-native-reanimated`, lodash `get`/`debounce`, and local input, selection, and toggle components; no split.

**Behaviour ledger:**
- Re-rendering a settings form no longer replaces its debounced writer and cancels a pending edit — evidence: `96a2689c1b 2026-09-02 fix(form): a re-render no longer cancels a pending settings write`, referenced PR #1483, code: "One debounced writer per delay, held in a ref so a re-render never replaces it." in `packages/components/src/form/use-form-change-handler.ts:70`.
- Unmounting flushes a pending edit instead of losing a just-selected setting — evidence: `96a2689c1b 2026-09-02 fix(form): a re-render no longer cancels a pending settings write`, referenced PR #1483, code: "debounced.flush();" in `packages/components/src/form/use-form-change-handler.ts:82`.
- Queued edits retain their edit-time persistence callback instead of being redirected after a store switch — evidence: `f3f92ecf59 2026-09-02 fix(form): bind each queued write to its edit-time onChange; type the test doubles`, PR #1766, code: "debounced(changes, onChangeRef.current);" in `packages/components/src/form/use-form-change-handler.ts:112`.
- Form-level resets cancel pending debounced writes rather than persisting stale edits — evidence: `bf4403a2ea 2026-05-22 fix: address remaining PR blockers`, code: "debounced?.cancel();" in `packages/components/src/form/use-form-change-handler.ts:103`.
- Select and Combobox clears normalize to an empty string so serialization preserves the clear operation — evidence: `27dbf55153 2026-08-23 fix(components): converge FormSelect and FormCombobox on '' when cleared (#1501)`, PR #1501, issue #1482, code: "return option?.value ?? '';" in `packages/components/src/form/option-value.ts:21`.
- Accessibility references are emitted only for labels, descriptions, and error messages actually rendered — evidence: `97cdf4c26a 2026-07-15 fix(components): omit dangling toggle group ARIA references`, code: "Each id is emitted only when the node it names exists." in `packages/components/src/form/aria.ts:7`.
- Segmented form controls retain ToggleGroup semantics instead of exposing tabs without tab panels — evidence: `68ae0d1d98 2026-07-15 fix(components): keep ToggleGroup semantics in FormToggleGroup, style as segmented control`, PR #645, code: "keeping ToggleGroup selection semantics for assistive technology." in `packages/components/src/form/toggle-group.tsx:19`.
- Disabled segmented controls disable their individual options — evidence: `68ae0d1d98 2026-07-15 fix(components): keep ToggleGroup semantics in FormToggleGroup, style as segmented control`, PR #645, code: "disabled={disabled}" in `packages/components/src/form/toggle-group.tsx:58`.
- Pressing the selected segmented option again leaves the form value unchanged — evidence: code: "the selected item again is a no-op (a form field must always hold a value)." in `packages/components/src/form/toggle-group.tsx:20`.
- Numeric input modes normalize display values and emit numbers for controls such as Numpad — evidence: code: "in these cases we should take and emit a number, this prevents confusion with numeric strings" in `packages/components/src/form/input.tsx:43`.
- Tree selection integrates hierarchical multi-selection with field validation and trigger-width matching — evidence: `254447a933 2026-03-26 feat: composable TreeCombobox with category tree filtering`, code: "matchWidth" in `packages/components/src/form/tree-combobox.tsx:84`.
- Select and Combobox custom-control props remain typed for controls with additional caller-specific properties — evidence: code: "Generic over the rendered control so that `customComponent` types the rest of the" in `packages/components/src/form/option-control.tsx:24`.

**Usage:** Observed: **37 importing files**, including one test file importing the change-handler hook; mock-only and `format`/`form-errors` substring matches excluded. Examples: `packages/core/src/screens/main/components/billing-address-form.tsx`, `packages/core/src/screens/main/components/customer/customer-form.tsx`, `packages/core/src/screens/main/orders/edit/form.tsx`, `packages/core/src/screens/main/settings/general.tsx`. Top explicit JSX attributes across exported tags, excluding spreads and implicit children: `name` **195**, `render` **195**, `control` **193**, `label` **154**, `customComponent` **65**.


### format


**Job:** Presentation helpers for addresses, names, dates, lists, numbers, and currency.

**Base:** `localized-address-format`, `date-fns`, `react-native` View, and local Text; no split.

**Behaviour ledger:**
- Addresses use localized postal ordering with family-name-first formatting for CN, JP, and TW — evidence: `bc8c2504a4 2026-05-03 Improve order modal metadata and address formatting`, code: "if (['CN', 'JP', 'TW'].includes(country || ''))" in `packages/components/src/format/address.tsx:65`.
- Address fallback detection preserves unavailable-country fields without rejecting known formats that intentionally omit administrative areas — evidence: `c7af3f8ecf 2026-05-03 fix: address remaining PR review feedback`, code: "return Boolean(country) && !linesEqual(lines, defaultLines);" in `packages/components/src/format/address.tsx:89`.
- Non-string list entries receive keyed fragments to avoid React key warnings — evidence: `82ff43e07e 2026-01-30 fix: address CodeRabbit review suggestions`, code: "return <React.Fragment key={index}>{item}</React.Fragment>;" in `packages/components/src/format/list.tsx:16`.

**Usage:** Observed: **4 importing files**, all listed: `packages/core/src/screens/main/customers/cells/address.tsx`, `packages/core/src/screens/main/components/order/customer.tsx`, `packages/core/src/screens/main/orders/cells/address.tsx`, `packages/core/src/screens/main/orders/view/sections/customer.tsx`. Only `FormatAddress` appears in JSX: `address` **6**, `showName` **6**; no other explicit attributes. Unrelated `format-meta-data-value` imports are excluded.


### hover-card


**Job:** A trigger-associated informational card rendered through a portal.

**Base:** `@rn-primitives/hover-card`, `react-native`, and `react-native-reanimated`. No platform-suffixed files; `index.tsx` uses `"Platform.OS !== 'web'"` for the overlay and animated wrapper’s absolute-fill styles.

**Behaviour ledger:**
- Native portal wrappers have full-bleed bounds and box-none pointer handling so Android accessibility can reach the content without blocking outside taps — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, issue #1614, code: "a11y prunes out-of-bounds children — see popover/index.tsx." in `packages/components/src/hover-card/index.tsx:28`.

**Usage:** Observed: **1 importing file**: `packages/core/src/screens/main/components/product/tax-based-on/index.tsx`. Explicit JSX attributes across exported tags: `side` **1**, `align` **1**, `className` **1**; no others, excluding implicit children.


### hstack


**Job:** A horizontal React Native layout container with spacing and reversed-order variants.

**Base:** `react-native` View and `class-variance-authority`; no split.

**Behaviour ledger:**
- none found

**Usage:** Observed: **128 importing files**, excluding mock-only matches. Examples: `packages/core/src/screens/auth/components/sites.tsx`, `packages/core/src/screens/main/components/header/user-menu.tsx`, `packages/core/src/screens/main/pos/cart/totals.tsx`, `apps/main/components/health/performance-screen.tsx`. Top explicit JSX attributes across **257 usages**: `className` **225**, React `key` **20**, `testID` **20**, `space` **15**, `accessibilityLabel` **1** (`pointerEvents` also ties at **1**); spreads and implicit children excluded.


### icon


**Job:** A named SVG icon with semantic colours, size variants, and an optional loading indicator.

**Base:** `react-native` View, `react-native-svg`, `uniwind`, and `class-variance-authority`. No platform-specific files; `packages/components/src/icon/index.tsx:126` branches on `"Platform.isWeb || Platform.isElectron"`.

**Behaviour ledger:**
- Uses CSS `currentColor` on web/Electron for hover inheritance and resolved theme colours on native — evidence: `3578256645 2025-12-18 fix icon colour`, code: "On web, use currentColor to inherit from CSS (enables hover state changes)" in `packages/components/src/icon/index.tsx:122`.
- Gives explicit colour classes precedence over variant classes and inherited text classes — evidence: code: "Order matters: textClass (from context like Button) → iconVariants → className (explicit override)" in `packages/components/src/icon/index.tsx:97`.
- Forwards pointer-event control to both the wrapper and SVG so icons can stop intercepting presses — evidence: `95148d4d01 2025-12-03 stop Icons from blocking press events`, code: "pointerEvents={pointerEvents}" in `packages/components/src/icon/index.tsx:129` and `packages/components/src/icon/index.tsx:135`.

**Usage:** 47 direct static-import files, including type-only imports; excludes mocks and `icon-button` substring matches. Representative paths: `packages/core/src/screens/auth/components/add-user-button.tsx`, `packages/core/src/screens/main/components/header/online.tsx`, `packages/core/src/screens/main/settings/theme.tsx`. Top explicit JSX props, excluding spreads: `name` (95), `className` (39), `size` (31), `variant` (13), `loading` (1).


### icon-button


**Job:** A pressable icon action with optional loading state and native haptic feedback.

**Base:** `react-native` Pressable, `expo-haptics`, `class-variance-authority`, and the local Icon. No platform-specific files; `packages/components/src/icon-button/index.tsx:66` branches on `"Platform.OS !== 'web' && !props.disabled && !disableHaptics"`.

**Behaviour ledger:**
- Always passes a boolean disabled state to avoid Android accessibility remaining disabled after re-enabling — evidence: `c99855da17 2026-08-27 fix(native-e2e): Open POS accessibility latch + the two remaining nightly defects (#1614) (#1616)`, PR/issues #1614 and #1616, code: "disabled={!!props.disabled}" in `packages/components/src/icon-button/index.tsx:85`.
- Makes the child icon transparent to pointer events so the enclosing button receives presses — evidence: `95148d4d01 2025-12-03 stop Icons from blocking press events`, code: "pointerEvents=\"none\"" in `packages/components/src/icon-button/index.tsx:93`.
- Applies the previously ignored `iconClassName` as an icon-specific override — evidence: `372bebd5ba 2026-08-20 feat(ui): one source of truth for totals, DocsLink component, per-hour request estimate`, code: "className={cn(className, iconClassName)}" in `packages/components/src/icon-button/index.tsx:92`.
- Adds light haptics only on non-web platforms when neither disabled nor explicitly opted out — evidence: code: "if (Platform.OS !== 'web' && !props.disabled && !disableHaptics)" in `packages/components/src/icon-button/index.tsx:66`.

**Usage:** 31 direct-import files, excluding mocks. Representative paths: `packages/core/src/screens/auth/components/sites.tsx`, `packages/core/src/screens/main/components/sync-button.tsx`, `packages/core/src/screens/main/pos/products/camera-scan-button.tsx`. Top explicit JSX props, excluding spreads: `name` (32), `onPress` (20), `testID` (17), `variant` (12), `size` (10).


### image


**Job:** An Expo image wrapper with shared display defaults and Tailwind class support.

**Base:** `expo-image`, plus `uniwind` on native. Platform-specific file: `packages/components/src/image/index.web.tsx`; native resolves to `index.tsx`.

**Behaviour ledger:**
- Passes `className` directly to ExpoImage on web instead of using the native styling wrapper — evidence: `f8831e2527 2025-09-29 fix images on web`, code: "Web-specific Image component that passes className directly to ExpoImage" in `packages/components/src/image/index.web.tsx:13`.
- Converts native `className` styling through Uniwind’s wrapper — evidence: code: "withUniwind automatically maps className → style prop." in `packages/components/src/image/index.tsx:8`.

**Usage:** 7 direct-import files, excluding mocks. Representative paths: `packages/core/src/screens/main/customers/cells/avatar.tsx`, `packages/core/src/screens/main/components/product/image.tsx`, `packages/core/src/screens/main/pos/products/grid/tile-image.tsx`. Explicit JSX props, excluding spreads: `className` (9), `source` (9), `recyclingKey` (8); only three distinct props found.


### input


**Job:** A composable text input with keyboard-type mapping, shared focus styling, and an optional clear button.

**Base:** `react-native` TextInput/View and `@rn-primitives/hooks` controllable state. Platform split: no split; web-specific styling uses `web:` classes.

**Behaviour ledger:**
- Delays autofocus by 50 ms to work around unreliable RNTextInput autofocus and competing focus owners — evidence: code: "Workaround for autoFocus not working reliably on RNTextInput." in `packages/components/src/input/index.tsx:134`.
- Runs the delayed autofocus effect only on mount rather than whenever `autoFocus` changes — evidence: `8c11023a40 2026-02-07 fix: audit and fix 12 problematic useEffect patterns across codebase`, code: "Empty dependency array is intentional - run once on mount only." in `packages/components/src/input/index.tsx:136`.
- Sends a synthetic change event when clearing so parents using `onChange` receive the empty value — evidence: code: "Web-specific workaround: simulate a change event for parent components" in `packages/components/src/input/index.tsx:217`.
- Restores input focus after clearing — evidence: `7b1e6a7fce 2024-11-08 update combobox to use popover primitives`, code: "inputRef.current.focus();" in `packages/components/src/input/index.tsx:224`.
- Exposes a clear-button testID for reliably emptying native fields before retyping — evidence: `013d430f22 2026-09-02 fix(e2e-native): clear the URL field through its × before retyping`, code: "testID={clearTestID}" in `packages/components/src/input/index.tsx:246`.
- Applies `leading-none` as part of the native numeric-input fix — evidence: `385724107b 2025-12-11 fix numput input on native`, code: "text-base leading-none outline-none" in `packages/components/src/input/index.tsx:154`.

**Usage:** 9 direct static-import files, including type-only imports and excluding mocks. Representative paths: `packages/core/src/screens/auth/components/url-input.tsx`, `packages/core/src/screens/main/components/number-input.tsx`, `packages/core/src/screens/main/components/query-search-input.tsx`. Top explicit JSX props, excluding spreads: `value` (11), `onChangeText` (9), `testID` (7), `className` (5), `placeholder` (5). Compound exports are `Input.Root`, `Input.Left`, `Input.InputField`, and `Input.Right`.


### keyboard-controller


**Job:** A platform adapter exposing native keyboard handling and web-compatible wrappers.

**Base:** `react-native-keyboard-controller`, re-exported by `index.tsx`; the web file imports its props type only. Platform-specific file: `packages/components/src/keyboard-controller/index.web.tsx`.

**Behaviour ledger:**
- Replaces KeyboardProvider and KeyboardAvoidingView with children-only wrappers on web — evidence: `60f77d4098 2025-04-04 add keyboard-controller wrapper for web`, code: "This is an empty wrapper for web platforms" in `packages/components/src/keyboard-controller/index.web.tsx:7` and `packages/components/src/keyboard-controller/index.web.tsx:15`.

**Usage:** 2 direct-import files: `packages/core/src/screens/auth/connect.tsx` and `apps/main/app/_layout.tsx`; no additional paths exist in the requested scope. Explicit JSX props: `behavior` (1), `style` (1); only two distinct props found across KeyboardAvoidingView and KeyboardProvider.


### label


**Job:** A styled form label that supports press interactions.

**Base:** `@rn-primitives/label`, `@rn-primitives/slot`, and `react-native` Pressable. Platform split: no split; web-specific styling uses `web:` classes.

**Behaviour ledger:**
- Wraps primitive label text in a Pressable to preserve press, long-press, press-in, and press-out events — evidence: code: "@rn-primitives/label is not using Pressable, only a View so we don't get the onPress events" in `packages/components/src/label/index.tsx:18`.

**Usage:** 6 direct-import files, excluding mocks. Representative paths: `packages/core/src/screens/auth/components/url-input.tsx`, `packages/core/src/screens/main/settings/components/settings-row.tsx`, `apps/main/components/health/performance-screen.tsx`. Explicit JSX props, excluding spreads: `nativeID` (6), `className` (2), `onPress` (2); only three distinct props found.


### list-item


**Job:** A selectable row with leading and trailing content, title/subtitle, and optional removal.

**Base:** `react-native` Pressable/View, `class-variance-authority`, and local IconButton/Text components. Platform split: no split.

**Behaviour ledger:**
- Gives explicit non-default variants priority over selected styling — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: "Explicit non-default variant (e.g. \"warning\") wins over selected." in `packages/components/src/list-item/index.tsx:80`.
- Stops the remove-button press from also activating the row — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: "e.stopPropagation();" in `packages/components/src/list-item/index.tsx:110`.

**Usage:** 1 direct-import file, excluding mocks: `packages/core/src/screens/auth/components/wp-user.tsx`; no additional paths exist in the requested scope. Top explicit JSX props: `leading` (1), `onPress` (1), `onRemove` (1), `removable` (1), `selected` (1), tied with five other props at one occurrence each.


### loader


**Job:** A theme-coloured SVG progress spinner.

**Base:** `react-native` View, `react-native-reanimated`, `react-native-svg`, `uniwind`, and `class-variance-authority`. No platform-specific files; `packages/components/src/loader/index.tsx:91` branches on `"!Platform.isNative"` and line 113 on `"Platform.isNative"`.

**Behaviour ledger:**
- Uses a Reanimated rotation on native instead of the inert Uniwind CSS spin class — evidence: `c34e838386 2026-08-27 fix(components): spin the Loader on native via reanimated`, code: "uniwind has no keyframe-animation support on native, so `animate-spin` is" in `packages/components/src/loader/index.tsx:85`.
- Keeps web rotation CSS-driven rather than JS-driven to avoid load-related stuttering — evidence: `c34e838386 2026-08-27 fix(components): spin the Loader on native via reanimated`, code: "animation: reanimated on web is JS-driven and would stutter under load." in `packages/components/src/loader/index.tsx:88`.
- Explicitly keeps the native progress animation running under reduced-motion settings — evidence: `c34e838386 2026-08-27 fix(components): spin the Loader on native via reanimated`, code: "withTiming(360, { duration: 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never })" in `packages/components/src/loader/index.tsx:97`.
- Resolves SVG stroke colours from theme variables rather than relying on native CSS colour inheritance — evidence: `7147247aef 2025-02-25 Fix icon colours in native`, code: "const resolvedColor = String(useCSSVariable(cssVariable) ?? '');" in `packages/components/src/loader/index.tsx:83`.

**Usage:** 9 direct-import files, excluding mocks. Representative paths: `packages/core/src/screens/auth/components/demo-button.tsx`, `packages/core/src/screens/main/components/data-table/list-footer.tsx`, `packages/core/src/screens/main/pos/checkout/tender/terminal-leg-view.tsx`. Explicit JSX props, excluding spreads: `size` (7), `variant` (2); only two distinct props found. Icon also renders Loader internally when loading; those indirect uses are outside these counts.


### logo


**Job:** A static SVG rendering of the WCPOS logo.

**Base:** `react-native-svg`. Platform split: no split.

**Behaviour ledger:**
- none found

**Usage:** 2 direct-import files: `packages/core/src/screens/auth/connect.tsx` and `packages/core/src/screens/splash/index.tsx`; no additional paths exist in the requested scope. Explicit JSX props: `height` (2), `width` (2); only two distinct props found.


### modal


**Job:** A route-aware modal and panel composition with content, header, scrolling body, footer, and close actions.

**Base:** `@rn-primitives/dialog`, `@rn-primitives/slot`, `react-native`, `react-native-reanimated`, `react-native-safe-area-context`, `expo-router`, and the local keyboard-controller wrapper. No platform-specific files; `packages/components/src/modal/index.tsx:214` uses `"Platform.select({ web: ModalOverlayWeb, default: ModalOverlayNative })"`; lines 253 and 321 branch on `"Platform.OS === 'web'"`.

**Behaviour ledger:**
- Pins the native scrim as a real view to prevent Android/Fabric reparenting crashes during checkout-to-receipt replacement — evidence: `52baf98760 2026-09-02 fix(components): pin the modal scrim as a native view — Android checkout→receipt crash`, upstream issue software-mansion/react-native-screens#3249, code: "collapsable={false}" in `packages/components/src/modal/index.tsx:180`.
- Pads native overlays for safe areas and shifts their content above the keyboard — evidence: `10f397594c 2025-03-24 Fix transparent modals`, code: "keyboardVerticalOffset={insets.bottom}" in `packages/components/src/modal/index.tsx:199`.
- Exposes programmatic closing so successful saves can dismiss their enclosing modal — evidence: `0a76ae391a 2026-08-14 fix(modals): close edit modals after a successful save`, code: "Programmatic access to the enclosing modal, e.g. to close it after a successful save." in `packages/components/src/modal/index.tsx:73`.
- Supports left, right, and bottom presentations with directional transitions alongside centred dialogs — evidence: `2a9bd23d1e 2026-09-11 spike(ui): side-panel Modal presentation + phone bottom-sheet Combobox (#1960)`, PR #1960, code: "export type ModalSide = 'center' | 'left' | 'right' | 'bottom';" in `packages/components/src/modal/index.tsx:41`.
- Dismisses native modals through a background scrim press — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "onPress={() => onClose(false)}" in `packages/components/src/modal/index.tsx:192`.
- Hides the native dismissal scrim from assistive technology — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "importantForAccessibility=\"no\"" in `packages/components/src/modal/index.tsx:194`.
- Uses dialog primitives on web for Escape dismissal, outside-click dismissal, and focus trapping — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "const Content = Platform.OS === 'web' ? DialogPrimitive.Content : View;" in `packages/components/src/modal/index.tsx:253`.
- Preserves panel flex sizing despite the additional web dialog wrapper — evidence: code: "Radix adds a content wrapper; display: contents preserves the panel's flex sizing." in `packages/components/src/modal/index.tsx:134`.
- Gives web dialogs an accessible name through the primitive Title — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "On web the panel is a Radix dialog; slotting the title gives it aria-labelledby." in `packages/components/src/modal/index.tsx:320`.
- Targets native content rather than the newly added scrim when applying child-size constraints — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "last-child: the content wrapper; the first child is the scrim Pressable." in `packages/components/src/modal/index.tsx:183`.
- Keeps side-panel footers outside the expanding scroll body with a separating top border — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "side !== 'center' && 'border-border border-t pt-4'" in `packages/components/src/modal/index.tsx:306`.
- Reserves header space for the close control — evidence: code: "NOTE: extra space on right for the close button" in `packages/components/src/modal/index.tsx:278`.

**Usage:** 24 direct-import files, excluding mocks. Representative paths: `packages/core/src/screens/main/customers/add.tsx`, `packages/core/src/screens/main/products/edit/product/form.tsx`, `packages/core/src/screens/main/receipt/receipt.tsx`, `packages/core/src/screens/main/pos/checkout/checkout.tsx`. Top explicit JSX props across the Modal family, excluding spreads: `size` (25), `side` (20), `testID` (16), `className` (10), `onPress` (6). The folder also exports `Panel*` aliases and `usePanel`; no JSX uses of those aliases were found in the requested scope.


### numpad


**Job:** A numeric-entry keypad with a text display, sign switching, decimal entry and optional percentage discounts.

**Base:** `react-native` (`TextInput`, `View`), `lodash/toNumber` and local input/button components; no split. DOM selection support is checked through `"webInput?.selectionStart !== undefined"` and optional `setSelectionRange` calls.

**Behaviour ledger:**
- Delays initial focus and text selection by 50 ms to work around unreliable autofocus — evidence: code: "@FIXME - the autofocus doesn't seem to work, perhaps it's not on the screen yet?" in `packages/components/src/numpad/index.tsx:45`.
- Runs initial selection only on mount so the third digit does not overwrite the preceding digits — evidence: `bcda913d84 2026-02-07 fix: numpad resets after 2 digits due to useEffect re-firing on value length change`.
- Guards DOM-only selection APIs on native TextInput refs — evidence: `3558dbabf1 2026-04-04 fix(pr277): restore corrupted numpad and fix pulse-row destructuring`, PR #277, code: "webInput?.setSelectionRange?.(0, 100);" in `packages/components/src/numpad/index.tsx:53`.
- Refocuses the display and moves the web cursor to the end after keypad presses — evidence: `44c3b60978 2024-11-04 Fix numpad UI`, code: "// after a button press, we want to focus the input" in `packages/components/src/numpad/index.tsx:205`.
- Gives the locale-dependent decimal key a locale-independent test identifier — evidence: code: "testID={value === decimalSeparator ? 'numpad-key-decimal' : undefined}" in `packages/components/src/numpad/index.tsx:246`.
- Gives icon-only keys stable identifiers so the sign-toggle key is addressable — evidence: `e513ffcb69 2026-08-24 fix(order-math): line taxes follow WooCommerce's storage contract (#1533)`, PR #1533, code: "const keyId = label ?? (icon ? `icon-${icon}` : undefined);" in `packages/components/src/numpad/index.tsx:89`.

**Usage:** **1 importing file**; path: `packages/core/src/screens/main/components/number-input.web.tsx`. Top explicit JSX props: `initialValue` (1), `onChangeText` (1), `decimalSeparator` (1), `discounts` (1), `formatDisplay` (1); `ref` also ties at 1. Counts are static JSX occurrences, not runtime render counts.


### panels


**Job:** Resizable panel groups with a direction-aware grip handle.

**Base:** `react-native-resizable-panels` and `react-native` (`View`); no split within this folder. Handle styling contains `web:group-hover:` variants.

**Behaviour ledger:**
- Restricts hover styling to web so it does not apply unconditionally on iOS or Android — evidence: `1eabc2c781 2026-05-02 fix(theming): reduce Uniwind theme transition cancellations on native`, code: "web:group-hover:cursor-ew-resize" in `packages/components/src/panels/index.tsx:53`.
- Exposes the wrapped handle’s enlarged coarse/fine-pointer hit targets through `hitTargetSize` — evidence: `748bcffff1 2026-08-28 feat(resizable-panels): hit target, double-tap reset, web keyboard + ARIA`, code: "hitTargetSize," in `packages/components/src/panels/index.tsx:28`.
- Exposes the wrapped handle’s double-tap reset with a `disableDoubleTap` opt-out — evidence: `748bcffff1 2026-08-28 feat(resizable-panels): hit target, double-tap reset, web keyboard + ARIA`, code: "disableDoubleTap," in `packages/components/src/panels/index.tsx:27`.
- Inherits web keyboard resizing and separator ARIA semantics from the wrapped handle — evidence: `748bcffff1 2026-08-28 feat(resizable-panels): hit target, double-tap reset, web keyboard + ARIA`.

**Usage:** **2 importing files**; prescribed grep finds 4 files including 2 mock-only tests. Paths: `packages/core/src/screens/main/pos/columns/pos-columns.tsx`; `packages/core/src/screens/main/reports/reports.tsx`. Top explicit JSX props across exported tags: `direction` (3), `defaultSize` (3), `testID` (2), `onLayoutChanged` (1), `minSize` (1); `id` also ties at 1.


### popover


**Job:** An anchored popover with a trigger, portal-backed content and animated presentation.

**Base:** `@rn-primitives/popover`, `react-native` and `react-native-reanimated`; no platform-suffixed files. `index.tsx` branches on `"Platform.OS !== 'web'"` for full-screen overlay and animation-wrapper bounds.

**Behaviour ledger:**
- Gives native portal wrappers full-screen bounds so Android accessibility does not prune visible content — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, issue #1614, code: "style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}" in `packages/components/src/popover/index.tsx:46`.
- Lets outside taps pass through the animation wrapper to the dismissing overlay — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, issue #1614, code: "pointerEvents=\"box-none\"" in `packages/components/src/popover/index.tsx:45`.
- Pins entrance and exit fades to the shared 200 ms duration instead of the default exit duration — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "exiting={FadeOut.duration(POPOVER_FADE_MS)}" in `packages/components/src/popover/index.tsx:44`.
- Accepts left and right placement in its public `side` type — evidence: `08c70e8df1 2026-02-12 fix: update component types to support existing size and side values`, code: "side?: 'top' | 'bottom' | 'left' | 'right';" in `packages/components/src/popover/index.tsx:28`.

**Usage:** **7 importing files**; prescribed grep finds 10 including 3 mock-only tests. Representative paths: `packages/core/src/screens/main/components/coupon/date-picker-input.tsx`; `packages/core/src/screens/main/components/header/notification-bell.tsx`; `packages/core/src/screens/main/components/number-input.web.tsx`; `packages/core/src/screens/main/pos/products/cells/variable-actions.tsx`; `packages/core/src/screens/main/pos/products/grid/variable-product-tile.tsx`. Top explicit JSX props across exported tags: `className` (8), `asChild` (7), `ref` (6), `side` (4), `align` (2).


### portal


**Job:** A direct export of portal rendering and portal-host primitives.

**Base:** `@rn-primitives/portal`, through `export * from '@rn-primitives/portal'`; no split.

**Behaviour ledger:**
- none found

**Usage:** **4 importing files**; prescribed grep finds 8 including 4 mock-only tests. Paths: `packages/core/src/screens/main/components/header/user-menu.tsx`; `apps/main/app/(app)/(drawer)/(pos)/_layout.tsx`; `apps/main/app/(app)/_layout.tsx`; `apps/main/app/(auth)/_layout.tsx`. Only explicit JSX prop: `name` (3), on `PortalHost`; the two `Portal` occurrences have no explicit attributes.


### pressable


**Job:** A React Native Pressable wrapper that supplies row-oriented styling.

**Base:** `react-native` (`Pressable`); no split.

**Behaviour ledger:**
- none found

**Usage:** **1 importing file**; path: `packages/core/src/screens/main/pos/cart/totals/customer-note.tsx`. Only explicit JSX prop: `onPress` (1).


### print


**Job:** Receipt/report layout primitives providing monospaced text, equal-width rows, separators and spacing.

**Base:** `react-native` (`View`, `Text`) and `class-variance-authority`; no split. Text styling includes `web:select-text`.

**Behaviour ledger:**
- Forwards row test identifiers so report blocks can be addressed without text selectors — evidence: `c7f9418627 2026-09-11 fix(orders): register names keyed per site/store, register verified in lane coverage, test ids on the report block`, code: "<View testID={testID} className=\"flex-row justify-between\">" in `packages/components/src/print/row.tsx:9`.

**Usage:** **1 importing file**; prescribed grep finds 3 including 2 test files using mocks/`requireActual`. Import path: `packages/core/src/screens/main/reports/report/template.tsx`. Top explicit JSX props across exported tags, excluding React `key`: `align` (22), `uppercase` (7), `bold` (3), `className` (2), `testID` (1).


### progress


**Job:** A progress bar accepting either a numeric value or a Reanimated shared value.

**Base:** `@rn-primitives/progress`, `react-native`, `react-native-reanimated` and `react-native-worklets`; no platform-suffixed files. Dispatch uses `"Platform.select({ web: WebIndicator, native: NativeIndicator, default: NullIndicator })"`.

**Behaviour ledger:**
- Subscribes the web indicator to shared-value changes so they trigger React rendering — evidence: `78ecded8e0 2026-03-02 fix: address review feedback from Codex and CodeRabbit`, code: "scheduleOnRN(setSvProgress, currentValue);" in `packages/components/src/progress/index.tsx:71`.
- Ignores stale shared-value state after `sharedValue` is removed — evidence: `2f6759c81f 2026-03-02 fix: address review feedback from CodeRabbit`, code: "const effectiveSvProgress = sharedValue ? svProgress : undefined;" in `packages/components/src/progress/index.tsx:78`.
- Applies custom indicator classes only to the indicator rather than duplicating them on its web wrapper — evidence: `2f6759c81f 2026-03-02 fix: address review feedback from CodeRabbit`, code: "<ProgressPrimitive.Indicator className={cn('bg-primary h-full w-full', className)} />" in `packages/components/src/progress/index.tsx:86`.
- Keeps native animated styles directly on `Animated.View` to avoid Slot flattening Reanimated markers and causing an iOS error — evidence: `707a39a3ed 2026-03-02 fix: avoid passing animated style through Slot on native Progress indicator`, code: "<Animated.View style={indicator} className={cn('h-full')}>" in `packages/components/src/progress/index.tsx:104`.

**Usage:** **2 importing files**; prescribed grep finds 4 including 2 mock-only tests. Paths: `packages/core/src/screens/main/settings/printer/dialog/connection/network-fields.tsx`; `packages/core/src/screens/splash/index.tsx`. Only explicit JSX props: `className` (1), `value` (1), `sharedValue` (1).


### radio-group


**Job:** Radio-group primitives with a composable labelled option supporting descriptions and trailing content.

**Base:** `@rn-primitives/radio-group` and `react-native` (`View`); no split. Styling includes `native:` sizing and `web:` grid/focus variants.

**Behaviour ledger:**
- Makes option labels select their radio value while respecting group-level and option-level disabling — evidence: `8abbc80ee5 2026-05-02 Modernize radio group and ref primitives`, code: "const isDisabled = groupDisabled || disabled;" in `packages/components/src/radio-group/index.tsx:98`.
- Associates optional descriptions with their radio controls for assistive technology — evidence: `fbcbd888e4 2026-05-02 fix: address remaining radio group review feedback`, code: "aria-describedby={descriptionID}" in `packages/components/src/radio-group/index.tsx:103`.
- Avoids emitting another change when the already-selected option’s label is pressed — evidence: `6634a13f4c 2026-05-02 fix: cover radio option label edge cases`, code: "if (!isDisabled && value !== selectedValue) {" in `packages/components/src/radio-group/index.tsx:115`.
- Allows omitted change handlers without throwing during label activation — evidence: `6634a13f4c 2026-05-02 fix: cover radio option label edge cases`, code: "onValueChange={onValueChange ?? noopOnValueChange}" in `packages/components/src/radio-group/index.tsx:41`.

**Usage:** **5 importing files**; prescribed grep finds 7 including 2 mock-only tests. Paths: `packages/core/src/screens/auth/components/store-select.tsx`; `packages/core/src/screens/main/components/tax-radio-groups.tsx`; `packages/core/src/screens/main/orders/refund/refund-destination-radio-group.tsx`; `packages/core/src/screens/main/settings/barcode-scanning/settings.tsx`; `apps/main/components/health/performance-screen.tsx`. Top explicit JSX props across exported tags, excluding spreads/React `key`: `value` (9), `onValueChange` (4), `label` (4), `testID` (2), `className` (1; tied with other single-occurrence props).


### select


**Job:** Composable single- and multi-select controls with an options-driven single-select convenience wrapper.

**Base:** `@rn-primitives/select`, `@rn-primitives/popover`, `@rn-primitives/hooks`, `@rn-primitives/slot`, `@radix-ui/react-select`, `react-native` and `react-native-reanimated`. Platform file: `trigger.web.tsx`, paired with `trigger.tsx`; `index.tsx` and `select-multi.tsx` branch on `"Platform.OS !== 'web'"`, and `index.tsx` also uses `"Platform.OS === 'web' && props.testID"`.

**Behaviour ledger:**
- Restores touch/pen opening through Pressable’s `onPress` while leaving mouse and keyboard activation to Radix — evidence: `aedbb11e62 2026-02-28 fix: restore custom Select trigger to fix touch screen activation`, issue #126, upstream issue founded-labs/react-native-reusables#274.
- Captures pointer type at `pointerdown` instead of trusting WebKit’s mouse-labelled compatibility click after an iPad touch — evidence: `113de1984d 2026-08-14 fix(components): open Select on touch in WebKit (iPadOS) — #863 (#1206)`, PR #1206, issue #863, code: "pointerTypeRef.current = ev.pointerType || null;" in `packages/components/src/select/trigger.web.tsx:102`.
- Clears stale touch state before keyboard activation so an aborted gesture cannot cause a later double-toggle — evidence: `113de1984d 2026-08-14 fix(components): open Select on touch in WebKit (iPadOS) — #863 (#1206)`, PR #1206, issue #863, code: "if (ev.key === 'Enter' || ev.key === ' ') pointerTypeRef.current = null;" in `packages/components/src/select/trigger.web.tsx:107`.
- Replaces Radix Value with context-rendered text after reported Value rendering problems — evidence: code: "I was having problems with the Select.Value component from Radix, so I created this SelectValue component." in `packages/components/src/select/trigger.web.tsx:16`.
- Uses a custom native Value to preserve inherited text styling and selected/placeholder presentation — evidence: `dba5f9115d 2026-06-08 Tidy printer dialog fields and select text color`, code: "TextClassContext styling. Keep selected and placeholder behavior in parity" in `packages/components/src/select/trigger.tsx:14`.
- Keeps cleared controlled single-selects controlled using an empty-string option sentinel while showing the placeholder — evidence: `60cc7e2e67 2026-08-25 fix(components): keep a single Select controlled once its selection clears`, code: "export const EMPTY_OPTION: NonNullable<Option> = { value: '', label: '' };" in `packages/components/src/select/controlled-value.ts:14`.
- Resolves emitted web selections back to canonical options so callers receive the supplied label rather than the raw value — evidence: `ccceebc667 2026-08-23 refactor(components): consolidate Select call sites behind OptionSelect (#1499)`, PR #1499, code: "return options.find((candidate) => candidate?.value === emitted.value) ?? emitted;" in `packages/components/src/select/resolve-option.ts:24`.
- Routes multiple selection through a checkbox-based popover instead of the single-select primitive — evidence: `c2a542926f 2026-03-25 feat(select): delegate to single or multi primitive based on multiple prop`, code: "onValueChange(toggleMultiValue(definedValues, { value, label }));" in `packages/components/src/select/select-multi.tsx:199`.
- Truncates multi-selection labels using configurable `+N` or ellipsis presentation — evidence: `8e12b5b1f0 2026-03-25 feat(select): add popover-based multi-select implementation`, code: "const getter = truncationStyle === 'ellipsis' ? getDisplayLabelEllipsis : getDisplayLabel;" in `packages/components/src/select/select-multi.tsx:117`.
- Omits the injected chevron for multi-select `asChild` triggers so the slot receives one child — evidence: `12c555afc6 2026-03-25 fix: address review feedback from chatgpt-codex-connector`, code: "if (asChild) {" in `packages/components/src/select/index.tsx:111`.
- Makes multi-select root disabling authoritative over trigger and item overrides — evidence: `ac68c7b10b 2026-03-25 fix: address coderabbit review feedback on select-multi`, code: "const itemDisabled = Boolean(rootDisabled || disabled);" in `packages/components/src/select/select-multi.tsx:194`.
- Can size single- and multi-select content to the measured trigger width — evidence: `254447a933 2026-03-26 feat: composable TreeCombobox with category tree filtering`, code: "style={matchWidth && triggerWidth ? { width: triggerWidth } : undefined}" in `packages/components/src/select/index.tsx:193`.
- Maps single-select item `testID` to `data-testid` explicitly because web items are Radix nodes rather than RNW Pressables — evidence: `ca3fd5a13e 2026-08-25 test(e2e): cover the variation popover's option states (#1575)`, PR #1575, code: "Platform.OS === 'web' && props.testID ? { 'data-testid': props.testID } : {}" in `packages/components/src/select/index.tsx:270`.
- Gives native single- and multi-select animation wrappers full-screen bounds to prevent Android accessibility pruning — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, issue #1614, code: "style={Platform.OS !== 'web' ? StyleSheet.absoluteFill : undefined}" in `packages/components/src/select/index.tsx:181`.
- Preserves outside-tap dismissal through full-screen animation wrappers with `box-none` — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, issue #1614, code: "pointerEvents=\"box-none\"" in `packages/components/src/select/select-multi.tsx:152`.
- Adds explicit native single-select fades and pins multi-select fade durations to the shared 200 ms constant — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: "entering={Platform.OS !== 'web' ? FadeIn.duration(POPOVER_FADE_MS) : undefined}" in `packages/components/src/select/index.tsx:178`.
- Renders scroll-up and scroll-down controls only on web — evidence: code: "if (Platform.OS !== 'web') {" in `packages/components/src/select/index.tsx:320` and `packages/components/src/select/index.tsx:337`.

**Usage:** **30 importing files**; prescribed grep finds 39 including 9 mock-only tests. Representative paths: `packages/core/src/screens/main/settings/printer/setup/printer-setup-dialog.tsx`; `packages/core/src/screens/main/components/tax-class-select.tsx`; `packages/core/src/screens/main/components/product/variation-select.tsx`; `packages/core/src/screens/main/receipt/printer-switcher.tsx`; `packages/core/src/screens/main/pos/products/ui-settings-form.tsx`. Top explicit JSX props across exported tags, excluding spreads/React `key`: `value` (57), `placeholder` (26), `label` (24), `options` (16), `onChange` (16); `onValueChange` also ties at 16. Counts include `OptionSelect` and exported `SelectPrimitiveTrigger`; native `Trigger` is re-exported from `@rn-primitives/select`.


### slider


**Job:** A styled single-value slider with configurable bounds, step and disabled state.

**Base:** `@rn-primitives/slider`; no split.

**Behaviour ledger:**
- none found

**Usage:** **3 importing files**; prescribed grep finds 5 including 2 mock-only tests. Paths: `packages/core/src/screens/main/pos/products/ui-settings-form.tsx`; `packages/core/src/screens/main/settings/barcode-scanning/settings.tsx`; `apps/main/components/health/performance-screen.tsx`. Top explicit JSX props: `value` (4), `onValueChange` (4), `min` (4), `max` (4), `step` (4).


### sort-icon


**Job:** A paired-caret indicator showing a column’s sort direction and hover state.

**Base:** Local `Icon` and `VStack` components; no direct primitive-library wrapper; no split.

**Behaviour ledger:**
- none found

**Usage:** Observed **1 direct-import file**; the prescribed grep finds 2 files because it includes a mock. Only import path: `packages/core/src/screens/main/components/data-table/header.tsx`. Explicit JSX attributes: `direction` (1), `hovered` (1); no others.


### status-badge


**Job:** A compact text badge displaying a status with semantic colour variants.

**Base:** `react-native` (`View`), `class-variance-authority`, and local `Text`; no split.

**Behaviour ledger:**
- Resets inherited text classes so enclosing buttons cannot override the badge’s semantic colours on hover — evidence: `b324f90140 2026-08-19 fix(components): a badge keeps its own colours wherever it is nested (#1369)`, PR/issue #1369, code: "`<TextClassContext.Provider value={undefined}>`" in `packages/components/src/status-badge/index.tsx:61`.

**Usage:** Observed **8 direct-import files**; 16 grep-reference files including mocks. Representative paths: `packages/core/src/screens/auth/components/sites.tsx`, `packages/core/src/screens/auth/components/wp-user.tsx`, `packages/core/src/screens/main/pos/cart/tab-chip.tsx`, `packages/core/src/screens/main/pos/checkout/tender/tender-pane.tsx`. Top 5 explicit JSX attributes: `label` (12), `variant` (12), `testID` (5), `className` (4), `key` (1).


### suspense


**Job:** A React Suspense boundary with development-only fallback diagnostics.

**Base:** `react` (`React.Suspense`) and `react-native` (`Text`); no split. The environment branch is "`process.env.NODE_ENV === 'development'`", not a platform branch.

**Behaviour ledger:**
- Records fallback timing directly in mount/unmount callbacks instead of triggering another state/effect cycle — evidence: `8c11023a40 2026-02-07 fix: audit and fix 12 problematic useEffect patterns across codebase`, code: "Timing logic lives directly in the callbacks — no state-as-trigger needed" in `packages/components/src/suspense/suspense.tsx:51`.
- Substitutes “Loading ...” for a falsy fallback in the development wrapper — evidence: code: "`return fallback || <Text>Loading ...</Text>;`" in `packages/components/src/suspense/suspense.tsx:17`.

**Usage:** Observed **47 direct-import files**; 76 grep-reference files including mocks/comments. Representative paths: `packages/core/src/contexts/hydration-providers.tsx`, `packages/core/src/extensions/slots/slot.tsx`, `packages/core/src/screens/auth/connect.tsx`, `packages/core/src/screens/auth/components/sites.tsx`. Across 59 imported `Suspense` JSX usages, the only explicit attribute is `fallback` (9).


### switch


**Job:** A boolean switch with optional label-driven toggling and separate web/native rendering.

**Base:** `@rn-primitives/switch`, `react-native-reanimated`, `uniwind`, and `class-variance-authority`. No platform-suffixed files; `packages/components/src/switch/index.tsx:175` selects "`Platform.select({ web: SwitchWeb, default: SwitchNative })`".

**Behaviour ledger:**
- Uses separate native track/thumb geometry and Reanimated thumb movement instead of the web CSS-transform implementation — evidence: `7abf0b3e20 2025-03-14 fix switch component for native`, code: "`transform: [{ translateX: withTiming(translateX.value, { duration: 200 }) }]`" in `packages/components/src/switch/index.tsx:150`.
- Resolves native track colours from theme variables rather than hardcoded light/dark RGB values — evidence: `1eabc2c781 2026-05-02 fix(theming): reduce Uniwind theme transition cancellations on native`, code: "`'--color-input', '--color-primary'`" in `packages/components/src/switch/index.tsx:120`.
- Keeps the native primitive’s background transparent so the animated outer track remains visible — evidence: `33cd3be328 2026-05-02 fix: address theme transition review feedback`, code: "`className={cn(nativeSwitchVariants({ size }), 'bg-transparent', className)}`" in `packages/components/src/switch/index.tsx:158`.
- Makes `SwitchWithLabel` honour controlled updates while retaining internal state for uncontrolled usage — evidence: `33cd3be328 2026-05-02 fix: address theme transition review feedback`, code: "`const checked = isControlled ? props.checked! : internalChecked;`" in `packages/components/src/switch/index.tsx:192`.

**Usage:** Observed **2 direct-import files**; 4 grep-reference files including mocks. Both paths: `packages/core/src/screens/main/products/cells/stock-quantity.tsx`, `packages/core/src/screens/main/pos/products/filter-bar/filter-bar-list.tsx`. Top 5 explicit JSX attributes: `checked` (2), `onCheckedChange` (2), `disabled` (1), `label` (1), `nativeID` (1); `size` and `testID` also tie at 1. Also wrapped by `FormSwitch`, exported through `@wcpos/components/form`; indirect usages are excluded from these counts.


### table


**Job:** Styled table primitives with alternating rows and an imperative add/remove-feedback row.

**Base:** `@rn-primitives/table`, `@rn-primitives/slot`, `react-native`, `react-native-reanimated`, `react-native-worklets`, and `uniwind`; TanStack imports supply types. No split; shared files contain `web:` styling modifiers.

**Behaviour ledger:**
- Uses column-oriented cell layout to contain overflowing children — evidence: code: "We wrap the children on flex-col shrink to stop it from overflowing the cell" in `packages/components/src/table/index.tsx:102`, code: "`flex-1 flex-col justify-center`" in `packages/components/src/table/index.tsx:107`.
- Excludes table-model objects from props forwarded to the rendered animated view — evidence: `1c62df7c8c 2026-04-04 fix(pulse-row): stop forwarding row/table props and make ref compatible with View contract`, PR/issue #277, code: "`{...viewProps}`" in `packages/components/src/table/pulse-row.tsx:158`.
- Dispatches animation-completion callbacks through `scheduleOnRN` instead of deprecated `runOnJS` — evidence: `65e0cc3cc7 2026-01-23 fix: bypass TanStack Table minification bug and migrate to scheduleOnRN`, code: "`scheduleOnRN(callback);`" in `packages/components/src/table/pulse-row.tsx:128`.
- Omits the redundant row-index dependency from pulse base-colour resynchronisation — evidence: `8c11023a40 2026-02-07 fix: audit and fix 12 problematic useEffect patterns across codebase`, code: "`}, [baseColor, backgroundColor]);`" in `packages/components/src/table/pulse-row.tsx:71`.
- Removes CSS colour transitions from animated rows to avoid attenuating and delaying the pulse — evidence: `91fb510369 2026-08-20 fix(pos): make the cart add/remove pulse fire once and reach full color`, code: "pulse never reaches the success/error color and visibly lags/snaps." in `packages/components/src/table/pulse-row.tsx:155`.
- Ignores repeated remove-pulse calls so subsequent presses cannot cancel the pending removal — evidence: `fe0efae382 2026-08-30 fix(pos): let the first remove press win in the cart`, issue #1693, code: "`if (removePulseActive.current) {`" in `packages/components/src/table/pulse-row.tsx:134`.
- Releases the removal latch after cancellation or mutation settlement so a surviving row remains removable — evidence: `d4439fcc45 2026-08-30 fix(pos): release the cart remove latch when the removal doesn't land`, review reference #1694, code: "`void Promise.resolve(callback?.()).finally(() => {`" in `packages/components/src/table/pulse-row.tsx:111`.

**Usage:** Observed **9 direct-import files**, including 1 type-only file; 14 grep-reference files including mocks. Representative paths: `packages/core/src/screens/main/components/data-table/index.tsx`, `packages/core/src/screens/main/components/data-table/skeleton.tsx`, `packages/core/src/screens/main/pos/cart/table.tsx`, `packages/core/src/screens/main/tax-rates/rate-table.tsx`. Top 5 explicit JSX attributes across exported table tags: `className` (21), `key` (14), `style` (7), `index` (6), `testID` (3). `PulseTableRow` and its ref type are re-exported by this folder’s index.


### tabs


**Job:** Tab navigation with ordinary, horizontally scrollable, and responsive-select lists.

**Base:** `@rn-primitives/tabs`, `react-native` (`ScrollView`, `View`), `expo-haptics`, `uniwind`, and local `OptionSelect`. No platform-suffixed files; branches are "`Platform.OS === 'web'`" at `packages/components/src/tabs/index.tsx:245` and "`Platform.OS !== 'web' && !props.disabled`" at line 289.

**Behaviour ledger:**
- Centres selected tabs using native ScrollView methods and `onLayout` measurements instead of Reanimated scrolling — evidence: `a545d6240a 2025-12-11 Fixes for scrolling tabs`, code: "`scrollRef.current.scrollTo({ x: finalScrollX, animated: true });`" in `packages/components/src/tabs/index.tsx:157`.
- Delays selection-driven scrolling until initial measurements have had time to arrive — evidence: code: "Small delay to ensure measurements are ready on initial render" in `packages/components/src/tabs/index.tsx:164`.
- Accounts for horizontal content padding when calculating the active tab’s centred position — evidence: `1cdf169c8b 2025-12-14 tweak scrollable tabs`, code: "`const adjustedX = x + LIST_PADDING;`" in `packages/components/src/tabs/index.tsx:148`.
- Applies the scrollbar-hiding class only on web — evidence: `1cdf169c8b 2025-12-14 tweak scrollable tabs`, code: "`Platform.OS === 'web' && 'scrollbar-hide'`" in `packages/components/src/tabs/index.tsx:245`.
- Re-centres the active tab after the container width changes — evidence: `c205737d65 2026-01-23 fix: improve cart tabs state sync and auto-scroll behavior`, code: "Re-scroll to active tab when container width changes (e.g., window resize)" in `packages/components/src/tabs/index.tsx:196`.
- Re-centres after content-size changes so the newly active “+” tab does not remain off-screen after voiding an order — evidence: `30bd2e1f8b 2026-09-03 fix(e2e-native): tablets keep their rail, phones reach the + tab`, body references #1760, code: "cashier scrolled (run 33750030091, Android phone, flow 08)." in `packages/components/src/tabs/index.tsx:184`.
- Gives overflow-navigation buttons stable test IDs for native automation — evidence: `30bd2e1f8b 2026-09-03 fix(e2e-native): tablets keep their rail, phones reach the + tab`, body references #1760, code: "`testID=\"scrollable-tabs-next\"`" in `packages/components/src/tabs/index.tsx:272`.
- Provides light haptic feedback for enabled native tab presses — evidence: `10b74393f9 2025-12-03 add haptics to tabs for native`, code: "`if (Platform.OS !== 'web' && !props.disabled) {`" in `packages/components/src/tabs/index.tsx:289`.
- Offers a small-screen select generated from tab values, labels, and disabled states when `asSelect` is enabled — evidence: `ef4cd8440c 2026-06-08 Add responsive select option for tabs`, code: "`<StyledView className=\"w-full sm:hidden\">`" in `packages/components/src/tabs/index.tsx:48`.

**Usage:** Observed **16 direct-import files**; 23 grep-reference files including mocks. Representative paths: `packages/core/src/screens/main/pos/cart/tabs.tsx`, `packages/core/src/screens/main/customers/edit/edit-customer.tsx`, `packages/core/src/screens/main/products/edit/product/modal.tsx`, `packages/core/src/screens/main/pos/checkout/tender/tender-checkout.tsx`. Top 5 explicit JSX attributes across exported tab tags: `className` (65), `value` (65), `onValueChange` (16), `testID` (11), `key` (8).


### text


**Job:** A styled text primitive supporting inherited text classes, child substitution, and optional HTML-entity decoding.

**Base:** `react-native` (`Text`), `@rn-primitives/slot`, `class-variance-authority`, and `html-entities`; `@rn-primitives/types` supplies props. No split; shared styling includes `web:` selection and interaction modifiers.

**Behaviour ledger:**
- Decodes HTML entities only for string children when explicitly requested — evidence: code: "`decodeHtml && typeof children === 'string' ? decode(children) : children;`" in `packages/components/src/text/index.tsx:33`.
- Merges caller classes after inherited text-context classes so explicit styling takes precedence in class merging — evidence: code: "`cn(textVariants({ variant }), textClass, className)`" in `packages/components/src/text/index.tsx:36`.

**Usage:** Observed **215 direct-import files**; the broad grep finds 302 files, including mocks and `textarea` substring matches. Representative paths: `packages/core/src/screens/auth/components/sites.tsx`, `packages/core/src/screens/auth/components/url-input.tsx`, `packages/core/src/screens/main/customers/cells/email.tsx`, `packages/core/src/screens/main/settings/barcode-scanning/settings.tsx`. Top 5 explicit JSX attributes across 855 direct `Text` usages: `className` (589), `testID` (94), `decodeHtml` (44), `key` (25), `numberOfLines` (25). Also re-exported as `ButtonText` through `@wcpos/components/button`; those indirect usages are excluded.


### textarea


**Job:** An autosizing multiline text input with controlled cursor-selection handling.

**Base:** `react-native` (`TextInput`) and `react-native-reanimated`; no split. Shared classes include web-specific focus rings and disabled cursor styling.

**Behaviour ledger:**
- Resizes to content height without shrinking below `minHeight` — evidence: `17b72a05ee 2024-09-28 autosize textarea component`, code: "`height: Math.max(minHeight, height.value),`" in `packages/components/src/textarea/index.tsx:44`.
- Explicitly resets height when the value becomes empty because the content-size event does not fire — evidence: code: "Necessary because onContentSizeChange doesn't fire for empty content." in `packages/components/src/textarea/index.tsx:88`.
- Positions the cursor at the end on focus while forwarding the caller’s focus handler — evidence: `17b72a05ee 2024-09-28 autosize textarea component`, code: "Sets the cursor position to the end of the current text and calls the parent `onFocus` handler if provided." in `packages/components/src/textarea/index.tsx:63`.
- Tracks selection changes to prevent native cursor jumps on re-render — evidence: `19e7955605 2025-11-06 Fix textarea cursor issues on native`, code: "Updates the local selection state to prevent cursor jumping on re-renders." in `packages/components/src/textarea/index.tsx:76`.

**Usage:** Observed **2 direct-import files**, both returned by grep: `packages/core/src/screens/main/components/editable-field.tsx`, `packages/core/src/screens/main/pos/cart/totals/customer-note.tsx`. Five equally frequent explicit JSX attributes: `value` (2), `onChangeText` (2), `autoFocus` (2), `onBlur` (2), `onSubmitEditing` (2); `blurOnSubmit` also ties at 2. One prop spread is not expanded. Also wrapped by `FormTextarea`, exported through `@wcpos/components/form`; indirect usages are excluded.


### toast


**Job:** A shared imperative toast API and toaster export covering native/web libraries and legacy callers.

**Base:** `sonner-native` in `sonner.tsx`; `sonner` in **`sonner.web.tsx`**. This is the folder’s platform split; no `Platform.OS` or `Platform.select` branches.

**Behaviour ledger:**
- Converts shared `type` options into native `variant` options — evidence: `c1008a4d9b 2025-08-08 update logging to toast`, code: "Convert type to variant for sonner-native compatibility" in `packages/components/src/toast/sonner.tsx:9`.
- Preserves legacy `text1`/`text2`, dismiss-button, and action options through the newer toast API — evidence: `cda47034a1 2025-08-07 update toast library`, code: "Legacy interface for backward compatibility" in `packages/components/src/toast/index.ts:14`.
- Dispatches supported web toast types through Sonner’s typed methods to retain semantic colours — evidence: `b273497a94 2026-08-29 fix(components): keep toast colours on web after the sonner 2.0.8 bump`, dependency-bump reference #1594, code: "`return sonnerToast[type](message, rest);`" in `packages/components/src/toast/sonner.web.tsx:24`.
- Treats unsupported runtime web types as plain toasts instead of calling nonexistent Sonner methods — evidence: `da1ff91794 2026-08-29 fix(components): guard unsupported web toast types`, code: "`return sonnerToast(message, rest);`" in `packages/components/src/toast/sonner.web.tsx:26`.
- Exposes toast IDs for workflows that update one existing toast instead of creating successive notifications — evidence: `463acde555 2026-07-17 feat(core): scan-feedback module — one updating toast per scan + engine-outage banner`, issue/spec #722, code: "Returns the toast id; passing the same `id` option again updates that toast in place." in `packages/components/src/toast/index.ts:43`.
- Supplies semantic default test IDs while preserving caller-provided IDs — evidence: `86f64ac608 2026-08-27 feat(sync): protocol signal, boundary tolerances, and the update-required gate UX (#1602)`, PR #1602, code: "`testId: options.testId ?? `${type ?? 'default'}-toast`,`" in `packages/components/src/toast/index.ts:73`.

**Usage:** Observed **22 direct-import files**, including test imports; 42 grep-reference files including mocks. Representative paths: `apps/main/app/_layout.tsx`, `packages/core/src/screens/main/pos/products/use-scan-feedback.ts`, `packages/core/src/screens/main/receipt/email.tsx`, `packages/core/src/screens/main/settings/printer/copy-setup-report.tsx`. `Toast` is imperative, not a JSX component; the single `Toaster` usage passes `position` (1), `richColors` (1), and `theme` (1), with no other explicit JSX attributes.


### toggle


**Job:** A styled two-state toggle button with variant-dependent descendant text styling.

**Base:** `@rn-primitives/toggle` and `class-variance-authority`; no split. Shared styles contain explicit `native:` sizing and `web:` interaction modifiers.

**Behaviour ledger:**
- Uses larger height classes on native than the corresponding default web sizes — evidence: code: "`default: 'native:h-12 native:px-[12] h-10 px-3'`" in `packages/components/src/toggle/index.tsx:19`.
- Uses shared `text-sm` typography instead of a separate native `text-base` override — evidence: `5d440d65b5 2025-03-14 increase font-size for native`, code: "`const toggleTextVariants = cva('text-foreground text-sm font-medium', {`" in `packages/components/src/toggle/index.tsx:31`.

**Usage:** Observed **0 direct-import files** and **0 `Toggle` JSX usages**; no representative direct-import paths or prop counts exist. The broad grep’s 6 matches are for `toggle-group`, not `toggle`. `ToggleGroup` consumes this folder’s exported style variants without re-exporting `Toggle`; indirect style consumers include `packages/core/src/screens/main/pos/products/cells/variations-popover/buttons.tsx`, `packages/core/src/screens/main/pos/products/ui-settings-form.tsx`, and `packages/core/src/screens/main/pos/cart/ui-settings-form.tsx`.


### toggle-group


**Job:** A grouped set of selectable toggle buttons with shared sizing and segmented borders.

**Base:** `@rn-primitives/toggle-group`, with `class-variance-authority` variants; no split.

**Behaviour ledger:**
- Joins adjacent toggles into a bordered segmented control using first/last-child flags — evidence: `e370bc95b4 2024-09-02 tweak components`, code: `"!isLastItem && 'border-border rounded-none border-r'"` in `packages/components/src/toggle-group/index.tsx:87`.

**Usage:** Observed: **4 importing files**; the requested grep returns 6 files including test mocks. Representative paths: `packages/core/src/screens/main/pos/cart/ui-settings-form.tsx`, `packages/core/src/screens/main/pos/products/cells/variations-popover/buttons.tsx`, `packages/core/src/screens/main/pos/products/filter-bar/quick-filter-editor.tsx`, `packages/core/src/screens/main/pos/products/ui-settings-form.tsx`. Top explicit JSX attributes across exported components: `value` **17**, `testID` **13**, `onValueChange` **6**, `type` **6**, `disabled` **1** (tied with `key`).


### tooltip


**Job:** A contextual hint attached to a trigger, with optional press-to-show behaviour on native.

**Base:** `@rn-primitives/tooltip`, native `@rn-primitives/slot`, React Native `Pressable`/`View`, and `react-native-reanimated`. Split: `index.web.tsx` versus `index.tsx`; web-file branches include `"Platform.OS !== 'web'"`, `"Platform.select({ web: undefined, default: FadeIn })"` and `"Platform.select({ web: undefined, default: FadeOut })"`.

**Behaviour ledger:**
- Disables native tooltips by default while allowing explicit `showOnNative` opt-in — evidence: `d69dd185f0 2025-12-14 remove tooltips on native`, code: `"Set \`showOnNative\` to true to enable press-to-show tooltip behavior."` in `packages/components/src/tooltip/index.tsx:17`.
- Preserves native trigger props through Slot when `asChild` is used — evidence: code: `"const Component = asChild ? Slot : hasPressableHandlers ? Pressable : View;"` in `packages/components/src/tooltip/index.tsx:51`.
- Uses a plain native View for handlerless triggers so nested icons do not swallow parent taps — evidence: `789a98ffd2 2026-09-02 fix(components): a native TooltipTrigger without press handlers no longer swallows the tap`, code: `"\"+\" new-order tab) swallowed the tap at its centre and only the edge worked."` in `packages/components/src/tooltip/index.tsx:45`.
- Requires callable press or hover handlers before choosing the native Pressable path — evidence: `84db1fb7c8 2026-09-02 fix(components): tooltip trigger picks Pressable only for callable press/hover handlers; typed test mocks`, PR #1789, code: `"([key, value]) => typeof value === 'function' && /^on((Long)?Press|Hover)/.test(key)"` in `packages/components/src/tooltip/index.tsx:49`.
- Gives native portal wrappers full-screen bounds and pass-through hit testing to prevent Android accessibility pruning — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, related #1614, code: `"a11y prunes out-of-bounds children — see popover/index.tsx."` in `packages/components/src/tooltip/index.tsx:83`.
- Forwards root `className` when native tooltips are enabled so uptime-strip flex sizing survives the wrapper — evidence: `748e2599ba 2026-07-31 fix(health): honest next-check countdown, native uptime tooltips`, PR #898, code: `"<TooltipPrimitive.Root className={className}>{children}</TooltipPrimitive.Root>"` in `packages/components/src/tooltip/index.tsx:28`.

**Usage:** Observed: **26 importing files**; grep returns 36 including test mocks. Representative paths: `packages/core/src/screens/main/components/capability-tooltip.tsx`, `packages/core/src/screens/main/components/drawer-content/drawer-item.tsx`, `packages/core/src/screens/main/pos/cart/tabs.tsx`, `apps/main/components/health/uptime-strip.tsx`. Top explicit JSX attributes: `asChild` **19**, `showOnNative` **8**, `delayDuration` **4**, `side` **4**, `onPress` **3**. `CapabilityTooltipTrigger` is an additional local wrapper around `TooltipTrigger`.


### tree


**Job:** A collapsible JSON inspector rendered through an Expo DOM component.

**Base:** `@uiw/react-json-view`, with `expo/dom` types and a `'use dom'` boundary in `tree-dom.tsx`; no split by platform filename or `Platform` branch.

**Behaviour ledger:**
- Hosts the JSON viewer inside an Expo DOM component with content-matched sizing — evidence: `887c39947a 2025-03-25 use dom for json tree`, code: `"'use dom';"` in `packages/components/src/tree/tree-dom.tsx:1`.
- Forces the DOM container to full width to correct JSON viewer display — evidence: `fe08cc195d 2025-10-30 fix json viewer display`, code: `"dom={{ matchContents: true, containerStyle: { width: '100%' } }}"` in `packages/components/src/tree/index.tsx:9`.

**Usage:** Observed: **10 importing files**, excluding `tree-combobox` substring matches and test mocks. Representative paths: `packages/core/src/screens/main/customers/edit/edit-customer.tsx`, `packages/core/src/screens/main/products/edit/product/modal.tsx`, `packages/core/src/screens/main/logs/row-detail.tsx`, `packages/core/src/screens/main/orders/edit/modal.tsx`. Explicit JSX attributes: `value` **10**, `collapsed` **1**; no other attributes found.


### tree-combobox


**Job:** A composable searchable hierarchy picker supporting single selection, multiple selection, and cascading selections.

**Base:** `@rn-primitives/popover`, `@rn-primitives/hooks`, React Native, `react-native-reanimated`, `react-native-gesture-handler`, and the local virtualized-list wrapper. No platform-suffixed implementation files; branches in `tree-combobox.tsx` use `"Platform.OS !== 'web'"` and `"Platform.OS === 'android'"`.

**Behaviour ledger:**
- Adds arrow-key navigation to the hierarchy popover — evidence: `470327eab9 2026-03-26 fix(components): address review feedback on tree components`, code: `"useArrowKeyNavigation();"` in `packages/components/src/tree-combobox/tree-combobox.tsx:293`.
- Wraps tree rows in the virtualized item component required by the web renderer — evidence: `470327eab9 2026-03-26 fix(components): address review feedback on tree components`, code: `"<VirtualizedListPrimitive.Item>"` in `packages/components/src/tree-combobox/tree-combobox.tsx:323`.
- Decodes HTML entities in option labels and search breadcrumbs — evidence: `470327eab9 2026-03-26 fix(components): address review feedback on tree components`, code: `'<Text className="text-popover-foreground text-sm" decodeHtml>'` in `packages/components/src/tree-combobox/tree-combobox.tsx:347`.
- Uses structural parenthood rather than filtered search shape when enforcing `parentSelectable` — evidence: `70fd7d1e15 2026-03-26 fix(components): address CodeRabbit review and fix coverage baseline`, code: `"ctx.hierarchy.nodeMap.get(flatItem.value)?.hasChildren ?? flatItem.hasChildren;"` in `packages/components/src/tree-combobox/tree-combobox.tsx:305`.
- Preserves the original option payload through ordinary and cascading selection — evidence: `27c50fa407 2026-03-26 fix(components): preserve Option.item in cascade selection path`, code: `"(option) => toOption(option.value, option.label)"` in `packages/components/src/tree-combobox/tree-combobox.tsx:148`.
- Supports trigger-width matching for popover content — evidence: `254447a933 2026-03-26 feat: composable TreeCombobox with category tree filtering`, code: `"matchWidth && widthCtx.triggerWidth ? { width: widthCtx.triggerWidth } : undefined;"` in `packages/components/src/tree-combobox/tree-combobox.tsx:297`.
- Separates selection on the left from an independent expansion caret on the right — evidence: `254447a933 2026-03-26 feat: composable TreeCombobox with category tree filtering`, code: `"onPress={handleToggle}"` in `packages/components/src/tree-combobox/tree-combobox.tsx:359`.
- Keeps typed search text synchronous while deferring hierarchy filtering — evidence: `8bcff42066 2026-06-08 fix: smooth native tree combobox search`, code: `"it('keeps typed search text immediately visible while tree filtering is deferred', () => {"` in `packages/components/src/tree-combobox/tree-combobox.native.test.tsx:123`.
- Resets both the filter and independently controlled search input when the popover closes — evidence: `8bcff42066 2026-06-08 fix: smooth native tree combobox search`, code: `"setSearchResetKey((key) => key + 1);"` in `packages/components/src/tree-combobox/tree-combobox.tsx:169`.
- Gives native lists a bounded explicit height that contracts for short results — evidence: `04ca6a7a5b 2026-06-08 Fix Android combobox popover scrolling`, code: `"height: getNativeListHeight(ctx.displayItems.length, estimatedItemSize),"` in `packages/components/src/tree-combobox/tree-combobox.tsx:414`.
- Uses gesture-handler scrolling specifically for Android popover lists — evidence: `04ca6a7a5b 2026-06-08 Fix Android combobox popover scrolling`, code: `"renderScrollComponent={isAndroid ? GestureHandlerScrollView : undefined}"` in `packages/components/src/tree-combobox/tree-combobox.tsx:424`.
- Uses value-keyed row and expansion test IDs instead of translated labels — evidence: `3fcc2758bf 2026-08-23 test(e2e): cover the product category filter, and make the filter bar addressable`, related #941, code: `"testID={\`tree-combobox-item-${flatItem.value}\`}"` in `packages/components/src/tree-combobox/tree-combobox.tsx:332`.
- Gives native portal wrappers full-screen bounds without intercepting outside taps to preserve Android accessibility — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, related #1614, code: `"a11y prunes out-of-bounds children — see popover/index.tsx."` in `packages/components/src/tree-combobox/tree-combobox.tsx:387`.
- Pins popover fade durations to the shared motion constant rather than Reanimated defaults — evidence: `89fe07768d 2026-09-11 feat(components): overlay batch 0 — motion constants, phone-sheet shell, panel dismissal, pinned footer (#1974)`, PR #1974, code: `"exiting={FadeOut.duration(POPOVER_FADE_MS)}"` in `packages/components/src/tree-combobox/tree-combobox.tsx:390`.

**Usage:** Observed: **2 direct importing files**; grep returns 5 including test mocks: `packages/core/src/screens/main/components/product/filter-bar/category-pill.tsx` and `packages/core/src/screens/main/pos/products/filter-bar/quick-filter-editor.tsx`. Indirect usage through `FormTreeCombobox` exported from `@wcpos/components/form` includes `packages/core/src/screens/main/products/edit/product/form.tsx`, `packages/core/src/screens/main/pos/cart/cells/edit-line-item/form.tsx`, and `packages/core/src/screens/main/pos/cart/add-misc-product.tsx`. Top explicit JSX attributes on directly imported tags: `asChild` **2**, `emptyMessage` **2**, `multiple` **2**, `onValueChange` **2**, `options` **2**; `searchPlaceholder` and `value` also tie at **2**.


### tree-select


**Job:** The surviving folder contains only a shared indented tree-row renderer and its indentation constant, not a complete TreeSelect control.

**Base:** React Native `Pressable` and `View`, plus the local Icon component; no split.

**Behaviour ledger:**
- none found

**Usage:** Observed: **0 importing files** under `packages/core/src` and `apps/main`; no representative consumer paths or JSX props found. `packages/components/src/tree-combobox/tree-combobox.tsx` imports `INDENT_PX` from this folder, but is outside the requested usage roots.


### virtualized-list


**Job:** A compound virtualized-list interface with native FlashList and browser TanStack implementations.

**Base:** Native `@shopify/flash-list`; web `@tanstack/react-virtual` with `@tanstack/virtual-core` types; React Native `View` and Lodash throttling. Split: `virtualized-list.web.tsx` versus `virtualized-list.tsx`; no `Platform.OS` or `Platform.select` branches.

**Behaviour ledger:**
- Excludes the web virtualizer hook from React Compiler memoization because the library is incompatible — evidence: `30ddb4ce16 2026-09-02 fix(components): preserve virtualizer compiler opt-out`, code: `"'use no memo';"` in `packages/components/src/virtualized-list/virtualized-list.web.tsx:48`.
- Keeps web row identity independent of `extraData` so selection or visibility updates do not remount every row — evidence: `e44285ed9e 2026-08-04 fix(components): stop folding extraData into web row keys`, code: `"would remount every visible row instead."` in `packages/components/src/virtualized-list/virtualized-list.web.tsx:207`.
- Passes record keys into the web virtualizer rather than retaining positional identity — evidence: `1b4815ae7b 2026-08-04 fix: preserve virtualized row identity`, code: `"getItemKey: (index) => (keyExtractor ? keyExtractor(data[index], index) : index),"` in `packages/components/src/virtualized-list/virtualized-list.web.tsx:119`.
- Forwards native `keyExtractor` to FlashList so row-local state follows records across reordering — evidence: `e6a965a647 2026-08-04 fix(components): give data-table rows record identity, not position`, code: `"keyExtractor={keyExtractor}"` in `packages/components/src/virtualized-list/virtualized-list.tsx:83`.
- Memoizes the native render-item adapter to avoid recreating FlashList’s renderer prop on every list render — evidence: `8665024853 2026-08-05 perf(components): memoize VirtualizedList renderItem adapter for FlashList v2`, code: `"const renderItemWithContext = React.useCallback<NonNullable<typeof renderItem>>("` in `packages/components/src/virtualized-list/virtualized-list.tsx:64`.
- Preserves cached or estimated web row sizes while their screen is hidden — evidence: `288085193d 2026-08-11 fix(components): stop hidden screens from corrupting virtualized list scroll state`, code: `"if ((element as unknown as HTMLElement).offsetParent === null) {"` in `packages/components/src/virtualized-list/utils/create-hidden-safe-measure-element.ts:8`.
- Suppresses end-reached fetching for zero-sized hidden web containers — evidence: `288085193d 2026-08-11 fix(components): stop hidden screens from corrupting virtualized list scroll state`, code: `"if (viewSize <= 0) return;"` in `packages/components/src/virtualized-list/utils/use-on-end-reached.ts:42`.
- Rechecks web end-reached conditions on container resize so fetching resumes after a hidden screen becomes visible — evidence: `ed5db8500b 2026-08-11 fix(components): recheck hidden lists after resize`, code: `"typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleScroll);"` in `packages/components/src/virtualized-list/utils/use-on-end-reached.ts:71`.
- Keeps web measurement refs stable and measures only when the attached node changes to avoid update loops — evidence: `01dde3fa96 2026-03-02 fix: address review feedback from CodeRabbit`, code: `"Stable ref callback that only measures when the DOM node changes (mirrors"` in `packages/components/src/virtualized-list/virtualized-list.web.tsx:258`.
- Defers mount-time web measurement until after React’s commit to avoid nested `flushSync` errors — evidence: `3b188dd8b6 2026-08-14 fix(components): defer virtualized-list mount measure out of React commit`, code: `"queueMicrotask(() => {"` in `packages/components/src/virtualized-list/virtualized-list.web.tsx:279`.
- Rechecks short-content pagination after estimated row sizes become measured sizes — evidence: `d438f5bca2 2026-03-30 fix: re-check viewport fill after virtualizer measures items`, code: `"the viewport when the actual measured sizes don't — preventing loadMore from firing."` in `packages/components/src/virtualized-list/utils/use-on-end-reached.ts:95`.
- Rearms empty-list pagination when the callback changes or a populated list becomes empty — evidence: `9096861fc5 2026-08-30 fix(components): re-arm empty list transitions`, code: `"Empty content cannot re-arm through either data growth or the short-content effect."` in `packages/components/src/virtualized-list/utils/use-on-end-reached.ts:26`.
- Adds bottom-edge tolerance and reset hysteresis to avoid repeatedly firing end-reached on tiny scroll movements — evidence: code: `"This ensures that if user is at absolute bottom, they need to scroll up"` in `packages/components/src/virtualized-list/utils/use-on-end-reached.ts:59`.
- Sizes the web root from measured content before paint for constrained popover layouts — evidence: `b3d307a9e6 2026-01-20 refactor: improve VirtualizedList sizing and use in notification panel`, code: `"rootRef.current.style.height = \`${totalSize + paddingVertical}px\`;"` in `packages/components/src/virtualized-list/virtualized-list.web.tsx:137`.
- Merges web parent styles instead of losing virtualization geometry through a later props spread — evidence: `237bc1b6f2 2026-01-21 fix: notification panel overflow and VirtualizedList parentProps bug`, code: `"style: { ...containerStyle, ...((parentProps as any)?.style || {}) },"` in `packages/components/src/virtualized-list/virtualized-list.web.tsx:198`.
- Positions the web loading footer after the virtualized content — evidence: `40b0713d4b 2025-12-18 Fix loading spinner`, code: `"transform: \`translateY(${totalSize}px)\`,"` in `packages/components/src/virtualized-list/virtualized-list.web.tsx:231`.
- Enables native nested scrolling only when a custom scroll component is supplied — evidence: `25484468a3 2026-06-08 fix: omit nested scroll props by default`, code: `"{...(renderScrollComponent ? { renderScrollComponent, nestedScrollEnabled: true } : {})}"` in `packages/components/src/virtualized-list/virtualized-list.tsx:81`.
- Carries a dependency patch that discards stale FlashList measurements even when layout truncation happened earlier — evidence: `fc64cf3db4 2026-08-30 fix(components): drop stale FlashList layout indices unconditionally`, related #1671 and #1695, code: `"it('drops stale ViewHolder measurements reported after the shrink', () => {"` in `packages/components/src/virtualized-list/flash-list-layout-manager.test.ts:66`.
- Carries a dependency patch that skips stale render-stack entries after the FlashList layout table shrinks — evidence: `6079dc819a 2026-08-30 fix(pos): live resize-handle a11y values on native and a FlashList guard for a shrinking layout table`, upstream issues #2440/#2291 and PR #2460, code: `"it('renders the keys that still have a layout and skips the ones past the table', () => {"` in `packages/components/src/virtualized-list/flash-list-render-stack.test.tsx:65`.

**Usage:** Observed: **4 importing files**; grep returns 8 including test mocks. All import the namespace `VirtualizedList`: `packages/core/src/screens/main/components/data-table/index.tsx`, `packages/core/src/screens/main/components/header/notification-panel.tsx`, `packages/core/src/screens/main/components/product/variable-product-row/index.tsx`, `packages/core/src/screens/main/pos/products/grid/index.tsx`. Top explicit JSX attributes across namespace tags: `data` **3**, `estimatedItemSize` **3**, `renderItem` **3**, `keyExtractor` **2**, `ListEmptyComponent` **2**; several other attributes tie at **2**.


### vstack


**Job:** A vertical React Native View with configurable spacing and reversed ordering.

**Base:** React Native `View` with `class-variance-authority`; no split.

**Behaviour ledger:**
- none found

**Usage:** Observed: **130 importing files**; grep returns 193 textual matches including test mocks. Representative paths: `packages/core/src/screens/auth/components/site.tsx`, `packages/core/src/screens/auth/components/store-select.tsx`, `packages/core/src/screens/auth/components/url-input.tsx`, `packages/core/src/screens/auth/components/wp-users.tsx`, `packages/core/src/screens/auth/connect.tsx`. Top explicit JSX attributes: `className` **168**, `space` **84**, `testID` **35**, `key` **4**, `style` **2**.


### webview


**Job:** An embedded-document wrapper providing a shared messaging interface over native WebView and browser iframe implementations.

**Base:** Native `react-native-webview` with Lodash string detection; web DOM `<iframe>` inside React Native `View`, with `@rn-primitives/hooks` ref composition. Split: `index.web.tsx` versus `index.tsx`; no `Platform.OS` or `Platform.select` branches.

**Behaviour ledger:**
- Parses native JSON message strings while retaining the original event for non-JSON messages — evidence: `3d93c8ab56 2025-03-08 fix webview for native payments`, code: `"If it's not valid JSON, just pass the original event"` in `packages/components/src/webview/index.tsx:100`.
- Wraps browser iframe messages in `nativeEvent` for the shared payment handler — evidence: `7c7c2251d7 2026-02-12 fix: repair web payment postMessage and add fallback order fetch`, code: `"nativeEvent: {"` in `packages/components/src/webview/index.web.tsx:100`.
- Dispatches native host messages to both window and document listeners with a legacy MessageEvent constructor path — evidence: `8decbab5b2 2026-05-15 fix: dispatch native webview payment messages`, code: `"dispatchMessage(document);"` in `packages/components/src/webview/index.tsx:70`.
- Disables bubbling for fallback native MessageEvents — evidence: `88d253b743 2026-05-14 Prevent WebView fallback message bubbling`, code: `"false,"` in `packages/components/src/webview/index.tsx:59`.
- Gives native inline HTML precedence over URI input even when `srcDoc` is an empty string — evidence: `2934e7bc71 2026-03-06 fix: address CodeRabbit review feedback`, code: `"const source = srcDoc != null ? { html: srcDoc } : { uri: src || '' };"` in `packages/components/src/webview/index.tsx:80`.
- Reports same-origin iframe content dimensions through ResizeObserver while forwarding native content-size events — evidence: `a2c5f36d35 2026-05-14 fix: size receipt preview to measured content, drop thermal frame chrome`, code: `"const observer = new ResizeObserver(() => measureContentSize());"` in `packages/components/src/webview/index.web.tsx:153`.
- Corrects the native content-size callback type to expose the runtime `contentSize` payload — evidence: code: `"but it is populated at runtime — the cast bridges the upstream gap."` in `packages/components/src/webview/index.tsx:113`.
- Applies iframe margin and overflow resets only when content-size reporting is requested — evidence: `5ffe475fb9 2026-05-14 fix: gate webview content sizing reset`, code: `"if (!onContentSizeChangeRef.current) return;"` in `packages/components/src/webview/index.web.tsx:133`.
- Keeps ResizeObserver callbacks pointed at the latest content-size handler without resubscribing — evidence: code: `"iframe load — always invokes the current handler without re-subscribing."` in `packages/components/src/webview/index.web.tsx:51`.
- Supports optional browser messaging origin pinning for mini-app hosts — evidence: `0b8e7c2e92 2026-09-02 feat(mini-apps): mini-app host, bridge, printer capabilities and catalog`, roadmap #133 and wiki #1088, code: `"localRef.current?.contentWindow?.postMessage(message, targetOrigin ?? '*');"` in `packages/components/src/webview/index.web.tsx:80`.
- Binds pinned incoming browser messages to the rendered iframe as well as its origin — evidence: `3b594c308d 2026-09-02 fix(mini-apps): address review — handshake gate, iframe source binding, safe default swap, catalog validation`, code: `"(origin !== targetOrigin || event.source !== localRef.current?.contentWindow)"` in `packages/components/src/webview/index.web.tsx:95`.

**Usage:** Observed: **7 importing files**: 3 render `WebView`, and 4 import only its handle type, including one test. Grep returns 10 files including mocks. Representative paths: `packages/core/src/screens/main/mini-apps/mini-app-host.tsx`, `packages/core/src/screens/main/receipt/receipt-body.tsx`, `packages/core/src/screens/main/pos/checkout/components/payment-webview.tsx`, `packages/core/src/screens/main/mini-apps/bridge/use-bridge.ts`. Top explicit JSX attributes: `className` **3**, `onError` **3**, `onLoad` **3**, `onMessage` **3**, `ref` **2** (tied with `src`); attributes supplied through spreads are not counted.

