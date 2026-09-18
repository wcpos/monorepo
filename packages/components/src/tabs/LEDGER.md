# Behaviour ledger: `tabs`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Tab navigation with ordinary, horizontally scrollable, and responsive-select lists.

**Base:** `@rn-primitives/tabs`, `react-native` (`ScrollView`, `View`), `expo-haptics`, `uniwind`, and local `OptionSelect`. No platform-suffixed files; branches are "`Platform.OS === 'web'`" at `packages/components/src/tabs/index.tsx:245` and "`Platform.OS !== 'web' && !props.disabled`" at line 289.

## Lines

1. Centres selected tabs using native ScrollView methods and `onLayout` measurements instead of Reanimated scrolling — evidence: `a545d6240a 2025-12-11 Fixes for scrolling tabs`, code: "`scrollRef.current.scrollTo({ x: finalScrollX, animated: true });`" in `packages/components/src/tabs/index.tsx:157`.
2. Delays selection-driven scrolling until initial measurements have had time to arrive — evidence: code: "Small delay to ensure measurements are ready on initial render" in `packages/components/src/tabs/index.tsx:164`.
3. Accounts for horizontal content padding when calculating the active tab’s centred position — evidence: `1cdf169c8b 2025-12-14 tweak scrollable tabs`, code: "`const adjustedX = x + LIST_PADDING;`" in `packages/components/src/tabs/index.tsx:148`.
4. Applies the scrollbar-hiding class only on web — evidence: `1cdf169c8b 2025-12-14 tweak scrollable tabs`, code: "`Platform.OS === 'web' && 'scrollbar-hide'`" in `packages/components/src/tabs/index.tsx:245`.
5. Re-centres the active tab after the container width changes — evidence: `c205737d65 2026-01-23 fix: improve cart tabs state sync and auto-scroll behavior`, code: "Re-scroll to active tab when container width changes (e.g., window resize)" in `packages/components/src/tabs/index.tsx:196`.
6. Re-centres after content-size changes so the newly active “+” tab does not remain off-screen after voiding an order — evidence: `30bd2e1f8b 2026-09-03 fix(e2e-native): tablets keep their rail, phones reach the + tab`, body references #1760, code: "cashier scrolled (run 33750030091, Android phone, flow 08)." in `packages/components/src/tabs/index.tsx:184`.
7. Gives overflow-navigation buttons stable test IDs for native automation — evidence: `30bd2e1f8b 2026-09-03 fix(e2e-native): tablets keep their rail, phones reach the + tab`, body references #1760, code: "`testID=\"scrollable-tabs-next\"`" in `packages/components/src/tabs/index.tsx:272`.
8. Provides light haptic feedback for enabled native tab presses — evidence: `10b74393f9 2025-12-03 add haptics to tabs for native`, code: "`if (Platform.OS !== 'web' && !props.disabled) {`" in `packages/components/src/tabs/index.tsx:289`.
9. Offers a small-screen select generated from tab values, labels, and disabled states when `asSelect` is enabled — evidence: `ef4cd8440c 2026-06-08 Add responsive select option for tabs`, code: "`<StyledView className=\"w-full sm:hidden\">`" in `packages/components/src/tabs/index.tsx:48`.
