# Behaviour ledger: `progress`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A progress bar accepting either a numeric value or a Reanimated shared value.

**Base:** `@rn-primitives/progress`, `react-native`, `react-native-reanimated` and `react-native-worklets`; no platform-suffixed files. Dispatch uses `"Platform.select({ web: WebIndicator, native: NativeIndicator, default: NullIndicator })"`.

## Lines

1. Subscribes the web indicator to shared-value changes so they trigger React rendering — evidence: `78ecded8e0 2026-03-02 fix: address review feedback from Codex and CodeRabbit`, code: "scheduleOnRN(setSvProgress, currentValue);" in `packages/components/src/progress/index.tsx:71`.
2. Ignores stale shared-value state after `sharedValue` is removed — evidence: `2f6759c81f 2026-03-02 fix: address review feedback from CodeRabbit`, code: "const effectiveSvProgress = sharedValue ? svProgress : undefined;" in `packages/components/src/progress/index.tsx:78`.
3. Applies custom indicator classes only to the indicator rather than duplicating them on its web wrapper — evidence: `2f6759c81f 2026-03-02 fix: address review feedback from CodeRabbit`, code: "<ProgressPrimitive.Indicator className={cn('bg-primary h-full w-full', className)} />" in `packages/components/src/progress/index.tsx:86`.
4. Keeps native animated styles directly on `Animated.View` to avoid Slot flattening Reanimated markers and causing an iOS error — evidence: `707a39a3ed 2026-03-02 fix: avoid passing animated style through Slot on native Progress indicator`, code: "<Animated.View style={indicator} className={cn('h-full')}>" in `packages/components/src/progress/index.tsx:104`.
