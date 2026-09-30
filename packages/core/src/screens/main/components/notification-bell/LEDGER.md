# Behaviour ledger: `components/notification-bell`

**Job:** Show notification summary and let the cashier read notifications.

## Lines

1. Notification consumers read session-owned state instead of bootstrapping Novu themselves — opening the panel must not reinitialize the client, socket, or initial fetch — evidence: `a1955c0204 2026-08-02 fix(notifications): hoist Novu bootstrap to a single session owner` (issue #911) — platform: all. — rehomed from `components/header` line 16 by R5 (#351)
2. The bell subscribes only to notification summary state — notification-body/list churn must not rerender a badge whose count is unchanged — evidence: `b29701caa7 2026-08-16 perf(ui): split two contexts so badge consumers stop subscribing to list churn (#1242)` — platform: all. — rehomed from `components/header` line 17 by R5 (#351)
3. Opening the bell marks notifications seen through the open-change handler; reading individual items remains separate — avoids effect-driven seen updates on unrelated renders — evidence: `b1b12f7b87 2026-01-19 refactor: replace useEffect with direct event handler in NotificationBell` — platform: all. — rehomed from `components/header` line 18 by R5 (#351)
4. Constrain the notification popover and give its virtualized list a shrinking flex container — long notification lists must scroll inside the popover rather than overflow — evidence: `237bc1b6f2 2026-01-21 fix: notification panel overflow and VirtualizedList parentProps bug` — platform: all. — rehomed from `components/header` line 19 by R5 (#351)
5. Keep the sm mark-all-read action touch-safe — smaller typography must not shrink its hit area — evidence: `b6f74171bd 2026-08-18 fix(ui): preserve compact action hit areas`; `notification-panel.test.tsx`: “keeps a touch-safe hit area on the sm mark-all-read action” — platform: all. — rehomed from `components/header` line 20 by R5 (#351)
6. Notifications live in the drawer, with an optional label for expanded navigation — removing the POS title bar must not remove notification access — evidence: `89813429d6 2026-09-11 feat(pos): the register bar — no title bar on the POS, server register pointer, user sheet, switch store (roadmap#268)` — platform: all. — rehomed from `components/header` line 21 by R5 (#351)
