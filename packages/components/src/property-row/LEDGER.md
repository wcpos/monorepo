# Behaviour ledger: `property-row`

Created 2026-10-25 for the property-rows grammar Paul chose after five boards (`~/Projects/wcpos-handoffs/2026-10-25-property-rows-system.html`, `2026-10-25-property-rows-every-form.html`). Numbers are assigned once and never reused; every line keeps its evidence.

**Job:** Show a record as a list of facts, one row per fact (key · value · verb), with the absent facts offered as add buttons at the bottom.

**Not its job:** deciding which facts are asked for or present (`useFieldPresence` in core and the record's own field list), saving (the form's autosave), or a settings page's rows (`SettingsRow`, which keeps its own ledger until it becomes an alias).

**Base:** React Native `View`, `Text` / `TextClassContext`, `Button`.

## Lines

1. Rows have no dividers; they separate by rhythm alone, as settings rows do (settings LEDGER line 1) — evidence: the system board, "no divider between rows"; test "renders the key, the value and the trailing slot, with no divider".
2. The key is `md:w-32` (128) in muted `text-sm`; the value is `text-base` foreground, set through `TextClassContext` — evidence: the system board's "one new ladder role" table; same test.
3. On `md+` key, value and trailing share one 44 line (`min-h-ctl`); under `md` the key stacks above the value and the trailing slot stays on the key's line, out of flow (the SettingsRow rule, settings LEDGER line 4) — evidence: the system board's implementing rules, "Phone: the key stacks above the value under md".
4. An open compound's parts are rows with `indent`: the key moves in one gutter (`pl-4`) — evidence: the board's "Compound, open: its parts are rows, indented one gutter"; test "pads the key of a part…".
5. Add buttons are `Button variant="outline" size="sm" leftIcon="plus"` (36), wrapping with `gap-2`, never Chips: a Chip is a selectable state and these are actions (CODING_STANDARDS § Chips, badges and switches) — evidence: the system board, "Add row"; test "an add is a 36-tall outline Button…".
6. Verbs are `Button variant="link" size="sm"` (primary, 13 medium), never a chevron — evidence: the board's verb vocabulary; test "a verb is a small link Button in primary ink".
7. An empty asked-for value reads as a placeholder in muted ink (`PROPERTY_PLACEHOLDER_CLASS`), shared with `EditableField`'s placeholder so the two never disagree — evidence: the board's "Asked but empty: a placeholder verb, no box".
