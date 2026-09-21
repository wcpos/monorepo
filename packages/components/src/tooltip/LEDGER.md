# Behaviour ledger: `tooltip`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A contextual hint attached to a trigger, with optional press-to-show behaviour on native.

**Base:** `@rn-primitives/tooltip`, native `@rn-primitives/slot`, React Native `Pressable`/`View`, and `react-native-reanimated`. Split: `index.web.tsx` versus `index.tsx`; web-file branches include `"Platform.OS !== 'web'"`, `"Platform.select({ web: undefined, default: FadeIn })"` and `"Platform.select({ web: undefined, default: FadeOut })"`.

## Lines

1. Disables native tooltips by default while allowing explicit `showOnNative` opt-in — evidence: `d69dd185f0 2025-12-14 remove tooltips on native`, code: `"Set \`showOnNative\` to true to enable press-to-show tooltip behavior."` in `packages/components/src/tooltip/index.tsx:17`.
2. Preserves native trigger props through Slot when `asChild` is used — evidence: code: `"const Component = asChild ? Slot : hasPressableHandlers ? Pressable : View;"` in `packages/components/src/tooltip/index.tsx:51`.
3. Uses a plain native View for handlerless triggers so nested icons do not swallow parent taps — evidence: `789a98ffd2 2026-09-02 fix(components): a native TooltipTrigger without press handlers no longer swallows the tap`, code: `"\"+\" new-order tab) swallowed the tap at its centre and only the edge worked."` in `packages/components/src/tooltip/index.tsx:45`.
4. Requires callable press or hover handlers before choosing the native Pressable path — evidence: `84db1fb7c8 2026-09-02 fix(components): tooltip trigger picks Pressable only for callable press/hover handlers; typed test mocks`, PR #1789, code: `"([key, value]) => typeof value === 'function' && /^on((Long)?Press|Hover)/.test(key)"` in `packages/components/src/tooltip/index.tsx:49`.
5. Gives native portal wrappers full-screen bounds and pass-through hit testing to prevent Android accessibility pruning — evidence: `8278ba5598 2026-08-28 fix(components): popover-family portals were invisible to Android accessibility (#1623)`, PR #1623, related #1614, code: `"a11y prunes out-of-bounds children — see popover/index.tsx."` in `packages/components/src/tooltip/index.tsx:83`.
6. Forwards root `className` when native tooltips are enabled so uptime-strip flex sizing survives the wrapper — evidence: `748e2599ba 2026-07-31 fix(health): honest next-check countdown, native uptime tooltips`, PR #898, code: `"<TooltipPrimitive.Root className={className}>{children}</TooltipPrimitive.Root>"` in `packages/components/src/tooltip/index.tsx:28`.
