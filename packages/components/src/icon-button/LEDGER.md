# Behaviour ledger: `icon-button`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** A pressable icon action with optional loading state and native haptic feedback.

**Base:** `react-native` Pressable, `expo-haptics`, `class-variance-authority`, and the local Icon. No platform-specific files; `packages/components/src/icon-button/index.tsx:66` branches on `"Platform.OS !== 'web' && !props.disabled && !disableHaptics"`.

## Lines

1. Always passes a boolean disabled state to avoid Android accessibility remaining disabled after re-enabling — evidence: `c99855da17 2026-08-27 fix(native-e2e): Open POS accessibility latch + the two remaining nightly defects (#1614) (#1616)`, PR/issues #1614 and #1616, code: "disabled={!!props.disabled}" in `packages/components/src/icon-button/index.tsx:85`.
2. Makes the child icon transparent to pointer events so the enclosing button receives presses — evidence: `95148d4d01 2025-12-03 stop Icons from blocking press events`, code: "pointerEvents=\"none\"" in `packages/components/src/icon-button/index.tsx:93`.
3. Applies the previously ignored `iconClassName` as an icon-specific override — evidence: `372bebd5ba 2026-08-20 feat(ui): one source of truth for totals, DocsLink component, per-hour request estimate`, code: "className={cn(className, iconClassName)}" in `packages/components/src/icon-button/index.tsx:92`.
4. Adds light haptics only on non-web platforms when neither disabled nor explicitly opted out — evidence: code: "if (Platform.OS !== 'web' && !props.disabled && !disableHaptics)" in `packages/components/src/icon-button/index.tsx:66`.
