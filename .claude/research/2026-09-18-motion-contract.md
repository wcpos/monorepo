# The beats and motion inventory, and one motion contract

Produced 2026-09-18 for [wcpos/roadmap#343](https://github.com/wcpos/roadmap/issues/343) (part of
[#282](https://github.com/wcpos/roadmap/issues/282)). Branch `research/motion-contract`, cut from `origin/next`
(`aebda38456`). The contract below is a **proposal for #340's grilling, not a decision**.

**Sources**

- Prototype: `docs/prototypes/2026-09-12-language/pos-register/index.html` in the roadmap worktree
  `docs+design-program-2026-09-12` — `<style>` block 813 lines, `<script>` 1917 lines. Counted here: **24
  `@keyframes` blocks, 43 `animation:` declarations** (+8 `animation-name`/`animation:none`), **15 `transition:`
  declarations**, **4** `prefers-reduced-motion` blocks (3 `reduce`, 1 `no-preference`). Tokens: `--ease:
  cubic-bezier(.2,.7,.2,1)`, `--t: 180ms`.
- README decisions: `2026-09-12-language/README.md` (decisions 9, 10, 29, 38-ish grid drill-in, 26 touches) and
  `pos-register/README.md` (items 6, 7; the crossfade rule at `:138-142`).
- Rules: `.claude/rules/design.mdc:77-83` (rule 6); direction note §4,
  `docs/design/2026-09-12-direction.md:135-158` (roadmap worktree `HEAD`).
- Prior research, built on and **not** redone: `origin/research/token-block-on-uniwind:.claude/research/2026-09-18-token-block-on-uniwind.md`
  (#339) — its Table 2 rows on `@keyframes`/`animation`, `transition`, `prefers-reduced-motion`.
- **Versions.** `react-native-reanimated` **4.5.5** (`pnpm-lock.yaml:15`; `apps/main/package.json:100`).
  `uniwind` **1.10.1** resolved (`pnpm-lock.yaml:11`) while `apps/main/package.json:111` asks 1.11.0 — #339's
  landmine, re-confirmed. `tw-animate-css` **1.4.0** (`pnpm-lock.yaml:9769`, installed copy agrees).
  `react-native-web` **0.21.2**. The stale main tree's installed reanimated is **4.5.1**, *not* the pin — reanimated
  claims below are cited to the v4 docs, not to that tree, except the `ReduceMotion` enum and `ReducedMotion.js`
  (unchanged between 4.5.1 and 4.5.5 per their d.ts/source; **UNVERIFIED** at 4.5.5 exactly).
- No builds, installs or test suites were run.

---

## At a glance

| | count |
|---|---|
| Distinct animated effects in the drawing (keyframes + load-bearing transitions) | **27** |
| — completion beats (rule 6's "every completion gets a beat") | **9** |
| — structural transitions (a surface arrives or leaves) | **11** |
| — waiting indicators (indefinite by design: spinner, indeterminate bar, hold-fill) | **3** |
| — decorative (the direction's out-list) | **4** |
| Over the guidelines' budget (>400 ms on a path the cashier waits on) | **4**, plus 1 infinite |
| Have a native Reanimated pattern in the library **today** | **11** |
| Have **none** | **16** |
| Reduce-motion: **native** | correct **by default** (`ReduceMotion.System`), 2 deliberate opt-outs |
| Reduce-motion: **web** | **unhandled** — 31 `web:animate-*` sites, 0 guards anywhere |

**The three findings that most change the plan**

1. **Web, not native, is where reduce-motion is broken — the ticket has it backwards.** On native every
   Reanimated animation defaults to `ReduceMotion.System`, so `withTiming`, `FadeIn.duration()` and layout
   transitions already honour the OS setting with no code
   ([accessibility docs](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/): "By default
   all animations are configured with `ReduceMotion.System`"). On web the motion is CSS: **`tw-animate-css` 1.4.0
   ships zero `prefers-reduced-motion` rules** (`grep -c prefers-reduced-motion node_modules/tw-animate-css/dist/tw-animate.css`
   → **0**, verified 2026-09-18) and `apps/main/global.css` adds none (`grep -n reduce apps/main/global.css` → no
   matches). So all **31** `web:animate-*` sites — every overlay fade, every zoom, the accordion — play at full
   strength for a cashier who asked for less motion. One `@media (prefers-reduced-motion: reduce)` block in
   `global.css` closes it; nothing else does.
2. **Two of the drawing's beats are already shipped over budget.** `pulseAdd` is `withSequence(withTiming(400),
   withTiming(400))` = **800 ms** (`packages/components/src/table/pulse-row.tsx:123-131`) — that is the
   line-added settle highlight, on the scan path. The Paid tick is `withDelay(150, withTiming(450))` = **600 ms**
   (`packages/core/src/screens/main/pos/checkout/receipt-stage/receipt-stage.tsx:59`). Rule 6 says "nothing over
   400 ms on a path the cashier is waiting on" (`design.mdc:78-79`). The contract has to rule on the shipped ones,
   not only the drawing.
3. **The direction note and the prototype contradict each other, and only Paul can settle it.** §4:
   "**Decorative motion is out** — no sliding rows, no ticking numbers, no gliding tabs" (`2026-09-12-direction.md:157-158`).
   The drawing slides a payment row in (`land`, 280 ms, style `:477`), staggers tiles on drill-in (Paul's own
   decision, language README `:740-743`), and brings 8 surfaces in on a slide. Either §4 means *"no motion on rows
   in a list the cashier is reading"* — which `land` still violates — or four drawn beats are out. Research cannot
   decide this; #340 must.

Two smaller ones worth carrying: **a dead motion class is already in the library** —
`web:group-hover:animate-fadeIn` (`packages/components/src/panels/index.tsx:51`) names an animation that exists in
neither `global.css` nor `tw-animate-css` (the only `--animate-*` tokens are `in`, `out`, `accordion-up/down`,
`collapsible-up/down`, `caret-blink`), so it is inert on **both** platforms and nothing reported it. And the
prototype's own reduce-motion guards **conflict on native**: line 428 is `(prefers-reduced-motion: no-preference)`
while 534/680/812 are `reduce`; both hit uniwind's `default: break`
(`node_modules/uniwind/src/bundler/css-processor/mq.ts:60-72`), so on native both sets would apply at once.

---

## Table 1 — the beats inventory

Selector/keyframe line numbers are the extracted `<style>` block (= `index.html` offset by the `<style>` tag). "Budget"
is rule 6: 150–250 ms typical, ease-out, **nothing over 400 ms on a waiting path**, interruptible.

### Completion beats (9)

| Name | Selector / keyframe | Duration + easing | Budget | What shows it | Library pattern today |
|---|---|---|---|---|---|
| Total settles | `.settled` / `@keyframes settle` `:568` | 220 ms `cubic-bezier(.2,.9,.3,1.2)` | ✅ | language README decision **29**: "the count-up would get boring → a single 220 ms settle, nothing spins"; driver `rollMoney()` script `:796-799` re-triggers by class removal + reflow, clears after 300 ms | **none** |
| Change due appears | `.pay .line .chg` / `risel` `:355-356` | 180 ms `--ease` | ✅ | rule 6 names it: "the change-due line appears as the amount is typed" (`design.mdc:80-81`) | **none** |
| Line-added highlight | `.line .lb` background-color `:214`, cleared by `.line.settle` `:215` | **800 ms** ease | ❌ **2× over** | decision **10**: "settle highlight + quantity focus, no toast"; script `:859` clears after 900 ms | `table/pulse-row.tsx:119-132` `pulseAdd` — 400+400 ms, **also over** |
| Success disc lands | `.disc` / `stamp` `:342-343` | 250 ms `--ease` | ✅ | decision **9**: "the stamp-in disc is the beat" | `cart/closure-sheet.tsx:51` `ZoomIn.duration(180).reduceMotion(ReduceMotion.System)` |
| Paid moment | `.paidwrap` / `pop` `:459-460` | 400 ms `cubic-bezier(.2,.9,.3,1.15)` | ⚠️ at the ceiling | pos-register README item **7**: "lands on the Paid beat, which keeps the pop and the drawn check" | `receipt-stage.tsx:58` `withTiming(1, {duration: 400})` — same number |
| Paid tick draws | `.paidwrap .disc svg path` / `draw` `:461-462` | 450 ms **after a 150 ms delay** = 600 ms | ❌ over | same item 7 ("the drawn check") | `receipt-stage.tsx:59` `withDelay(150, withTiming(0, {duration: 450}))` — same number, **also over** |
| A payment row lands | `.payrow` / `land` `:477` | 280 ms `cubic-bezier(.2,.9,.3,1.1)` | ✅ duration; ✗ direction | the payments ledger; **conflicts with §4's "no sliding rows"** | **none** (no list-insert beat in the library) |
| PAID / VOID stamp slams | `.stamp` / `slam` `:572,574` | 380 ms `cubic-bezier(.2,1.4,.4,1)` | ✅ | decision **29**: "PAID stamp: keep"; touches list `:511` "a rubber stamp slams at 8°, no confetti" | **none** |
| A split leg is paid | `sl-draw` `:390,425`; seat `pop` `:431`; `.sl-fill` / `.pay-track i` width `:381,496` | 400 ms / 300 ms / 300 ms `--ease` | ⚠️ `sl-draw` at the ceiling | language README `:365-366` (five split drawings); these live behind `board-split.html` per `:87` | `progress/index.tsx:96-99` determinate `withSpring` is the closest (fill, not draw) |

### Structural transitions (11)

| Name | Selector / keyframe | Duration + easing | Budget | What shows it | Library pattern today |
|---|---|---|---|---|---|
| Side panel in | `.sidepanel` / `slidel`,`slide` `:169-173,327,330` | 220 ms `--ease` | ✅ | style comment `:165-166` "Both are what next does with its side Dialogs" | `modal/index.tsx:50-59` + `dialog/index.tsx:52-61`: `SlideInRight/Left/Down` at `PANEL_SLIDE_MS` **250**, out `PANEL_SLIDE_OUT_MS` **200** (`lib/overlay-motion.ts:4-5`) |
| Sheet rise | `.sheet` / `rise` `:339`; phone panel `:171,328` | 180 / 200 ms `--ease` | ✅ | overlay system decisions (memory `overlay-system-decisions`) | `lib/phone-sheet.tsx:26-27` `SlideInDown/SlideOutDown` at 250/200 |
| Reports sheet rise | `rp-rise` `:681-682` (swaps `animation-name` only) | inherits `rise`'s 180 ms | ✅ | a 12 px rise instead of 24 px, reports only | same as above |
| Orders pane in | `.op-pane` / `op-slidein` `:778,806` | 220 ms `--ease` | ✅ duration; ✗ direction if read as a gliding surface | orders folded in 2026-09-17 (`:813` header) | `modal`/`dialog` side panel, above |
| Menu / popover / toast / order list in | `drop` `:285,294,305,307,309,759,801` | `var(--t)` = **180 ms** `--ease` | ✅ | one keyframe serves 7 surfaces — the single most reused beat | `popover/index.tsx:43-44`, `dropdown-menu/index.tsx`, `select/index.tsx:178-179`, `select/select-multi.tsx:150-151`, `tree-combobox/tree-combobox.tsx:389-390`: `FadeIn/FadeOut.duration(POPOVER_FADE_MS)` = **200** |
| Quantity expander grows | `.qx` / `qgrow` `:234-235` | 180 ms `--ease`, `clip-path: inset(... round 6px)` | ✅ | style comment `:233`; language README `:703` "the grow animation" | **none** — `clip-path` has no RN equivalent; needs a size/opacity twin |
| Products pane slides | `.pane` transform+opacity `:126`; `.enter-r/.exit-l` `:127` | 280 ms `--ease` | ✅ | style comment `:124-125` "the table slides on it (Paul 2026-09-17, board 4)" | **none** — no pane-stage component; driver is `requestAnimationFrame` + a 320 ms cleanup (`script:835`) |
| Old tiles leave | `.pane.sout .tile` / `tout` `:132` | 140 ms `--ease` `both`, +10 ms per tile (`script:832`) | ✅ | style comment `:131`; language README `:740-743` "**Decided (Paul, 2026-09-17): stagger**" | **none** |
| New tiles land | `.pane .tile.tin` / `tin` `:133` | 260 ms `--ease` `both`, **+22 ms per tile** (`script:833`) | ⚠️ total grows with tile count — 20 tiles = 260 + 418 = **678 ms** to the last tile (**UNVERIFIED**: no cap in the drawing) | same decision | **none** — `LayoutAnimationConfig`/`FadeInDown` exist (`form/common.tsx:95`) but nothing staggers |
| Crossfade | `xfade` `:467-468` (terminal status 150 ms) and `[data-xf]` `:528` (checkout panes 200 ms) | 150 / 200 ms `--ease` `both` | ✅ | pos-register README `:140-142`: "The panes and the surrounding cart/ledger furniture fade over 200 ms; the line items do not fade. **Reduced motion turns the fade off.**" | `FadeIn/FadeOut` as above; the *scoping* (surroundings fade, rows don't) has no component |
| Press / swipe / grip | `.press` `:83` 80 ms; `.line.going .lb` `:232` 160 ms; `.divider::after` `:106` 180 ms | 80 / 160 / 180 ms `--ease` | ✅ | style comment `:105` (grip: faint on touch, on hover on desktop) | `transition-*` **compiles on native** (#339, `uniwind/src/bundler/css-processor/rn.ts:11-19`); 21 `transition-*` class sites today. Press haptics: `button/index.tsx:278-280`, `icon-button/index.tsx` |

### Waiting indicators (3) — indefinite by design, exempt from the 400 ms ceiling

| Name | Selector / keyframe | Duration | Budget | What shows it | Library pattern today |
|---|---|---|---|---|---|
| Spinner | `spin` `:465-466`, also `:503,750` | 1 s linear infinite | exempt (functional) | terminal moment, pos-register README item 7 | `loader/index.tsx:96-104` `withRepeat(withTiming(360, {duration: 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never}), -1, false, undefined, ReduceMotion.Never)`; `terminal-leg-view.tsx:339-354` a second, unshared copy |
| Indeterminate progress bar | `.progress::after` / `op-progress` `:701,805` | 1.1 s `--ease` infinite, `translateX(-100% → 340%)` | exempt | orders list loading | **none** — `progress/index.tsx` has only determinate (`NativeIndicator:91-108`, web `:81-88`). And the bar is a `::after`, inert on native (#339) |
| Hold-to-void fill | `.btn.hold .fill` width `:290-291` | **600 ms linear** (the gesture's own length; `script:451` arms a 600 ms timer) | exempt — the duration *is* the hold, not a wait | Void has no confirmation (pos-register README `:161`) | **none** |

### Decorative (4) — the direction's out-list

| Name | Selector / keyframe | Duration | Verdict | What shows it |
|---|---|---|---|---|
| Current split segment breathes | `sl-breathe` `:426,429` | **1.6 s infinite alternate** | **out** — §4 "no animation for its own sake"; only motion in the drawing with no completion behind it | inside the `no-preference` guard `:428` (so it *would* run always on native) |
| Receipt tears off | `.cartcol.tearing` / `tear` `:575-576` | **420 ms** `cubic-bezier(.4,0,1,1)` | **theme opt-in only** | decision **29**: "Receipt tear-off: whimsical themes only"; script `:922` gates on `S.tx.tear && WHIMSY.includes(S.theme)` |
| Fresh receipt rolls in | `.cartcol.rollin` / `rollin` `:577` | **480 ms** `cubic-bezier(.2,.9,.3,1)` | **theme opt-in only** | same decision; script `:920` |
| Split receipts tear | `sl-tear` `:427,430` | 320 ms `--ease` | **board only** | language README `:87`: the split drawings "live on only in `board-split.html`" |

---

## Table 2 — the library's motion patterns today

| Component | Native mechanism (`file:line`) | Web mechanism (`file:line`) | Reduce-motion | Notes |
|---|---|---|---|---|
| Modal (panel + centre) | `modal/index.tsx:50-59,203-204` — `FadeIn` 150, `SlideIn{Right,Left,Down}` 250 / out 200 | `modal/index.tsx:145,260-261` — `web:animate-in web:fade-in-0 web:zoom-in-95 web:duration-200` | native ✅ default `System`; **web ✗** | Durations centralised by #1974 in `lib/overlay-motion.ts:1-5` (`OVERLAY_FADE_MS 150`, `POPOVER_FADE_MS 200`, `PANEL_SLIDE_MS 250`, `PANEL_SLIDE_OUT_MS 200`) |
| Dialog | `dialog/index.tsx:52-61,164-165` — same four | `dialog/index.tsx:79,256-260` — `web:animate-in/out`, `exitSlide[side]` | native ✅; **web ✗** | `useFocusAfterSlideIn` (`:111,234`) exists because the slide-in scrolls the nearest scrollable ancestor — motion with a focus side-effect |
| AlertDialog | `alert-dialog/index.tsx:49-50` — `FadeIn/FadeOut.duration(OVERLAY_FADE_MS)` | `:28,77-78` — `web:animate-in web:fade-in-0`, `web:zoom-in-95` | native ✅; **web ✗** | scrim `bg-black/70` aligned in #1974 |
| Phone sheet | `lib/phone-sheet.tsx:26-27` — `SlideInDown/SlideOutDown` at 250/200 | inherits (RN Web renders the same Reanimated view) | native ✅; web ✅ *via Reanimated* | The one surface where Reanimated already carries both platforms |
| Popover / Select / Select-multi / Tree-combobox / Dropdown / Hover-card / Tooltip | `FadeIn/FadeOut.duration(POPOVER_FADE_MS)` — `popover/index.tsx:43-44`, `select/index.tsx:178-179`, `select/select-multi.tsx:150-151`, `tree-combobox/tree-combobox.tsx:389-390`, `hover-card/index.tsx:30`, `tooltip/index.tsx:85-86` | `web:animate-in web:zoom-in-95 web:fade-in-0` + `web:data-[side=*]:slide-in-from-*` — `popover/index.tsx:54`, `select/index.tsx:189-190`, `dropdown-menu/index.tsx:67-68` | native ✅; **web ✗** | `select/index.tsx:178` and `tooltip/index.web.tsx:25-26` **explicitly disable** Reanimated on web (`Platform.OS !== 'web' ? … : undefined`) — the split is deliberate |
| Accordion | `accordion/index.tsx:25,33` `LinearTransition.duration(200)` layout; `:59` chevron `withTiming(250 / 200)`; `:117-118` `FadeIn`/`FadeOutUp.duration(200)` | `:100-101` `web:transition-all` + `web:animate-accordion-down/up`; keyframes `global.css:97-118` | native ✅; **web ✗** | The 200 ms in `accordion/index.tsx:25` and the `0.2s` in `global.css:97` agree **by luck**, not by construction |
| Collapsible | no animation (`collapsible/primitives.tsx` — only `useLayoutEffect` measurement in `primitives.web.tsx`) | `tw-animate-css` ships `--animate-collapsible-down/up` but **nothing uses them** | n/a | The open/close is instant on both platforms today |
| Loader / spinner | `loader/index.tsx:89-107` — `withRepeat(withTiming(360, 1000ms linear, ReduceMotion.Never), -1, …, ReduceMotion.Never)`, native-only (`:91`) | `:112` `web:animate-spin` CSS | **deliberately ignores** reduce-motion on both, with the reason in a comment (`:93-95`) | **The house ruling on one-vs-two**, `:85-88`: "uniwind has no keyframe-animation support on native, so `animate-spin` is inert… **Web keeps the CSS animation: reanimated on web is JS-driven and would stutter under load.**" |
| Progress | `progress/index.tsx:91-108` — `withSpring(width%, {overshootClamping:true})`, no duration | `:81-88` — `transition-all` + inline `translateX(-N%)` | native ✅ default `System`; **web ✗** (`transition-all` is unguarded) | **No indeterminate mode on either platform.** The drawing needs one |
| Table pulse row | `table/pulse-row.tsx:123-131` `pulseAdd` = `withSequence(400, 400)`; `:142-145` `pulseRemove` = `withTiming(400)` whose **completion callback commits the removal** | same (Reanimated, both platforms) | ✅ default `System` — **but see note** | `:79-92` documents #1693: a second press cancelled the pulse, `finished === false`, and the removal was dropped. **If reduce-motion is on, `withTiming` "return[s] the `toValue` immediately"** (accessibility docs) — the callback still fires, so the removal still commits; this is the one place where the reduce-motion path is load-bearing for *correctness*, and it is **UNVERIFIED** on a device |
| Switch | `switch/index.tsx:150-151` `withTiming(translateX, 200)`; root colour `interpolateColor` `:140-147` | same | ✅ | |
| Tabs | no animated indicator; `:300,306` `web:transition-all` only; haptic on press (`tabs/index.tsx:4`) | same | native n/a; **web ✗** | Consistent with §4's "no gliding tabs" |
| Form field error | `form/common.tsx:95-96` `FadeInDown` / `FadeOut.duration(275)` | same | ✅ | 275 ms with no constant behind it |
| Panels (resizable) | — | `panels/index.tsx:51` `web:group-hover:animate-fadeIn` + `transition-opacity duration-200` | **web ✗** | `animate-fadeIn` **does not exist** in `global.css` or `tw-animate-css` → **inert on both platforms** |
| DnD | `dnd/native/sortable-item.tsx:168,258-269,296-297,329-331` `withSpring(SPRING_CONFIG)`; `drop-indicator.tsx:67` | native only | ✅ | Springs do not cross to web (see below) |
| Toast | `toast/sonner.tsx` → `sonner-native` | `toast/sonner.web.tsx` → `sonner` | vendor-owned, **unaudited** | Two vendors, two timing models, **no shared constant** — the drawing's `drop` 180 ms toast has no house pattern |
| Paid moment | `receipt-stage/receipt-stage.tsx:52-88` — `AccessibilityInfo.isReduceMotionEnabled()` gates it, then `withTiming(1, 400)` + `withDelay(150, withTiming(0, 450))`; haptic `:71` `notificationAsync(Success)` | same | ✅ **explicit**, and holds `opacity: 0` until the async preference resolves (`:83`) | The best reduce-motion citizen in the repo; the pattern to copy. 600 ms total, over budget |
| Terminal wait | `terminal-leg-view.tsx:40-44` `AccessibilityInfo` → `:339-354` ring `withRepeat(withTiming(360, 1000 linear))` | same ring; step dots `:225` `web:transition-all web:duration-200 web:ease-out`, dropped when `reduceMotion` | ✅ **explicit**, defaults `useState(true)` (motion off until proven otherwise) | Step dots have **no native transition** — the beat exists on web only |
| Closure beat | `cart/closure-sheet.tsx:51` `ZoomIn.duration(180).reduceMotion(ReduceMotion.System)` | same | ✅ explicit (redundant — `System` is the default) | The only `.reduceMotion()` chain in the repo |
| Cart add/remove beat | `pos/cart/cells/actions.tsx:31-44` forwards every press to `pulseRemove`; `pos/hooks/utils.ts:54-70` `detectNewCartLines` decides who gets `pulseAdd`; `pos/cart/index.tsx:84-94` lets the first draft add pulse too | same | inherits pulse-row | The beat's *trigger* is a diff, not a callback — worth preserving in any rebuild |

Totals: **11** of the drawing's 27 effects map onto a pattern that exists today (side panel, sheet, popover fade, crossfade, press, spinner, line highlight, success disc, Paid pop, Paid tick, leg fill). **16** have none — the tile stagger, the pane stage, the quantity grow, the total settle, the change-due line, the row land, the stamp, the indeterminate bar, the hold fill, the toast timing, the tear/rollin/sl-tear/breathe, the split ring draw, the seat land.

---

## Reduce-motion on each platform

**Native — works, by default, and the CSS guard is a trap.**

- Reanimated: "By default all animations are configured with `ReduceMotion.System`" — when the OS setting is on,
  `withSpring`/`withTiming` "return the `toValue` immediately", `withDelay` "initiates the next animation
  immediately", "entering, keyframe, and layout animations instantaneously reach their endpoints", and "exiting
  animations and shared transitions are omitted"
  ([accessibility guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/)). Enum is
  `System | Always | Never` (`node_modules/react-native-reanimated/lib/typescript/commonTypes.d.ts:301-305`).
- `AccessibilityInfo.isReduceMotionEnabled()` — used at `terminal-leg-view.tsx:44` and `receipt-stage.tsx:54`.
- **`@media (prefers-reduced-motion)` and Tailwind's `motion-reduce:` / `motion-safe:` are inert, and worse than
  inert.** `motion-reduce` compiles to `@media (prefers-reduced-motion: reduce)`
  ([Tailwind docs](https://tailwindcss.com/docs/hover-focus-and-other-states)); uniwind 1.10.1's plain-feature switch
  handles only `orientation` and `prefers-color-scheme`, everything else `default: break`
  (`node_modules/uniwind/src/bundler/css-processor/mq.ts:60-72`). The guard contributes nothing to the resolver, so
  the wrapped declarations **apply unconditionally**. `motion-reduce:hidden` would hide the element always; the
  prototype's `no-preference`-scoped `sl-breathe` would run always. **0** `motion-reduce` sites in the repo today —
  keep it that way.

**Web — unhandled, in the half the app actually uses.**

- `tw-animate-css` 1.4.0: **0** `prefers-reduced-motion` rules (`grep -c` over
  `node_modules/tw-animate-css/dist/tw-animate.css`, 2026-09-18). `apps/main/global.css`: **0**. So the 31
  `web:animate-*` sites and the 21 `transition-*` sites are unguarded.
- Reanimated on web *does* read the setting — `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
  (`node_modules/react-native-reanimated/lib/module/ReducedMotion.js:8`) — but the components deliberately hand web
  to CSS instead (`loader/index.tsx:91,113`; `select/index.tsx:178`; `tooltip/index.web.tsx:25-26`;
  `accordion/index.tsx:112`), so that detection mostly goes unused.
- `AccessibilityInfo.isReduceMotionEnabled()` works on web via the same media query
  (`node_modules/react-native-web/dist/exports/AccessibilityInfo/index.js:18-22`, RN Web 0.21.2) and **resolves
  `true` when `matchMedia` is unavailable** — fail-safe *off*, which is why `receipt-stage.tsx:83` can hold
  `opacity: 0` until it resolves without risking a permanently invisible banner in a DOM-less test.
- The prototype's own rule (pos-register README `:142`) — "Reduced motion turns the fade off" — is therefore
  **true on paper and false in the app today**.

---

## One definition or two

**The case for Reanimated-on-web (one definition).** Reanimated v4 docs mark Web ✅ for
[entering/exiting animations](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations/),
[layout transitions](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/layout-transitions/)
and [`withTiming`](https://docs.swmansion.com/react-native-reanimated/docs/animations/withTiming/) — which covers
every structural transition and every beat in Table 1 except the two `clip-path`/`stroke-dashoffset` draws. One
`motion.ts`, one call site per beat, and reduce-motion solved everywhere at once because Reanimated reads the media
query itself (`ReducedMotion.js:8`). `lib/phone-sheet.tsx` already ships this way. `tw-animate-css` and 31 web-only
classes would retire.

**The case against (keep the split).**

1. **The repo already ruled, in a comment, on measured grounds**: "Web keeps the CSS animation: reanimated on web
   is JS-driven and would stutter under load" (`loader/index.tsx:87-88`). The vendor agrees: "all of the
   functionalities are implemented purely in JavaScript, hence the efficiency of the animations might be lower"
   ([web support](https://docs.swmansion.com/react-native-reanimated/docs/guides/web-support/)).
2. **The web POS thread is exactly the "under load" case.** Memory records the results-repopulation commit at
   ~25 ms and an idle-CPU history of rAF and compaction loops. A beat that stutters is worse than no beat.
3. **Springs do not cross.** "Spring-based animations are yet to be introduced to the web" (entering/exiting docs) —
   `progress/index.tsx:96` and all of `dnd/` are spring-driven.
4. **Two components deliberately opt web out already** (`select/index.tsx:178`, `tooltip/index.web.tsx:25-26`).
   Reversing that is a change of posture, not a refactor.

**My pick: two runtimes, one definition — and fix the reduce-motion half, which is the part that is actually
broken.** Keep CSS on web and Reanimated on native (the loader ruling stands until someone measures otherwise on a
real web build, which nobody has). But stop letting the twins hold their own numbers: one `motion.ts` owns every
duration and easing and *generates* the web tokens, and one `@media (prefers-reduced-motion: reduce)` block in
`global.css` gives web the story native gets for free. Re-open the one-definition question only if a device
measurement shows Reanimated-on-web holding 60 fps during a search commit — that is a #340 experiment, not a
research claim.

---

## Proposed motion contract (a proposal for #340)

**1. One file owns the numbers.** Extend `packages/components/src/lib/overlay-motion.ts` into
`packages/components/src/lib/motion.ts` — it already holds 4 of the durations (`:1-5`). It exports:

- **Durations**, named for the job, not the value: `PRESS 80`, `OVERLAY_FADE 150`, `CROSSFADE 200`,
  `POPOVER_FADE 200`, `SHEET_RISE 200`, `BEAT 220`, `PANEL_SLIDE 250` / `PANEL_SLIDE_OUT 200`, `PANE 280`,
  `STAMP 380`. Nothing above 400 exists as a constant, so writing one requires a code review.
- **One easing**: `Easing.bezier(0.2, 0.7, 0.2, 1)` ↔ `--ease` (the prototype's token). Beats that want the
  slight overshoot get a second, named `EASE_BEAT` (`cubic-bezier(.2,.9,.3,1.1)`), not an inline literal.
- **A `BEATS` record**, one entry per beat: `{ name, duration, easing, class: 'beat' | 'structural' | 'waiting',
  waitingPath: boolean }`. Table 1 above is the seed list.

**2. The web twin stays in step by construction, not by comment.** `motion.ts` is the source for the `@theme`
custom properties `global.css` consumes (`--duration-*`, `--animate-*`). A test asserts that every `--animate-*`
and every hard-coded `ms`/`s` in `global.css` resolves to a `motion.ts` constant, and that every `web:animate-*`
class used in `packages/` names an `--animate-*` token that exists. That last check alone would have caught
`animate-fadeIn` (`panels/index.tsx:51`). Today `accordion/index.tsx:25` (200) and `global.css:97` (`0.2s`) agree
by luck.

**3. Banned.**

- **Decorative motion.** Nothing animates unless it marks a completion, a surface arriving/leaving, or an
  indefinite wait. `sl-breathe` is out. `tear`/`rollin`/`sl-tear` survive only as whimsical-theme opt-ins
  (decision 29) and never in a default theme.
- **Over 400 ms on a waiting path.** Named offenders to fix, not grandfather: `pulseAdd` 800 ms
  (`pulse-row.tsx:123-131`), the Paid tick 600 ms (`receipt-stage.tsx:59`), `tear` 420 ms, `rollin` 480 ms. The
  hold-to-void fill (600 ms) and the two infinite indicators are **exempt and must be marked so in `BEATS`**.
- **Non-interruptible.** A beat cancels on unmount (`cancelAnimation`) and survives being re-triggered.
  `pulse-row.tsx:79-92` is the worked example of what goes wrong (#1693): a completion callback on a cancellable
  animation dropped a pending removal. No beat may be the **only** path by which state commits.
- **Ticking numbers** (decision 29) and **gliding tabs** (§4). Per §4, `land` on `.payrow` and the tile stagger
  need an explicit ruling — see finding 3.
- **`motion-reduce:` / `motion-safe:` classes**, because the guard is inert on native and the rule applies always
  (`mq.ts:60-72`).

**4. Reduce-motion.**

- **Native: take the default.** Never pass `ReduceMotion.Never` except for a functional indefinite indicator, and
  then only with a comment saying why (`loader/index.tsx:93-95` is the template). `.reduceMotion(System)` chains
  are redundant; drop them.
- **Web: add the guard once.** A single `@media (prefers-reduced-motion: reduce)` block in `global.css` that zeroes
  `--tw-animation-duration` and the `transition-*` durations, with the spinner and the indeterminate bar excluded
  by name. This is the one change that makes pos-register README `:142` true.
- **Where a beat gates state or a haptic, read the preference in JS** and hold the element invisible until it
  resolves (`receipt-stage.tsx:52-63,83`), because `isReduceMotionEnabled()` is async and resolves `true` when
  `matchMedia` is missing (`react-native-web/…/AccessibilityInfo/index.js:18-22`).

**5. The review check.** A PR that adds or changes motion states five lines, or it is not reviewable:

1. which `motion.ts` constant, 2. which class (`beat` / `structural` / `waiting`), 3. the budget line (and, if over
400 ms, why it is not a waiting path), 4. the reduce-motion line (default, or the named exemption and its reason),
5. the interruption line (what cancels it, what happens if it fires twice).

Plus two greps as a gate: no numeric literal in `duration:` / `.duration(` under `packages/components/src` or
`packages/core/src` outside `motion.ts`; no `web:animate-*` class naming a token that does not exist.

---

## Marked UNVERIFIED

- **Nothing was run on a device or in a browser.** Every claim is from source, the pinned packages, the vendor docs
  and the prototype's own comments.
- **The reanimated source read here is 4.5.1** (the stale main tree's `node_modules`), while `next` pins **4.5.5**.
  The `ReduceMotion` enum and `ReducedMotion.js` are cited from 4.5.1; the behavioural claims are cited to the v4
  docs instead. Re-check if the pin moves.
- **The tile stagger's total duration.** 22 ms × tile count + 260 ms, uncapped in the drawing (`script:833`). 20
  tiles = ~678 ms to the last tile; a full catalogue page is worse. Whether Paul's 2026-09-17 decision intended a
  cap is not recorded.
- **Whether `pulseRemove`'s commit still fires under reduce-motion.** The docs say `withTiming` returns the
  `toValue` immediately, which should still invoke the completion callback with `finished === true`, so the removal
  should commit instantly rather than not at all — not exercised.
- **Whether Reanimated-on-web can hold 60 fps during a search-results commit** on this app. The
  `loader/index.tsx:87-88` ruling is a stated judgement, not a measurement filed anywhere I could find.
- **Whether `animate-fadeIn` is dropped or emitted as a keyframe-less `animation`** by Tailwind v4.3.3. Either way
  it is visually inert; only the diagnosis differs.
- **`sonner` / `sonner-native` timings** were not audited; the toast beat's real durations are vendor defaults.
