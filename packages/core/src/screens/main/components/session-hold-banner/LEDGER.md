# Behaviour ledger: `components/session-hold-banner`

Rehomed 2026-10-17 from `components/header/LEDGER.md` when the legacy drawer header was deleted (design-system decisions 6 and 7). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** Show a held (refused) session under every bar, with one owner for its state.

## Lines

1. The held-session banner (`SessionHoldBanner`) lives under every bar, never in a drawer header: `ManagementBar` renders it under the bar (after the phone search row), Reports under its `ManagementBar` too (both rooms and the no-access screen, since 2026-10-17), and the POS cart and the phone Products pane under their register bars; the state (toast, renewal, latch) has one owner, `SessionHoldProvider` in the drawer layout, so a renewal hides every mounted banner and not only the first — the drawer header was its only mount, so moving the last screens off it would have left a refused session with no banner and no once-per-hold toast — evidence: wcpos/monorepo#2430 ("in the header before the upgrade notice"), #2508; `management-bar/index.test.tsx` "shows a held session under the bar"; `session-hold-banner/index.test.tsx` "hides every mounted bar banner on a renewal"; Codex review on #2611 — platform: all. — rehomed from `components/header` line 25.
