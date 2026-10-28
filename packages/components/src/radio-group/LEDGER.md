# Behaviour ledger: `radio-group`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Radio-group primitives with a composable labelled option supporting descriptions and trailing content.

**Base:** `@rn-primitives/radio-group` and `react-native` (`View`); no split. Styling includes `native:` sizing and `web:` grid/focus variants.

## Lines

1. Makes option labels select their radio value while respecting group-level and option-level disabling — evidence: `8abbc80ee5 2026-05-02 Modernize radio group and ref primitives`, code: "const isDisabled = groupDisabled || disabled;" in `packages/components/src/radio-group/index.tsx:98`.
2. Associates optional descriptions with their radio controls for assistive technology — evidence: `fbcbd888e4 2026-05-02 fix: address remaining radio group review feedback`, code: "aria-describedby={descriptionID}" in `packages/components/src/radio-group/index.tsx:103`.
3. Avoids emitting another change when the already-selected option’s label is pressed — evidence: `6634a13f4c 2026-05-02 fix: cover radio option label edge cases`, code: "if (!isDisabled && value !== selectedValue) {" in `packages/components/src/radio-group/index.tsx:115`.
4. Allows omitted change handlers without throwing during label activation — evidence: `6634a13f4c 2026-05-02 fix: cover radio option label edge cases`, code: "onValueChange={onValueChange ?? noopOnValueChange}" in `packages/components/src/radio-group/index.tsx:41`.
5. The trailing `right` slot is part of the option's press target, without becoming a second accessible control — evidence: code: "accessible={false}" and "if (value !== selectedValue) onValueChange?.(value);" in `packages/components/src/radio-group/index.tsx`; test: "selects the option when its trailing slot is pressed, and not when already selected" in `packages/components/src/radio-group/radio-group.test.tsx` — platform: all. _(added 2026-10-21, wcpos/monorepo#2796)_
6. `RadioGroupItem`'s 20 pt circle gives the finger 44 × 44 on every platform with `MinTargetBand square` (`lib/min-target`, `pressable-surface` line 7); it was `hitSlop` 12, which React Native Web ignores — evidence: card 4 of the 2026-10-28 component-library review.
