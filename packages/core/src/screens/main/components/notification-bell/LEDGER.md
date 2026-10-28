# Behaviour ledger: `components/notification-bell`

**Job:** Show notification summary and let the cashier read notifications.

## Lines

1. Notification consumers read session-owned state instead of bootstrapping Novu themselves — opening the panel must not reinitialize the client, socket, or initial fetch — evidence: `a1955c0204 2026-08-02 fix(notifications): hoist Novu bootstrap to a single session owner` (issue #911) — platform: all. — rehomed from `components/header` line 16 by R5 (#351)
2. The bell subscribes only to notification summary state — notification-body/list churn must not rerender a badge whose count is unchanged — evidence: `b29701caa7 2026-08-16 perf(ui): split two contexts so badge consumers stop subscribing to list churn (#1242)` — platform: all. — rehomed from `components/header` line 17 by R5 (#351)
3. Opening the bell marks notifications seen through the open-change handler; reading individual items remains separate — avoids effect-driven seen updates on unrelated renders — evidence: `b1b12f7b87 2026-01-19 refactor: replace useEffect with direct event handler in NotificationBell` — platform: all. — rehomed from `components/header` line 18 by R5 (#351)
4. Notifications open in a right-hand side panel (`DialogContent side="right" size="lg"`, the cashier sheet's shape); the rows are plain children of `DialogBody`, whose own ScrollView scrolls a long list — a virtualized list must not nest in a ScrollView, and a fetch is 50 rows — evidence: #3012 (2026-10-28) — platform: all.
5. Mark-all-read is the footer’s `record` slot, 44 tall; the footer owns the touch-safe hit-area invariant — evidence: #3012 (2026-10-28) — platform: all.
6. Notifications live in the drawer, with an optional label for expanded navigation — removing the POS title bar must not remove notification access — evidence: `89813429d6 2026-09-11 feat(pos): the register bar — no title bar on the POS, server register pointer, user sheet, switch store (roadmap#268)` — platform: all. — rehomed from `components/header` line 21 by R5 (#351)
7. The drawer's labelled bell is the shared `nav-item` row at its drawer size, its unread badge over the icon, so it reads and presses as one of the drawer's items; the icon-only bell in the page and register bars stays an `IconButton` — evidence: design-system decision 8 (2026-10-16); `packages/components/src/nav-item/LEDGER.md` — platform: all.
8. Rows are `ListRow`s with a kind tile, a `kind · when` meta line, one trailing unread dot and an outline action for the kinds that have one; Today/Earlier bands come from `createdAt`; `EmptyState`, `Skeleton` and `Notice` are the shared components — evidence: #3012 (2026-10-28); board `~/Projects/wcpos-handoffs/notifications-panel-2026-10-28.html`, direction A — platform: all.
