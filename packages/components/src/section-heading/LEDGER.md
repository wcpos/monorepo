# Behaviour ledger: `section-heading`

Created 2026-10-27 for the heading ladder ruled 2026-10-25 (`~/Projects/wcpos-handoffs/2026-10-25-heading-label-disclosure-ladder.html`, "The ladder recommended"). Numbers are assigned once and never reused; every line keeps its evidence.

**Job:** The one heading for a section in a Settings page, a dialog body and a card body: a title and an optional description.

**Not its job:** the area title (`AreaPage`, `text-xl`), the dialog title (`DialogTitle`, `text-lg`), the rule between sections (`SettingsSection`), or a column or band label (uppercase stays there).

**Base:** React Native `View`, `Text`.

## Lines

1. The title is a level-2 heading (`role="heading"`, `aria-level={2}`) in `text-base font-semibold text-foreground`; the description under it is `text-xs text-muted-foreground`, `gap-0.5` between — evidence: the ladder board, "section heading"; test "renders a level-2 heading with the title and the description".
