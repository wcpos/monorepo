# Behaviour ledger: `components/ui-settings`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Edit column visibility, display options, and ordering with immediate persistence and reset controls.

**Composes:** `@wcpos/components/{collapsible,dialog,dnd,error-boundary,form,hstack,icon,icon-button,text,tooltip,vstack}`.

## Lines

1. Bind form values reactively to the settings document — reset must update rendered column structure, not leave a mount-time snapshot behind — evidence: `6bbb6a22b4 2026-08-22 refactor(ui-settings): one reactivity model, one column-only form` (issue #1483) — platform: all.
2. Reordering uses the field array’s `move`, feeding the ordinary autosave subscription — displayed order and persisted form order must stay together — evidence: “useFieldArray's `move()` handles the form state update.” / “The form's watch subscription (via useFormChangeHandler) will trigger the save.” (`components/ui-settings/columns-form.tsx:64–65`) — platform: all.
3. Only the grip initiates dragging — operating switches or display controls must not accidentally reorder columns — evidence: `8ad03137a3 2026-01-22 feat(dnd): add DragHandle component for explicit drag initiation` — platform: all.
4. Register the form’s reset callback upward after render — the reset control sits in a sibling footer, and its ref cannot be written during render — evidence: “The reset button lives in the dialog footer, outside this form's subtree” (`components/ui-settings/index.tsx:56`); explanation continues through line 59 — platform: all.
5. Settings use side-panel presentation with a scrolling body and separate footer — close/reset controls must remain reachable while settings scroll — evidence: `daf8fca838 2026-09-11 feat(ui): overlay batch 3 — Dialog gains side presentation; full-form dialogs open as right panels` — platform: all.
6. Respect the POS overlay side/host, including an explicit side override; outside POS, default right remains — settings can cover the opposite pane while products stay visible, without covering web navigation — evidence: `a49db27e0b 2026-09-11 feat(pos): overlays slide in from the products side, opposite the cart (#1985)`; `da8191c571 2026-09-11 feat(pos): overlay batch 6 — order meta owns status, cashier and note; products settings open over the cart (#1991)` — platform: all; host-container protection on web/Electron.
