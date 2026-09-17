# The prototype's token block and CSS constructs on Uniwind

Produced 2026-09-18 for [wcpos/roadmap#339](https://github.com/wcpos/roadmap/issues/339) (part of
[#282](https://github.com/wcpos/roadmap/issues/282)). Branch `research/token-block-on-uniwind`, cut from `origin/next`
(`aebda38456`). Findings, not decisions.

**Sources**

- Prototype token block and style block: `docs/prototypes/2026-09-12-language/pos-register/index.html` in the roadmap
  worktree `docs+design-program-2026-09-12` — the `<style>` block is 813 lines, the token block lines 1–48; the README's
  "The tokens, as drawn" is `docs/prototypes/2026-09-12-language/README.md:17-45`.
- App tokens: `apps/main/global.css` (663 lines) on this branch.
- Prior research, built on, not redone: `origin/research/scale-axis:.claude/research/2026-09-12-scale-axis.md` (#284).
- **Uniwind version verified: 1.10.1**, read from source. `apps/main/package.json:111` asks for `1.11.0`;
  `pnpm-lock.yaml:11` resolves `uniwind: 1.10.1`, and the installed copy at
  `/Users/kilbot/Projects/monorepo-v2/node_modules/uniwind/package.json` is `"version": "1.10.1"`, so the installed
  source **is** the pinned source. Paths below of the form `uniwind/src/...` are that tree. Docs cross-check:
  <https://docs.uniwind.dev/class-names>.

---

## At a glance

**Tokens.** The prototype declares **37** tokens on `.frame`: 11 scale (`--u --fs --ctl --row --tile --r --amt --hair
--floor --ease --t`), 15 colour, 8 status, 3 font-family.

| | count |
|---|---|
| Map 1:1 onto a `global.css` token (same name, same job) | **12** |
| Rename (the token exists, under a different name) | **9** |
| New (nothing in `global.css` does this job) | **16** |
| Existing tokens with **no** prototype counterpart (retire candidates) | **19 names, ~164 class call sites** |

**Web-only constructs, and what native needs instead** — the six that matter:

1. **`@keyframes` / `animation`** (24 keyframe blocks, 44 `animation:` references) → **Reanimated**. Uniwind 1.10.1
   contains *no* animation or keyframes code path at all.
2. **`@media (prefers-reduced-motion)`** (3 blocks) → `AccessibilityInfo` + Reanimated `ReduceMotion`. On native the
   media guard is **inert**, so the rule inside it applies unconditionally.
3. **`mask-image` scroll fades** (6) → `@react-native-masked-view` or an absolutely-positioned `expo-linear-gradient`.
4. **`::before` / `::after`** (15) → a real child `View`.
5. **`position: sticky`** → `stickyHeaderIndices`; **`scrollbar-width: none`** (11) → `showsHorizontalScrollIndicator={false}`;
   **`text-overflow` / `white-space`** (12/46) → `numberOfLines` + `ellipsizeMode`.
6. **CSS Grid** (123 declarations, `auto-fill`, 13 `minmax`) → flex-wrap plus a computed column count, or `numColumns`.

**The three findings that most change the plan**

1. **Motion is the whole gap, and it is bigger than the ticket assumes.** `grep -rn "animation\|keyframes"
   uniwind/src` returns **nothing** — the bundler has no branch for the `keyframes` rule type and no mapping for the
   `animation` shorthand, so every one of the drawing's beats (tile stagger, pane slide, Paid stamp/slam, receipt tear,
   spinner, row land, total settle, indeterminate progress) compiles to nothing on native. `transition` *does* compile
   (`uniwind/src/bundler/css-processor/rn.ts:11`), so the split is clean: **transitions are shared, animations are a
   Reanimated twin per beat**, and the reduced-motion opt-out has to be written twice as well.
2. **The touch floor's arithmetic is safe; its *trigger* is not.** `max(var(--ctl), var(--floor))` compiles to
   `Math.max(...)` on native (`functions.ts:60`), so the floored control token works on both platforms unchanged. But
   the prototype flips `--floor` with a *width/pointer* class, and Uniwind's media-query processor understands only
   width ranges, orientation, `prefers-color-scheme` and platform — everything else falls to `default: break`
   (`mq.ts:60-75`). So the fine-pointer floor must be a **JS decision feeding `Uniwind.updateCSSVariables`**, i.e. the
   same lane as the scale step (#284). One knob, not two mechanisms.
3. **The status set is a re-shape, not a rename.** The prototype's fixed 5 (`ok warn bad info neutral`) plus 3 tinted
   surfaces replaces seven per-theme colour pairs in `global.css` — `success`, `warning`, `error`, `attention`,
   `action`, `tertiary`, `info` — carrying **162 class call sites**. The three `-bg` tokens are genuinely new. And the
   ticket's premise is slightly off: only `ok`, `warn` and `bad` have a `-bg`; `info` and `neutral` have none
   (`index.html` token block, line 21).

---

## Table 1 — the token concordance

`global.css` line numbers are the light-theme declaration; every colour token is declared five times (light 136,
dark 232, ocean 327, sunset 420, monochrome 514). Call-site counts are class-form greps over
`packages/core/src`, `packages/components/src`, `apps/main`.

### Scale axis (11)

| Prototype | `global.css` today | Verdict | Notes |
|---|---|---|---|
| `--u: 4px` | none (Tailwind default `--spacing`) | **new** | #284: `--spacing` is the live knob on both platforms. |
| `--fs: 14px` | `--text-3xs…--text-sm` (rem, `:29-38`) | **new** | The app scales *steps*; the prototype scales a *base*. Native multiplies `rem` out at build (#284), so per-platform plain numbers. |
| `--ctl: 44px` | none | **new** | Today control height is hard-coded `h-10` (=40) in cva — the audit's headline finding (#283). |
| `--row: 44px` | none | **new** | |
| `--tile: 64px` | none | **new** | |
| `--r: 8px` | `--radius: 0.5rem` (`:191`) | **rename — and revive** | `--radius` is declared in all five themes and **consumed nowhere**: `grep "var(--radius)"` = 0, no `--radius-*` in `@theme`. Dead today. |
| `--amt: 40px` | none | **new** | Leading-amount type size. |
| `--hair: 1px` | `--hairline-width` (`:137`) → `--border-width-hairline` (`:91`) | **rename** | 9 sites. Native resolves via `hairlineWidth()` → `rt.hairlineWidth` (`functions.ts:112`). |
| `--floor: 44px` / `24px` | none | **new** | See finding 2. |
| `--ease: cubic-bezier(...)` | none | **new** | Compiles on native: `rt.cubicBezier` (`functions.ts:47`, `css.ts:197`). |
| `--t: 180ms` | `--duration-750` (`:94`) | **new** | `duration-750` has **0 call sites** — retire it. |

### Colour set (15)

| Prototype | `global.css` today | Verdict | Notes |
|---|---|---|---|
| `--bg` | `--background` (`:140`) | same | |
| `--fg` | `--foreground` (`:141`) | same | |
| `--card` | `--card` (`:144`) | same | 58 sites. |
| `--muted` | `--muted` (`:164`) | same | 416 sites — the most-used token in the app. |
| `--muted-fg` | `--muted-foreground` (`:165`) | same | |
| `--border` | `--border` (`:188`) | same | |
| `--primary` | `--primary` (`:152`) | same | 104 sites. Identical value in light: `oklch(0.50 0.18 240)`. |
| `--primary-fg` | `--primary-foreground` (`:153`) | same | |
| `--ring` | `--ring` (`:190`) | same | |
| `--rail` | `--sidebar` (`:197`) | **rename** | 76 sites across `bg-/text-/border-sidebar`. Values differ: app `oklch(0.28 0.05 250)` (dark rail on a light theme) vs prototype `oklch(0.955 0.014 250)` (a *tinted light* rail). A repaint, not just a rename. |
| `--rail-fg` | `--sidebar-foreground` (`:198`) | **rename** | |
| `--rail-border` | `--sidebar-border` (`:199`) | **rename** | |
| `--destructive` | `--destructive` (`:172`) | same | 105 sites. |
| `--destructive-fg` | `--destructive-foreground` (`:173`) | same | |
| `--scrim` | none | **new** | Overlays today use literal `bg-black/50`-style classes. `oklch(… / .28)` compiles (see Table 2). |

### Status set (8) — fixed across all five themes in the prototype, per-theme today

| Prototype | `global.css` today | Verdict | Notes |
|---|---|---|---|
| `--ok` | `--success` (`:174`) | **rename** | 65 sites. Per-theme today (light `0.48 0.18 160`, dark `0.65 0.18 160`); the prototype fixes one value for all themes. |
| `--ok-bg` | none | **new** | |
| `--warn` | `--warning` (`:182`) | **rename** | 47 sites. Absorbs `--attention` too (15 sites) — the two overlap today. |
| `--warn-bg` | none | **new** | |
| `--bad` | `--destructive` (`:172`) **and** `--error` (`:184`) | **rename; retires `--error`, 17 call sites** | `--error` and `--destructive` hold *byte-identical values* in light (`oklch(0.55 0.22 25)`) and dark. Two names, one colour. |
| `--bad-bg` | none | **new** | |
| `--info` | `--info` (`:176`) | same | 14 sites. Per-theme today, fixed in the prototype. |
| `--neutral` | `--muted-foreground` (`:165`) | **rename** | The status dot's "no state" grey. |

### Font tokens (3)

| Prototype | `global.css` today | Verdict | Notes |
|---|---|---|---|
| `--font` / `--display` / `--mono` | none | **new** ×3 | All three alias the system stack in the drawing. Native needs `fontFamily` per platform, not a CSS list. |

### Existing tokens the drawing retires

| Token | Call sites | Prototype counterpart |
|---|---|---|
| `--tertiary` / `-foreground` | **0** | none — free to delete |
| `--action` / `-foreground` | **4** (all in `packages/core/src/screens/main/health/components/level-indicator.tsx`) | none |
| `--attention` / `-foreground` | **15** | folds into `--warn` |
| `--secondary` / `-foreground` | **18** | none — the prototype has no second brand colour |
| `--accent` / `-foreground` | **45** | `--muted` (it is the hover/focus surface) |
| `--popover` / `-foreground` | **32** | `--card` |
| `--card-header` | **14** | none — headers are `--card` + `--border` in the drawing |
| `--footer` (`bg-footer` etc.) | **7** | none |
| `--table-header` | **2** (`table/index.tsx:91`, `reports/closures/closure-list.tsx:69`) | `--muted` |
| `--table-row` | 0 class sites; read in JS | `--card` |
| `--table-row-alt` | 0 class sites; **2 JS reads** via `useCSSVariable('--color-table-row-alt')` (`table/index.tsx:73`, `table/pulse-row.tsx:57`) | none — the drawing has no zebra striping. These two are the ones that break silently. |
| `--input` | mapped at `:41` | `--card` + `--border` |
| `--chart-1…5` | read in JS for Reports | none in this prototype (the Reports language is a separate screen) |
| `--width-128/144/160` | **2** | none — arbitrary widths |
| `--text-3xs` | **1** | none |
| `--text-2xs` | **2** | none |
| `--duration-750` | **0** | `--t` |
| `--animate-accordion-up/down` | **1** | web-only by construction (`global.css:97-118`) |
| `--radius` | **0 consumers** | `--r` (revive, don't retire) |

---

## Table 2 — the constructs

"Native" is what happens under Uniwind **1.10.1** on React Native 0.86. **inert** = the declaration is dropped or the
guard has no effect, silently, with no build error.

| Construct | Prototype selector(s) | Web | Native | What native needs | Evidence |
|---|---|---|---|---|---|
| `max()` / `min()` (93 / 8) | `.btn`, `.ibtn`, `.chip`, `.in` — `height:max(var(--ctl),var(--floor))`; `.sidepanel{width:min(100%,400px)}` | ✅ | **works** — compiled to `Math.max(…)` / `Math.min(…)` | nothing | `uniwind/src/bundler/css-processor/functions.ts:56-62`; dispatch at `css.ts:218-221`; Uniwind's own `m-safe-or-*` utility uses `max()` (`uniwind/uniwind.css:21`) |
| `clamp()` (0 uses) | — | ✅ | **errors quietly** — no branch; falls through to `logger.warn("Unsupported function")` and emits the bare name | use `max`/`min` | `functions.ts:136`; `css.ts:221` lists only `min`, `max`, `abs` |
| `color-mix()` (26) | `.tr.rowbtn:active`, `.orow.on`, `.btn.vd.tonal`, `.gate`, `.steps .s.now` focus halo, `.op-orow.sel` | ✅ | **works, with a fidelity caveat** — becomes `rt.colorMix(color, weight, mixColor)`; the interpolation-space token (`in oklch`) is **stripped and ignored**, and mixing is done in RGB by culori. `…, transparent)` takes an exact alpha-multiply path | accept RGB mixing, or precompute the mixed colour as a token | `functions.ts:197-209` (space tokens filtered); `uniwind/src/core/native/native-utils.ts:4-24` |
| `oklch()` (all colour tokens) | every `--bg/--fg/--primary/…` | ✅ | **works** — literals converted to hex at build; with `var()` operands becomes `rt.parseColor("oklch", …)` at runtime | nothing; note P3 is flattened to sRGB hex | `uniwind/src/bundler/css-processor/color.ts:61-67, 79-85` (build) and `:22-32` (runtime) |
| `oklch(… / alpha)` (9) | `--scrim`, `.qx` box-shadow | ✅ | **works** — `formatHex8`, 8-digit hex | nothing | `color.ts:79-85`; `native-utils.ts:42-46` |
| `@media (pointer: coarse)` / `(hover: hover)` | **not used** — the prototype uses `.frame[data-w="desktop"]` instead | ✅ | **inert** — unknown plain features hit `default: break`, so the guard imposes nothing and the rule applies unconditionally | a JS pointer/width decision feeding `Uniwind.updateCSSVariables` (#284) | `uniwind/src/bundler/css-processor/mq.ts:60-75`; runtime surface has no pointer/hover field (`uniwind/src/core/types.ts:43-65`) |
| width breakpoints (`sm:`/`md:`/`lg:`) | `[data-w=…]` in the prototype | ✅ | **works** | nothing | `mq.ts:47-58`; gated at `uniwind/src/core/native/store.ts:137-138` |
| platform variants `ios: android: web: native:` | n/a | ✅ | **works** — these are Uniwind's own `@custom-variant`s | nothing | `uniwind/uniwind.css:1-7`; `uniwind/src/common/consts.ts:1-9` |
| `:focus-visible` (1) | `.frame :focus-visible{outline:2px solid var(--ring)}` | ✅ | **inert** — the processor matches pseudo-class kind `focus` only, never `focus-visible`; the declarations are never added | `focus:` (on native it *is* "focus visible" — there is no mouse focus) | `uniwind/src/bundler/css-processor/processor.ts:178-180` |
| `:focus` (1) | `.in:focus` | ✅ | **works** — gated on `state.isFocused` | nothing | `processor.ts:178`; `store.ts:143` |
| `:active` (25) | `.press:active`, `.btn:active`, `.ibtn:active`, `.tr.rowbtn:active` | ✅ | **works** — gated on `state.isPressed` | nothing | `processor.ts:174-176`; `store.ts:142`; docs list `active:` supported |
| `:disabled` (4) | `.btn:disabled`, `.tile:disabled` | ✅ | **works** — gated on `state.isDisabled` | nothing | `processor.ts:182-184`; `store.ts:144` |
| `:hover` (30) | `.divider:hover::after`, `.orow:hover`, desktop table rows | ✅ | **do not ship bare** — docs list `hover:*` as unsupported ("use `active:` and `focus:` state selectors instead"); the `@media (hover:hover)` wrapper Tailwind emits is itself inert per `mq.ts` | `web:hover:` — already the house pattern: **74** `web:hover:` sites vs **3** bare `hover:` | <https://docs.uniwind.dev/class-names>; `mq.ts:60-75`. *UNVERIFIED at this pin:* whether a bare `hover:` rule is **dropped** or **leaks unconditionally** depends on the exact nesting Tailwind v4.3.3 emits — the repo's device-verified trap says it leaks. Either way `web:hover:` is correct. |
| `group-*` / descendant state (`.tr.rowbtn:active .x`) | row hover-reveal affordances, `.sw.on::after` | ✅ | **inert on free Uniwind** — "`group-*` classes are parsed but have no runtime effect"; Pro adds `group-active:`/`group-focus:` | lift the state into React (the repo has 47 `group-*` sites today) | <https://docs.uniwind.dev/class-names> |
| `transition-*` (15) | `.press`, `.pane`, `.line.settle .lb`, `.btn.hold .fill` | ✅ | **works** — `transitionProperty` is mapped to RN's camelCased list; durations/easings pass through | nothing; `duration-*` is transition duration, never animation speed | `uniwind/src/bundler/css-processor/rn.ts:11-19`; `functions.ts:47-54` (cubic-bezier) |
| `@keyframes` + `animation` (24 / 44) | `tin/tout` tile stagger, `slide`/`slidel`/`rise`/`drop` panes, `stamp`/`slam` Paid, `tear`/`rollin` receipt, `spin`, `land`, `settle`, `op-progress`, `sl-draw`/`sl-breathe` | ✅ | **inert — nothing at all** | **Reanimated**, per beat. House pattern is already `web:animate-*` + a Reanimated twin | `grep -rn "animation\|keyframes" uniwind/src` → **no matches** (verified 2026-09-18); repo pattern at `packages/components/src/dialog/index.tsx:79,256-260` and `packages/components/src/loader/index.tsx:5-13` |
| `@media (prefers-reduced-motion)` (3) | the three per-screen `animation:none!important` blocks | ✅ | **inert** — falls to `mq.ts` `default: break`, so the *reduce* rules apply unconditionally | `AccessibilityInfo.isReduceMotionEnabled` + Reanimated `ReduceMotion` (already imported in `loader/index.tsx:9`) | `mq.ts:60-75` |
| `font-variant-numeric: tabular-nums` (12) | `.frame`, `.frame *` | ✅ | **works** — mapped to RN `fontVariant` | nothing (58 `tabular-nums` sites today) | `rn.ts:163-165` |
| `scrollbar-width:none` + `::-webkit-scrollbar` (7 + 4) | `.fbar`, `.tabs .scrollx`, `.legs`, `.splitdraft`, orders `.filters`/`.stats` | ✅ | **inert** — unknown property passed through to the style object | `showsHorizontalScrollIndicator={false}` on the ScrollView/FlashList. Web already has `.scrollbar-hide` (`global.css:649-663`, 1 call site) | `rn.ts:245-247` (unknown properties fall through verbatim) |
| `position: sticky` (1) | only the prototype's own dark control strip — **not part of the design** | ✅ | **errors** — RN accepts only `absolute`/`relative`/`static`; the value is passed through unchanged | `stickyHeaderIndices` on ScrollView, or FlashList's sticky header | `rn.ts:245-247`; 1 `sticky` site in the library today |
| `will-change` (1) | `.pane` | ✅ | **inert** (harmless) — unknown key on the style object | nothing; drop it | `rn.ts:245-247` |
| `mask-image` scroll fades (6) | `.fbar`, `.tabs .scrollx`, `.cartcol.tearing` | ✅ | **inert** — no `maskImage` mapping (only `backgroundImage` → `experimental_backgroundImage`) | `@react-native-masked-view/masked-view`, or an absolutely-positioned `expo-linear-gradient` over the scroller | `rn.ts:38-41` (the only image-ish mappings) |
| `filter: brightness()` (3) | `.btn.p:active`, `.btn.vd.fill:active` | ✅ | **inert** — the source returns `'""'` for `brightness`/`blur`/`contrast`/`grayscale`/`hue-rotate`/`invert`/`opacity`/`saturate`/`sepia` with the comment "Not supported by RN" | a pressed-state **colour token**, not a filter | `functions.ts:89-106`. *Note the docs page disagrees* — it lists `blur-*`, `grayscale`, `saturate-*` as supported with platform caveats. **At this pin, source wins.** |
| `backdrop-filter` (0 uses) | — | ✅ | **inert** — mapped to `{}` | `expo-blur` if ever wanted | `rn.ts:38` |
| `::after` / `::before` (14 / 1) | `.divider::after` (hit area), `.sw::after` (switch knob), `.radio.on::after`, `.steps::before` (step rail), `.progress::after` (indeterminate bar), `.img::after` | ✅ | **inert** — docs list `before:*`/`after:*` as having no RN equivalent | a real child `View` in the component | <https://docs.uniwind.dev/class-names> |
| `text-overflow: ellipsis` / `white-space: nowrap` (12 / 46) | `.ell`, `.money`, `.btn`, `.chip` | ✅ | **inert** as CSS | `numberOfLines={1}` + `ellipsizeMode` on `<Text>` | `rn.ts:245-247`; RN `Text` API |
| `gap` (211) | everywhere, `calc(var(--u)*N)` | ✅ | **works** — `row`/`column` objects map to `rowGap`/`columnGap` | nothing | `rn.ts:261-266` |
| CSS Grid (123 decls, 1 `auto-fill`, 13 `minmax`) | `.tiles{grid-template-columns:repeat(auto-fill,minmax(calc(var(--tile)*2.5),1fr))}`, `.keys` keypad `repeat(3,1fr)`, `.splitgrid`, reports `.tiles` | ✅ | **not yet** — docs mark `grid-*` "🚧 WIP … being added by the React Native / Expo team" | flex-wrap with a computed column count, or `numColumns` on the list; the keypad is a fixed 3×4 so flex rows are fine | <https://docs.uniwind.dev/class-names> |
| `outline` / `outline-offset` (15) | the whole focus story — `.frame :focus-visible`, `.ring` | ✅ | **inert** — RN has no outline | `borderWidth`/`borderColor`, or `boxShadow` as a ring; must not change layout | `rn.ts:245-247` |
| `box-shadow` (22) | `.qx`, `.pop`, focus halos | ✅ | **probably works** — RN 0.81+ supports `boxShadow`; passed through camelCased | — | `rn.ts:245-247`. **UNVERIFIED** at RN 0.86 + Uniwind 1.10.1 — not exercised on a device here |
| `env(safe-area-inset-*)` | **not modelled in the prototype at all** | ✅ | **works** — Uniwind ships `*-safe`, `*-safe-or-*`, `*-safe-offset-*` utilities | use those utilities | `uniwind/uniwind.css:9-80` |
| `data-[x=y]:` attribute variants | the prototype's three axes are `[data-theme]`/`[data-scale]`/`[data-w]` | ✅ | **works** — data attributes are validated against component props | but **do not** use them for the three axes; #284 settled those on `updateCSSVariables` | `processor.ts:187-196`; `store.ts:145` |

---

## Landmines for the spec

- **Every beat needs two implementations, and the reduced-motion opt-out needs two as well.** Web gets
  `web:animate-*`; native gets Reanimated; `@media (prefers-reduced-motion)` covers only the web one, and on native it
  does not merely fail to apply — it is *inert*, so any `reduce`-scoped rule would apply always. Budget the beats
  inventory as ~10 distinct animations, not 24 keyframe blocks (many are variants of rise/slide/fade).
- **Nothing in this stack will tell you a construct did not compile.** Unknown properties are passed through to the
  RN style object verbatim (`rn.ts:245-247`); unknown media features hit `default: break`; `:focus-visible` simply never
  matches. The failure mode for the whole web-only column is a silent visual difference, not a build error. The gallery
  (#282 "not yet specified") is the only instrument that would catch it — say so in the spec.
- **`--radius` is already dead and `--error` already duplicates `--destructive`.** Both survived five themes ×
  five copies each. Whatever the spec decides, it should delete on the way past, and a lint/test that fails when a
  declared token has zero consumers would stop the next one.
- **The two `--table-row-alt` reads are JS, not classes.** `useCSSVariable('--color-table-row-alt')` in
  `packages/components/src/table/index.tsx:73` and `table/pulse-row.tsx:57` will return `undefined` the moment the token
  is dropped, and zebra striping will vanish with no type error. A class-name grep does not find these — grep
  `useCSSVariable` before retiring any token.
- **The status set changes meaning, not just name.** Today `success`/`warning`/`error` are *per-theme* values; the
  drawing fixes them across all five so "unpaid" reads the same in every shop (#283). That is a deliberate break of the
  existing theme contract and should be stated as such, not slipped in as a rename.
- **`--rail` is a repaint, not a rename.** The app's `--sidebar` is a dark navy rail under a light theme; the
  prototype's is a light tinted rail. 76 call sites keep working and all of them change appearance.
- **`color-mix(in oklch, …)` does not mix in OkLCH on native.** It mixes in RGB. For the three tonal surfaces
  (`ok-bg`/`warn-bg`/`bad-bg` equivalents, `.btn.vd.tonal`, selected rows) that difference is visible at low mix
  percentages against dark themes. Precomputing those as their own tokens avoids the question entirely — and the
  prototype already does exactly that for the status backgrounds.
- **`clamp()` is not available.** If a type or spacing ramp wants a floor-and-ceiling, write `max(min(…))` or compute it
  in JS. Do not let a spec reach for `clamp()` because the prototype "feels like" it uses it — it does not (0 uses).
- **The prototype models no safe areas.** Every full-bleed surface in the drawing (the rail, the tender pane, the phone
  sheets) meets a notch or a home indicator on a real device. Uniwind's `*-safe` utilities are the answer; the drawing
  is silent, so the spec must not be.
- **`group-*` is a Pro feature.** 47 sites use it today and it has no runtime effect on native in the free version.
  Whether the rebuild leans on it harder is a licence question, not a styling one — raise it before the component map
  assumes it.
- **`package.json` still asks for 1.11.0 while the lockfile pins 1.10.1** (#284's landmine, re-confirmed here). Every
  claim in this file is measured at **1.10.1**. If the install ever moves to 1.11.0, re-check at minimum: animation
  support, `focus-visible`, and `<ScopedVariables>`.

## Marked UNVERIFIED

- Whether a **bare `hover:`** rule is dropped or leaks unconditionally on native at this pin (the outcome depends on the
  exact rule nesting Tailwind v4.3.3 emits). The repo's device-verified trap says it leaks; `web:hover:` is correct
  either way.
- **`box-shadow`** on RN 0.86 through Uniwind 1.10.1 — expected to work via RN's `boxShadow`, not exercised here.
- The **docs-vs-source conflict on `filter:`** functions (docs say `blur-*`/`grayscale`/`saturate-*` work with platform
  caveats; `functions.ts:89-106` at 1.10.1 returns `""` for all of them). Source is quoted above; which is right on a
  device is untested.
- No builds, installs or test suites were run for this file — everything is read from source, the pinned package, and
  the vendor docs.
