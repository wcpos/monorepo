# Behaviour ledger: `components/online-status`

**Job:** Log connectivity transitions once, app-wide

## Lines

1. Connectivity indicators remain presentational; transition logging/toasts belong to one app-level owner — visited drawer screens remain mounted and previously emitted duplicate notifications — evidence: `a4506f98ca 2026-08-04 fix(header): dedupe online-status toasts to a single app-level mount` (issue #929) — platform: all. — rehomed from `components/header` line 6 by R5 (#351)
