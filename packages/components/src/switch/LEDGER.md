# Behaviour ledger: `switch`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A boolean switch with optional label-driven toggling and separate web/native rendering.

**Base:** `@rn-primitives/switch`, `react-native-reanimated`, `uniwind`, and `class-variance-authority`. No platform-suffixed files; `packages/components/src/switch/index.tsx:175` selects "`Platform.select({ web: SwitchWeb, default: SwitchNative })`".

## Lines

1. Uses separate native track/thumb geometry and Reanimated thumb movement instead of the web CSS-transform implementation — evidence: `7abf0b3e20 2025-03-14 fix switch component for native`, code: "`transform: [{ translateX: withTiming(translateX.value, { duration: 200 }) }]`" in `packages/components/src/switch/index.tsx:150`.
2. Resolves native track colours from theme variables rather than hardcoded light/dark RGB values — evidence: `1eabc2c781 2026-05-02 fix(theming): reduce Uniwind theme transition cancellations on native`, code: "`'--color-input', '--color-primary'`" in `packages/components/src/switch/index.tsx:120`.
3. Keeps the native primitive’s background transparent so the animated outer track remains visible — evidence: `33cd3be328 2026-05-02 fix: address theme transition review feedback`, code: "`className={cn(nativeSwitchVariants({ size }), 'bg-transparent', className)}`" in `packages/components/src/switch/index.tsx:158`.
4. Makes `SwitchWithLabel` honour controlled updates while retaining internal state for uncontrolled usage — evidence: `33cd3be328 2026-05-02 fix: address theme transition review feedback`, code: "`const checked = isControlled ? props.checked! : internalChecked;`" in `packages/components/src/switch/index.tsx:192`.
