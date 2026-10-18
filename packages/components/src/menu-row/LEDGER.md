# Behaviour ledger: `menu-row`

Created 2026-10-18 for the owner-approved follow-up to the 2026-10-16 component-consistency board (decision 11). Numbers are assigned once and never reused; every line keeps its evidence.

**Job:** One action or choice inside a sheet, popover or side-panel menu, with leading / label / description / trailing slots.

**Not its job:** a ruled data row (`list-row`), navigation (`nav-item`), a primary action (`button`) or a phone filter pill (`chip`). It does not own opening, closing or selection state.

**Base:** React Native Pressable/View, `usePointer`, TextClassContext and DropdownMenu's platform-specific radio role.

## Lines

1. One size: full width, `min-h-row`, `rounded-md`, `px-2.5 py-1.5`, `gap-2`, transparent at rest, no shadow or per-row rule — evidence: brief and DropdownMenuItem; test “renders a label…”. `className` is for layout only; there is no size, shape or colour prop.
2. A press or keyboard focus shows `bg-muted`; a fine-pointer hover does too. No hover on coarse pointers, where it sticks after a tap. Web outline-none matches DropdownMenuItem, which has no additional focus ring — evidence: DropdownMenuItem, ListRow/NavItem pointer gate; tests “renders a label…” and “keeps hover off coarse pointers…”.
3. Set `choice` on every row in a choice list; it reserves a `w-5` check slot, empty unless `selected`. This per-row prop avoids a group context. Web announces menuitemradio with aria-checked; native announces radio with accessibilityState.checked, reusing DropdownMenu's platform role table. Other rows are menuitem, without checks or checked state — evidence: brief; test “shows a check only…”.
4. `label` accepts text or a node; `MenuRow.Label` uses Text, one line, `min-w-0 flex-1`. The body takes remaining width; optional `description` supplies muted text; a node such as StatusBadge keeps its own semantic styling. Leading accepts icons or avatars; trailing accepts locks, shortcuts or chevrons — evidence: migrated user/register/report/hotkey rows; test “renders a node label…”.
5. Disabled rows are dimmed and cannot press. Destructive rows inherit red text/icons and use a destructive/10 press, hover and focus wash, never a solid red button — evidence: brief, user sheet's last Clear local data action; tests “presses when enabled…” and “paints destructive words…”. Explicit child colour overrides still belong to that child, as in DropdownMenuItem.
6. MenuRowSeparator uses DropdownMenuSeparator's sheet classes (`bg-border -mx-2 my-1 h-px`) for real group breaks, not every row — evidence: user sheet's sign-out/settings groups and destructive gallery story. The three gallery stories are registered with the app; screenshot baselines remain the orchestrator's CI task.
7. Enter and Space activate web rows, including choice rows; disabled rows activate with neither. RNW's PressResponder only accepts Space for button roles, so the row translates Space to its ordinary click path — evidence: review finding reproduced by test “activates choice=…”, two failures before the handler and green after it.

8. A native press retains the replaced Button's light impact haptic; disabled rows do not fire it — evidence: Button.handlePress; test “keeps the native light haptic…”, failed without the call. The existing selection-tick helper uses a different haptic, so it is not substituted.
