# Behaviour ledger: `field-box`

Seeded 2026-10-28 by card 2 of the component-library architecture review. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3.

**Job:** The closed face of every control: Input, Textarea, Select, Combobox, TreeCombobox and the price and quantity keypads' triggers.

**Base:** `class-variance-authority` merged through `cn`; `react-native` View; `text`'s `TextClassContext`. Interface: `fieldBox({ state, multiline })` (a class string, because a TextInput or a primitive's Pressable cannot be wrapped) and `FieldBox` (a View drawing the same box around a control's own content).

## Lines

1. One box: `h-ctl` (`min-h-ctl` when `multiline`), `bg-card`, `border-border`, `rounded-lg`, foreground `text-base`, muted placeholder. `state` is `rest`, `open` (the one ring: `border-ring`, web `ring-1`, for a focused field and an open picker alike), `disabled` (the one dim, `opacity-45` and the web not-allowed cursor) or `invalid` (`border-destructive`); a state's border replaces the resting one in the class string rather than racing it in the CSS — evidence: card 2 (seven copied strings, two focus rings: inputs ringed, pickers did not; the keypads drew an outline Button as a fourth box); test `index.test.ts`.
2. `FieldBox` gives the text inside the field's tone through `TextClassContext`, muted when `empty` (nothing chosen); its `className` is layout only (width, flex, padding) — evidence: card 2's "after" box; the Input's TextInput reads the same context (`input` line 7).
3. `attention` is a fifth state: `border-attention` and the `bg-attention/15` wash replace the resting border and card, for a number that needs a look (the cart's line over stock); a caller never writes the look through `className` — evidence: card 1 of the component-library review, 2026-10-28 (the cart quantity cell's override); test `index.test.ts`.
