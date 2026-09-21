# Behaviour ledger: `notice`

Seeded 2026-09-18 by wcpos/roadmap#358 from the feedback-states page (wcpos/roadmap#308). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** The one band for Status and Outage.

**Base:** `react-native` View; `Text`, `Icon`, `VStack`, `HStack`, `Button` and `DocsLink`.

## Lines

1. Never dismissible from inside the band; a band that must go is unmounted by its owner — evidence: ADR 0032 §5 as the default; wcpos/roadmap#358.
2. `bad` is the only red surface in the app — evidence: wcpos/roadmap#308 §6; wcpos/roadmap#358.
3. Always text, never icon-only; colour is never the only signal — evidence: wcpos/roadmap#308 §7, guideline 6; wcpos/roadmap#358.
4. At most two actions and one docs link — evidence: component map §5; wcpos/roadmap#358.
5. The text column keeps a wrapping basis of twelve units so the actions wrap beneath it before the text narrows to a sliver — evidence: Codex review on wcpos/monorepo#2182 (a 300 px pane produced a 600 px-tall message column with `flex-1 min-w-0` alone); wcpos/roadmap#358.
6. The icon takes the foreground colour; the tone lives on the surface and its border, never on an icon that would fall under 3:1 against the tinted surface — evidence: `.claude/rules/design.mdc` §7 (icon contrast 3:1); the prototype's `.notice` colours no icon; Codex review on wcpos/monorepo#2182.
7. A `bad` notice is announced on iOS when it mounts, because iOS has no live region; Android and web use the live region — evidence: Codex review on wcpos/monorepo#2182.
8. Copy at the base size and action labels that wrap, as `empty-state` lines 5–6 — evidence: `.claude/rules/design.mdc` §3; Codex review on wcpos/monorepo#2182.
