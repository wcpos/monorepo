# Behaviour ledger: `accordion`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** An expandable, compound section list with animated content and configurable chevron placement.

**Base:** `@rn-primitives/accordion`, `react-native`, and `react-native-reanimated`. No platform-specific files; `index.tsx` branches on `"Platform.OS !== 'web'"` for root composition and `"Platform.OS === 'web'"` for the trigger and content wrapper.

## Lines

1. Uses a native Pressable but a web View inside the primitive trigger — evidence: code: `"const Trigger = Platform.OS === 'web' ? View : Pressable;"` in `packages/components/src/accordion/index.tsx:43`.
2. Uses web accordion CSS animations versus native content fades — evidence: code: `"isExpanded ? 'web:animate-accordion-down' : 'web:animate-accordion-up'"` in `packages/components/src/accordion/index.tsx:101`, code: `"exiting={FadeOutUp.duration(200)}"` in `packages/components/src/accordion/index.tsx:118`.
3. Allows the chevron on either side for the redesigned sites list — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: `"chevronPosition?: 'left' | 'right';"` in `packages/components/src/accordion/index.tsx:52`.
4. Exposes outer-header styling for flex sizing — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: `"ClassName applied to the outer AccordionPrimitive.Header wrapper (useful for flex sizing)."` in `packages/components/src/accordion/index.tsx:53`.
5. Removes inherited hover underlining from trigger text — evidence: `f5e4f50bc7 2026-04-17 feat(auth): redesign connect screen and harden store/user sync`, code: `"<TextClassContext.Provider value=\"font-medium\">"` in `packages/components/src/accordion/index.tsx:73`.
