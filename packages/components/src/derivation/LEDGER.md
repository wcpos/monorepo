# Behaviour ledger: `derivation`

Created 2026-10-18 for the POS "Tax based on" panel (board: `~/Projects/wcpos-handoffs/tax-based-on-popover-2026-10-18.html`, the full rail in §2 and every state in §3; brief: `tax-derivation-brief.md`). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** How an answer was reached: the facts it was derived from, top to bottom on one vertical rail, ending in the answer, and where the chain broke when it did. The "Tax based on" panel (setting → address → the rates it matched) today; the Store-health "why is this red" and the terminal log are the same shape.

**Not its job:** progress through a task that is still moving (`step-progress`); a row the cashier presses (`list-row`); a table of records (`table`).

**Base:** React Native View and `Text`; `Icon` for the cross; `TABLE_HEAD_TEXT` from `table` for the label.

## Lines

1. A step is a bead on a rail, then its label, title, content and detail: beads 16 (`size-4`), the bead→content gap 12 (`gap-3`), step→step 16 (`pb-4` on every step but the last). The board drew 14 and 18; both were snapped to the Gutters scale (4, 8, 12, 16, 32 — "nothing in between", CODING_STANDARDS § Design › Gutters), which decides spacing system-wide rather than per surface — evidence: board §2 (`.step` gap 14, padding-bottom 18, `.bead` 16); brief "Beads 16 px"; the Gutters table; test "draws a muted disc…".
2. Four states and nothing else: `fact` a `bg-muted-foreground` disc, `result` a `bg-foreground` disc, `failed` the tone map's `bad` solid (`bg-bad`) disc with a 10 px cross (`xmark`, `text-card`), `quiet` hollow (`border-2 border-border`). The bead and its cross are `step-progress`'s compact scale (16, a 10 px mark), so a failure reads the same in both — evidence: board §1 ("the bead vocabulary is already ruled; the rail reuses it"), §3 failure frames; tests "draws a muted disc…" and "closes a failed step red…".
3. The rail is 2 px `bg-border` from one bead to the next; the last step has none, because it closes the chain. Below a failed or quiet step it drops to half strength, so the eye lands on the break — evidence: board §3 "the nodes after it go hollow and quiet"; Remote's invoice timeline (board §1); test "closes a failed step red…".
4. The label is the table-head recipe (`TABLE_HEAD_TEXT`), the `bad` text face on a failed step; the title is `text-base font-semibold` (muted and regular on a quiet step); the detail is one `text-sm text-muted-foreground` line after the content; `trailing` sits right of the title on its baseline — evidence: board §2 (`.head`, `.ttl`, `.sub`), Klarna's result-on-the-node-line (board §1); CODING_STANDARDS § Design 5 (a cause is one line and what to do); test "sets the label in the head recipe…".
5. Never colour alone: a failure is the red bead AND its cross AND a label that names it — evidence: CODING_STANDARDS § Design 5.
6. Nothing animates on mount or at all; it is read, not watched. A later beat (a class sum settling when the address changes while open) would animate transform/opacity only — evidence: CODING_STANDARDS § Design 6; board §4 "Nothing animates on mount".
7. The rail is a `list` and each step a `listitem`; it holds no press of its own, so a caller's interactive content (a link under the title) carries its own testID — evidence: CODING_STANDARDS § Design 10; test "draws a muted disc…".
8. Amends line 4: the detail line is `Text variant="key"` (the ladder's 13 muted rank), not its own `text-sm text-muted-foreground` literal; the look is unchanged — evidence: card 6 of the 2026-10-28 component-library review (W4-F).
