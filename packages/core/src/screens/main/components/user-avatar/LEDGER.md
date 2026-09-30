# Behaviour ledger: `components/user-avatar`

**Job:** Show the cashier avatar with initials while its image loads.

## Lines

1. Avatar loading suspends only the image and displays initials meanwhile — a slow avatar must not blank the menu — evidence: “its own component behind a Suspense boundary that falls back to initials.” (`components/header/user-avatar.tsx:12`) — platform: all. — rehomed from `components/header` line 7 by R5 (#351)
2. Subscribe to the rendered display name and reuse it for avatar initials — user renames previously never reached the header — evidence: `e544911176 2026-08-16 fix(ui): subscribe to the fields that are rendered, instead of reading them off the document (#1240)`; `user-menu.test.tsx`: “updates the header and the avatar initials when the name is changed” — platform: all. — rehomed from `components/header` line 8 by R5 (#351)
