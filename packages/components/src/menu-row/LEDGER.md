# Behaviour ledger: `menu-row`

Created 2026-10-18 for the owner-approved follow-up to the 2026-10-16 component-consistency board (decision 11). Numbers are assigned once and never reused; every line keeps its evidence.

**Job:** One action or choice inside a sheet, popover or side-panel menu, with leading / label / description / trailing slots.

**Not its job:** a ruled data row (`list-row`), navigation (`nav-item`), a primary action (`button`) or a phone filter pill (`chip`). It does not own opening, closing or selection state.

**Base:** React Native Pressable/View, `usePointer` and TextClassContext.

## Lines

1. One size: full width, `min-h-row`, `rounded-md`, `px-2.5 py-1.5`, `gap-2`, transparent at rest, no shadow or per-row rule — evidence: brief and DropdownMenuItem; test “renders a label…”. `className` is for layout only; there is no size, shape or colour prop.
2. A press or keyboard focus shows `bg-muted`; a fine-pointer hover does too. No hover on coarse pointers, where it sticks after a tap. Web outline-none matches DropdownMenuItem, which has no additional focus ring — evidence: DropdownMenuItem, ListRow/NavItem pointer gate; tests “renders a label…” and “keeps hover off coarse pointers…”.
3. Set `choice` on every row in a choice list; it reserves a `w-5` check slot, empty unless `selected`. This per-row prop avoids a group context. Choice rows announce radio on both platforms, with aria-checked / accessibilityState.checked, inside a labelled MenuRowGroup (radiogroup). Other rows announce button, without checks or checked state. There is no owning menu widget and rows are individual Tab stops, not arrow-key navigable — evidence: brief; test “shows a check only…”.
4. `label` accepts text or a node; `MenuRow.Label` uses Text, one line, `min-w-0 flex-1`. The body takes remaining width; string or numeric `description` is wrapped in muted Text (never raw under a native View); a node such as StatusBadge keeps its own semantic styling. Leading accepts icons or avatars; trailing accepts locks, shortcuts or chevrons — evidence: migrated user/register/report/hotkey rows; test “renders a node label…”.
5. Disabled rows are dimmed and cannot press. Destructive rows inherit red text/icons and use a destructive/10 press, hover and focus wash, never a solid red button — evidence: brief, user sheet's last Clear local data action; tests “presses when enabled…” and “paints destructive words…”. Explicit child colour overrides still belong to that child, as in DropdownMenuItem.
6. MenuRowSeparator uses DropdownMenuSeparator's sheet classes (`bg-border -mx-2 my-1 h-px`) for real group breaks, not every row — evidence: user sheet's sign-out/settings groups and destructive gallery story. The three gallery stories are registered with the app; screenshot baselines remain the orchestrator's CI task.
7. Plain web rows use the browser button / RNW press path for Enter and Space; disabled rows do not activate. No explicit onKeyDown overrides caller handlers (Escape forwarding is tested). Round 2 removed the menu-style Space handler as requested; the installed RNW does not activate radio rows on Space — evidence: “activates choice=true once with Space” fails with zero presses, pending a keyboard ruling.

8. A native press retains the replaced Button's light impact haptic; disabled rows do not fire it — evidence: Button.handlePress; test “keeps the native light haptic…”, failed without the call. The existing selection-tick helper uses a different haptic, so it is not substituted.
9. A `locked` row is dimmed exactly like a disabled one (the same `opacity-45`) but keeps its role, press, keyboard activation, haptic and hover/focus wash, because a press on a gated option must still answer (it shows the Pro hint). It adds no ARIA state: the row is actionable, and the lock is the icon the caller puts in `trailing` (line 4); MenuRow never draws it — evidence: the reports period rows on Free (tablet), which `className` dimming broke (line 1, Codex on #2775); test “a locked row is dimmed and still presses”.
