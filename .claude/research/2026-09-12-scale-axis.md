# Scale axis (compact / regular / spacious) beside Uniwind's colour themes

Research for [wcpos/roadmap#284](https://github.com/wcpos/roadmap/issues/284) (part of #282). Date: 2026-09-12.

## Question

Uniwind themes are one flat list switched by a single name (`Uniwind.setTheme`), and the five colour
themes live as `@variant` blocks in `apps/main/global.css`. What are the viable mechanisms for an
**independent scale axis** — spacing unit, base font size, minimum tap target, radius — that the user
switches live in Settings, without authoring fifteen combined colour×scale theme blocks?

Mechanisms surveyed: (a) root font-size plus a spacing variable on web; (b) a CSS-variable set per
scale resolved by Uniwind at runtime on native; (c) a React context the primitives read, with
class-name maps per step; (d) combined variants as the fallback.

### Version note — read this before trusting any line number

`apps/main/package.json:110` and `packages/components/package.json:151` both declare `uniwind@1.11.0`,
but `pnpm-lock.yaml:9821` resolves **1.10.1**, and 1.10.1 is what is on disk in
`/Users/kilbot/Projects/monorepo-v2/node_modules/uniwind`. All `node_modules/uniwind/src/...`
citations below are **1.10.1**. Where 1.11.0 differs (it adds `<ScopedVariables>`, PR
[uni-stack/uniwind#611](https://github.com/uni-stack/uniwind/pull/611)) the citation is to the tagged
GitHub source at `v1.11.0` and is marked as such. Uniwind is already at 1.12.0 upstream.

Uniwind ships its TypeScript source and the package's `react-native` export condition points at it
(`node_modules/uniwind/package.json`, `"exports": { ".": { "react-native": "./src/index.ts" } }`), so
`src/` is literally what runs on native. The Metro-side bundler runs `dist/`, and
`dist/metro/transformer.cjs:1391-1393,1438` matches `src/bundler/css-processor/units.ts:23-26` and
`processor.ts:31` line for line, so `src/` is a faithful reading of the build path too.

---

## Summary — the recommendation in five lines

1. **Use mechanism (b): a per-scale set of CSS variable values, applied through Uniwind's runtime
   variable API.** It is the only mechanism that reaches both platforms through one code path.
2. The evidence that it works: Tailwind v4 compiles `p-4` to `padding: calc(var(--spacing) * 4)`, and
   Uniwind compiles that `var()` into a **runtime lookup** on native —
   `function(vars) { return vars["--spacing"]?.(vars) * 4 }` — not a baked number.
3. It is live without remount: a variable write notifies `StyleDependency.Variables`, which evicts the
   style cache and re-runs `useReducer` in every subscribed component.
4. **Cost in the primitives is zero.** All 59 primitives already size themselves with `h-10 px-4`,
   `size-4.5`, `text-sm`, `rounded-md` — every one of those is a `var()` read at runtime.
5. Mechanism (a) is web-only (native `rem` is multiplied out at **build** time), (c) costs an edit in
   every primitive for a strictly worse result, and (d) is 15 theme blocks each of which must repeat
   every variable the others declare, enforced by the compiler.

---

## Findings per mechanism

### The shared fact everything below turns on: what survives to runtime

Compiled a minimal Tailwind v4 build against the repo's own `tailwindcss@4.3.3`
(`@tailwindcss/node`, `compile().build([...])`, run from a scratchpad, nothing written to the
monorepo). Output:

```css
:root { --spacing: 0.25rem; --text-base: 1rem; --radius-lg: 0.5rem; }
.h-10      { height: calc(var(--spacing) * 10); }
.min-h-11  { min-height: calc(var(--spacing) * 11); }
.gap-2     { gap: calc(var(--spacing) * 2); }
.p-4       { padding: calc(var(--spacing) * 4); }
.px-3      { padding-inline: calc(var(--spacing) * 3); }
.rounded-lg{ border-radius: var(--radius-lg); }
.text-xs   { font-size: var(--text-xs); line-height: var(--tw-leading, var(--text-xs--line-height)); }
```

So **the utilities keep the `var()` reference**; only the *definition* (`--spacing: 0.25rem`) carries
a rem. That split is exactly what makes (b) work and (a) fail on native.

Uniwind then compiles that CSS for native as follows:

| CSS input | Compiled to | File |
|---|---|---|
| `var(--x)` | `vars["--x"]?.(vars)` — runtime lookup | `src/bundler/css-processor/var.ts:8` |
| `calc(...)` | the arguments processed, then string-eval'd only if unit-suffixed; otherwise left as a JS expression | `src/bundler/css-processor/functions.ts:38-45`, `158-195` |
| `4px` | `4` — baked | `src/bundler/css-processor/units.ts:17-18` |
| `0.25rem` | `0.25 * 16 = 4` — **baked at build time** | `src/bundler/css-processor/units.ts:23-24` |
| `1em` | `vars["--uniwind-em"]?.(vars) * 1` — runtime | `src/bundler/css-processor/units.ts:25-26` |

and the rem base itself is a **build constant**:

```ts
// node_modules/uniwind/src/bundler/css-processor/processor.ts:31
this.vars['--uniwind-em'] = this.bundlerConfig.polyfills?.rem ?? 16
```

Declarations found under `:root` land in `Processor.vars` (`processor.ts:77-79, 221-229`); the ones
inside a theme `@variant` land in `scopedVars['__uniwind-theme-<name>']` (`processor.ts:81-84`, theme
detected from the `:where(.light, .light *)` selector at `processor.ts:163`). At boot the store builds
one vars object per theme, prototype-chained off the globals:

```ts
// node_modules/uniwind/src/core/native/store.ts:78-88
this.vars = Object.fromEntries(themes.map(theme => {
    const clonedVars = Object.create(vars) as Vars       // globals on the prototype
    const themeVars = scopedVars[`${UNIWIND_THEME_VARIABLES}${theme}`]
    if (themeVars) Object.assign(clonedVars, themeVars)  // theme vars as own props
    return [theme, clonedVars]
}))
```

Net: on native, `p-4` is `vars["--spacing"] * 4` evaluated on every style resolution, and
`--spacing` is an ordinary entry in a per-theme vars object that anything can shadow.

---

### (a) Root font-size + a spacing variable on the web

**What it can vary:** everything, *on web only*. `apps/main/global.css` already uses this lever —
`:root { font-size: 87.5% }` under `@layer base`, with `@media ios`/`@media android` overriding it back
to `100%`. Because `--spacing: 0.25rem` is itself rem-based, that 87.5% already scales **spacing as
well as type** on web: today `p-4` is 14px on web and 16dp on native. The scale axis would just be
three root font-sizes.

**Live-switchable:** on web, yes and for free. Uniwind's web path hands the class list straight to the
DOM — `toRNWClassName` returns `{ $$css: true, tailwind: className }`
(`src/components/web/rnw.ts:26-29`), consumed by React Native Web — so the browser's own cascade
resolves `rem` and `var()`. Setting `document.documentElement.style.fontSize` repaints with no React
work at all. The theme itself is already a class on `<html>` (`src/components/web/rnw.ts:15-17`), so a
second class for the scale step would compose cleanly.

**Live-switchable on native: no, and not at any price.** `units.ts:23-24` multiplies every `rem` by
`--uniwind-em` *during the Metro build*, so `--spacing: 0.25rem` is already the number `4` before the
app starts. The only knob is `polyfills.rem` in `metro.config.js` (`processor.ts:31`,
`src/bundler/types.ts:8`), which is a build-time config — and `apps/main/metro.config.js` does not set
it. The `:root { font-size: 100% }` blocks in `global.css` are, on native, parsed as a `font-size`
declaration on a rule with no class selector; they do not feed `--uniwind-em`.

NativeWind reaches the same conclusion independently: it inlines rem at build time (`inlineRem`,
default 14dp) and its docs say that for runtime scaling *"we recommend using a CSS variable"*.

**Cost in the primitives:** zero.
**Risk:** it silently solves only half the problem. Web looks right, native does not move, and the
divergence is invisible until someone runs the tablet build. Rejected as *the* mechanism; keep it in
mind only as a web-side implementation detail if a future step wants web type to scale by root size
rather than by token.

---

### (b) A CSS-variable set per scale, resolved by Uniwind at runtime — **recommended**

**What it can vary:** every token the utilities read through `var()`. That is `--spacing` (all
padding, margin, gap, width/height, `size-*`), `--text-*` and their `--text-*--line-height` partners,
`--radius-*`, and any named token added to `@theme`. Confirmed by compiling the repo's own Tailwind:
a token declared as `--spacing-tap: 2.75rem` in `@theme` generates `min-h-tap → min-height:
var(--spacing-tap)`, and the arbitrary-property form `min-h-(--tap-min)` generates `min-height:
var(--tap-min)` — both runtime `var()` reads, so an explicit tap-target token works on both platforms.

**The API.** `Uniwind.updateCSSVariables(theme, variables)` — documented at
<https://docs.uniwind.dev/theming/update-css-variables>, "Uniwind 1.1.0+", whose own example is
literally `Uniwind.updateCSSVariables('dark', { '--color-primary': '#4ecdc4', '--spacing': 16 })`.
Implementation on the installed version:

```ts
// node_modules/uniwind/src/core/config/config.native.ts:15-44
updateCSSVariables(theme: ThemeName, variables: CSSVariables) {
    Object.entries(variables).forEach(([varName, varValue]) => {
        ...
        UniwindStore.vars[theme] ??= {}
        UniwindStore.vars[theme][varName] = getValue
    })
    UniwindListener.notify([StyleDependency.Variables])
}
```

Because `UniwindStore.vars[theme]` is prototype-chained off the global vars (`store.ts:78-88`), this
sets an **own property that shadows the build-time global** — so a token that lives in `:root` and was
never mentioned in a theme block, like `--spacing`, is overridable per theme.

On web, 1.10.1 creates a `<style id="uniwind-dynamic-styles">` containing one empty rule per theme
(`.light{}`, `.dark{}`, …) and writes the property into the rule for the named theme
(`src/core/config/config.ts:32-63`, `80-107`). The rule is unlayered, so it beats the `@layer theme`
declarations Tailwind emits, and custom properties inherit from `<html class="light">` down. *(The
docs describe the web path as `document.documentElement.style.setProperty()` — that does not match
1.10.1's source. Either the docs describe a later version or they simplify; the observable behaviour
is the same. Marked **unverified** which is current.)*

**Live-switchable without remount: yes, and narrowly.** The chain is:

1. Every compiled style whose value expression mentions `vars[...]` is tagged with
   `StyleDependency.Variables` at build time —
   `if (usedVars.length > 0) dependencies.push(StyleDependency.Variables)`
   (`src/bundler/css-processor/addMetaToStylesTemplate.ts:96-101`).
2. Resolved styles are cached per theme, and the cache entry registers a one-shot listener on exactly
   those dependencies: `UniwindListener.subscribe(() => cache.delete(cacheKey), result.dependencies,
   { once: true })` (`src/core/native/store.ts:49-56`).
3. The component subscribes to the same dependency list and re-runs its reducer —
   `UniwindListener.subscribe(recreate, uniwindState.dependencies)`
   (`src/hooks/useResolveClassNames.native.ts:20-26`). `useReducer`, not a key change: **re-render, no
   remount, no state loss**.
4. `useCSSVariable` subscribes to `[Theme, Variables]` too (`src/hooks/useCSSVariable/useCSSVariable.ts:83-91`),
   so the handful of components reading tokens in JS (chart colours, the icon and loader sizes, the
   drawer background) follow along.

Only components whose classes actually use the changed variables re-render; the docs put it as "only
components using the affected variables re-render".

**1.11.0 adds a declarative form.** `<ScopedVariables variables={{...}}>` (PR #611, shipped in
v1.11.0 — which is what `package.json` asks for and the lockfile has not yet delivered). On native it
is a context provider whose vars are prototype-chained over the theme's
(`src/core/native/store.ts:106-111` @ v1.11.0) with the variable set folded into the style cache key
(`store.ts:34-36` @ v1.11.0); on web it additionally renders `<div style={{ display: 'contents',
'--spacing': …}}>` so the DOM cascade resolves descendants
(`src/components/ScopedVariables/ScopedVariables.tsx` @ v1.11.0). `display: contents` generates no
layout box, so wrapping the app root is layout-neutral.

Prefer `ScopedVariables` at the app root once 1.11.0 is actually installed: it is declarative, it is
one component instead of a loop over six themes, and it gives the component gallery (#282) a free way
to render all three steps side by side in one tree. `updateCSSVariables` is the equivalent that works
on the lockfile's 1.10.1 today, and remains the right tool if the scale must also apply to anything
rendered outside the React root.

**Numbers, not rem strings.** Both paths normalise a value as: number → pass through; string → try to
parse as a colour → otherwise return the raw string (`config.native.ts:23-36`;
`native-utils.ts:createVarGetter` @ v1.11.0). A string `'0.25rem'` is therefore stored verbatim and
`p-4` evaluates `"0.25rem" * 4 = NaN` on native. **The scale table must hold plain numbers (px/dp).**
On web, numbers become px (`config.ts:50-53`). A consequence worth designing around: overriding
`--spacing` with a number takes it out of the 87.5 % rem world, so the table needs a web column and a
native column (today's implicit values are web 3.5 / native 4) rather than one shared number.

**Cost in the primitives: zero.** Spot-checked against the real components:
`packages/components/src/button/index.tsx:104-111` sizes buttons with `h-10 px-4 py-2`, `h-9 px-3`,
`h-11 px-8`; `packages/components/src/icon/index.tsx:55-63` sizes icons with `size-4.5`, `size-3.5`,
`size-6`; button text uses `text-xs`/`text-sm`/`text-lg` (`:180-187`); the base class ends in
`rounded-md`. Every one of those resolves through `--spacing`, `--text-*` or `--radius-*`. Nothing in
any primitive has to learn about scale.

**Shape of the change:** a `scale.ts` holding the three steps as constants, a settings toggle that
writes the chosen step to the existing local settings document, and one effect that applies the token
set at boot and on change. `packages/core/src/screens/main/settings/theme.tsx` is the model for the
Settings surface and for the isolate-the-hook pattern it already uses to avoid re-rendering the modal
during a theme change.

**Risk:**
- *Escapes the net:* arbitrary values written by hand (`h-[44px]`, `text-[13px]`, `p-[7px]`) bake at
  build time and will not move. A lint rule or a grep gate at rebuild time is cheap insurance.
- *Boot flash:* the override must be applied before first paint or the app renders one frame at the
  default step. Apply it synchronously at module scope, not in a screen-level effect.
- *Dev-only loss:* `Uniwind.__reinit(...)` is injected into the compiled `global.css` module
  (`src/bundler/adapters/metro/transformer.ts:78`) and rebuilds `UniwindStore.vars` from scratch
  (`store.ts:61-93`), discarding `updateCSSVariables` overrides. That fires on app boot and on a hot
  reload of `global.css` — so overrides survive normal use but vanish on a CSS hot reload in dev
  unless re-applied. `ScopedVariables` (1.11.0) is immune, since its values live in React state.
- *Per-theme bookkeeping:* `updateCSSVariables` is scoped to one theme and persists per theme, so the
  scale must be written to all six theme names, and re-written for a theme registered later.
  `ScopedVariables` has no such issue.
- *Tap targets:* a pure `--spacing` multiplier drags `h-10` (40dp today) down with it. Compact must not
  put an interactive control under 44pt / 48dp. Give the minimum tap target its own token
  (`--spacing-tap`, used as `min-h-tap`) whose compact value is floored rather than scaled.
- *Stale web snapshots:* `withUniwind`'s style-property mapping snapshots computed values through a
  hidden probe element (`src/core/web/getWebStyles.ts:20-54`) and re-subscribes only to media-query
  changes, not to `Variables` (`src/hoc/withUniwind.tsx:78-82`). Blast radius in this repo is two
  files — `packages/components/src/tabs/index.tsx` and `packages/components/src/image/index.tsx` —
  both on web only. Worth a glance during the rebuild, not a blocker. (v1.12.0 moves `withUniwind` to
  `useSyncExternalStore`, PR #657, which may fix this — **unverified**.)

---

### (c) A React context the primitives read, with class-name maps per step

**What it can vary:** whatever each primitive is taught to vary — sizes, paddings, text steps, radius —
by selecting a different static class string per step (`const PAD = { compact: 'p-2', regular: 'p-3',
spacious: 'p-4' }`). The maps must be literal for Tailwind's scanner, which is fine; `global.css`
already scans `packages/components/src/**` and `packages/core/src/**` via `@source`.

**Live-switchable:** yes. A context value change re-renders the subtree without remounting.

**Cost in the primitives: high and permanent.** It is an edit in every primitive that has a size —
realistically most of the 59 in `packages/components/src` — plus the same treatment for every screen
that writes spacing classes directly, which is most of `packages/core/src/screens`. And it is
open-ended: every *new* component must remember to read the context, with no compiler telling anyone
when it did not. The `cva` size variants in `button/index.tsx` would have to multiply out (`size` ×
`scale`) or nest a second lookup.

**Risk:** the failure mode is a component that silently ignores the setting, which is precisely the
class of bug that is invisible in review and expensive in the field. It also re-renders the whole
subtree on change rather than only variable-dependent styles. There is one thing it can do that (b)
cannot — non-linear steps, e.g. "compact drops the icon a whole size but keeps padding" — but that is
better expressed as extra tokens under (b) than as bespoke logic in 59 files.

**Verdict:** rejected as the mechanism. Worth keeping as a narrow escape hatch for the two or three
components where the scale step genuinely changes the *layout* rather than the *measurements* (a table
that drops a column at compact, say) — those need a `useScale()` hook regardless of which mechanism
wins, and it should read the same source of truth as (b).

---

### (d) Combined colour×scale variants — the fallback

**What it can vary:** everything, by brute force: `light-compact`, `light-regular`, … fifteen
`@variant` blocks.

**Live-switchable:** yes — it is just `Uniwind.setTheme('ocean-spacious')`.

**Cost:** the compiler will not let the blocks be partial. Uniwind cross-checks every theme against
every other and errors on any variable one theme declares that another does not:

```ts
// node_modules/uniwind/src/bundler/artifacts/css/themes.ts:106-119
Object.values(themesVariables).forEach(variables => {
    Object.entries(themesVariables).forEach(([checkedTheme, checkedVariables]) => {
        variables.forEach(variable => {
            if (!checkedVariables.has(variable)) {
                Logger.error(`Theme ${checkedTheme} is missing variable ${variable}`)
                hasErrors = true
```

So each of the fifteen blocks must repeat all ~45 colour variables *and* the scale variables — today's
five blocks are already ~950 lines of `global.css`. Fifteen is roughly 2,800, and every palette tweak
becomes a three-way edit. Runtime cost too: `store.ts:78-88` allocates a vars object and a style cache
`Map` per theme, so the count triples.

**Risk:** the axes stop being independent. The user's colour choice and scale choice collapse into one
enum, every new colour theme costs three blocks, and `Uniwind.setTheme`'s single-name API means the
Settings screen has to synthesise and parse composite names. It also does not get the two axes into
the token sheet #282 asks for — it gets fifteen copies of one axis.

**Verdict:** the fallback, and only if (b) turns out to be blocked. Nothing found here suggests it is.

---

## Risks (cross-cutting)

1. **The lockfile is behind `package.json`.** `uniwind@1.11.0` is declared, `1.10.1` is installed. The
   recommendation works on both, but `<ScopedVariables>` — the nicer form — only exists on 1.11.0+.
   Settle the install before the mechanism ticket is specced, and re-check the two version-sensitive
   claims flagged above.
2. **Arbitrary values are the leak.** Anything written as `h-[44px]` bakes at build. The rebuild is the
   moment to sweep them; afterwards a lint rule keeps the axis honest.
3. **Accessibility floor.** Compact must not take a control under 44pt/48dp, and the OS font-scale
   setting stacks on top of whatever the scale axis does (`rt.fontScale` is available as a CSS function
   — `src/bundler/css-processor/functions.ts:124-130` — and is a separate `StyleDependency`). Decide
   whether the scale axis multiplies the OS setting or replaces it before the tokens are fixed.
4. **The web/native base asymmetry is real and pre-existing.** Web `1rem = 14px`, native `1rem = 16dp`,
   and because `--spacing` is rem-based the asymmetry already applies to spacing, not just type
   (`p-4` = 14px web / 16dp native today). Overriding tokens with numbers makes that explicit rather
   than creating it — but the scale table needs a per-platform column, and the "regular" step must
   reproduce today's values exactly or every screen shifts on the day the axis lands.
5. **One source of truth.** Whatever mechanism ships, the chosen step must be readable from JS (for the
   few components that branch on layout) and from CSS (for everything else). Under (b) that is one
   constant table plus one `useScale()` hook over the same value; do not let a second copy grow in the
   settings document.

---

## Sources

**Uniwind source (installed 1.10.1, `/Users/kilbot/Projects/monorepo-v2/node_modules/uniwind`)**
- `src/bundler/css-processor/units.ts:17-26` — px baked, rem multiplied at build by `--uniwind-em`, em kept as a runtime lookup
- `src/bundler/css-processor/processor.ts:31` — `--uniwind-em` = `polyfills.rem ?? 16`, a build constant
- `src/bundler/css-processor/processor.ts:62-124, 126-270` — `:root` declarations → global vars; `@variant <theme>` → `scopedVars['__uniwind-theme-*']`
- `src/bundler/css-processor/var.ts:7-17` — `var(--x)` → `vars["--x"]?.(vars)`
- `src/bundler/css-processor/functions.ts:38-45, 158-195` — `calc()` → JS expression, eval'd only when unit-suffixed
- `src/bundler/css-processor/addMetaToStylesTemplate.ts:96-101` — any style using a var gets `StyleDependency.Variables`
- `src/bundler/artifacts/css/themes.ts:102-119, 129-153` — every theme must declare the same variables; themes compile to `@custom-variant` class selectors
- `src/bundler/adapters/metro/transformer.ts:58, 78` — `Uniwind.__reinit(...)` injected into the compiled CSS module
- `src/core/config/config.common.ts:57-100, 103-105` — `setTheme` is one flat name list; `updateCSSVariables` base no-op
- `src/core/config/config.native.ts:15-44` — native `updateCSSVariables` writes the store and notifies `Variables`
- `src/core/config/config.ts:32-63, 80-107` — web `updateCSSVariables` writes a generated unlayered `.theme{}` rule
- `src/core/native/store.ts:20-59, 61-93, 95-130` — per-theme style cache, prototype-chained per-theme vars, dependency-driven eviction
- `src/core/listener.ts:20-56` — the dependency bus
- `src/hooks/useResolveClassNames.native.ts:6-29` — `useReducer` re-render on dependency notify (no remount)
- `src/hooks/useCSSVariable/useCSSVariable.ts:60-93` — hook subscribes to `[Theme, Variables]`
- `src/hoc/withUniwind.tsx:78-82` + `src/core/web/getWebStyles.ts:20-54` — web JS snapshots subscribe only to media queries
- `src/components/web/rnw.ts:15-29` — theme is a class on `<html>`; classes pass through to the DOM
- `dist/metro/transformer.cjs:1174, 1391-1393, 1438` — shipped bundler matches `src/`
- `package.json` (`exports["."].react-native = "./src/index.ts"`) — native runs the shipped source

**Uniwind source (v1.11.0, tagged on GitHub — not installed)**
- [`ScopedVariables.native.tsx`](https://github.com/uni-stack/uniwind/blob/v1.11.0/packages/uniwind/src/components/ScopedVariables/ScopedVariables.native.tsx), [`ScopedVariables.tsx`](https://github.com/uni-stack/uniwind/blob/v1.11.0/packages/uniwind/src/components/ScopedVariables/ScopedVariables.tsx), [`utils.ts`](https://github.com/uni-stack/uniwind/blob/v1.11.0/packages/uniwind/src/components/ScopedVariables/utils.ts), [`core/native/native-utils.ts`](https://github.com/uni-stack/uniwind/blob/v1.11.0/packages/uniwind/src/core/native/native-utils.ts), [`core/native/store.ts`](https://github.com/uni-stack/uniwind/blob/v1.11.0/packages/uniwind/src/core/native/store.ts)
- [PR #611 "feat: scoped variables"](https://github.com/uni-stack/uniwind/pull/611), [v1.11.0 release notes](https://github.com/uni-stack/uniwind/releases/tag/v1.11.0), [v1.12.0 release notes](https://github.com/uni-stack/uniwind/releases/tag/v1.12.0)

**Uniwind docs**
- [`Uniwind.updateCSSVariables`](https://docs.uniwind.dev/theming/update-css-variables) — signature, per-theme persistence, live update without remount, `'--spacing': 16` example
- [Scoped Variables](https://docs.uniwind.dev/api/scoped-variables) — subtree override, nearest-wins merge, numbers → px on web
- [`useCSSVariable`](https://docs.uniwind.dev/api/use-css-variable) — reactive to theme/variable change; variables must be used in a className or declared in `@theme static`
- [Scoped Themes](https://docs.uniwind.dev/api/scoped-themes), [metro.config.js](https://docs.uniwind.dev/api/metro-config), [Theming basics](https://docs.uniwind.dev/theming/basics)

**Tailwind v4**
- [Theme variables](https://tailwindcss.com/docs/theme) — `--spacing: 0.25rem` default, `--spacing-*` namespace drives `px-4`, `max-h-16` and the rest; setting `--spacing` alone rescales the system
- Local compile probe against the repo's `tailwindcss@4.3.3` via `@tailwindcss/node` — outputs quoted above (`calc(var(--spacing) * N)`, `var(--text-xs)`, `var(--radius-lg)`, `min-h-tap → var(--spacing-tap)`, `min-h-(--tap-min) → var(--tap-min)`)

**NativeWind (comparison)**
- [`withNativeWind` / `inlineRem`](https://www.nativewind.dev/docs/api/with-nativewind) — rem inlined to dp at build (default 14), `inlineRem: false` to disable; docs recommend a CSS variable for runtime scaling
- [`react-native-css`](https://github.com/nativewind/react-native-css) — same `inlineRem` model in v5
- [nativewind#1655](https://github.com/nativewind/nativewind/issues/1655), [react-native-css#316](https://github.com/nativewind/react-native-css/issues/316) — `inlineRem` regressions, cited only as evidence that the build-time rem model is the norm

**Repo**
- `apps/main/global.css` — five `@variant` theme blocks in `@layer theme`; `@theme` text tokens; `:root { font-size: 87.5% }` with `@media ios/android` at 100%
- `apps/main/metro.config.js:…` — `withUniwindConfig(config, { cssEntryFile: './global.css', extraThemes: ['ocean', 'sunset', 'monochrome'] })`; no `polyfills.rem`
- `packages/core/src/screens/main/settings/theme.tsx` — the existing theme switcher (`Uniwind.setTheme`, `useUniwind`), and the model for isolating the hook so a switch does not re-render the modal
- `packages/components/src/button/index.tsx:104-111, 180-187` and `packages/components/src/icon/index.tsx:55-63` — primitives size themselves entirely in `--spacing`/`--text-*`/`--radius-*` utilities
- `apps/main/package.json:110`, `packages/components/package.json:151`, `pnpm-lock.yaml:9821` — the 1.11.0-vs-1.10.1 discrepancy
