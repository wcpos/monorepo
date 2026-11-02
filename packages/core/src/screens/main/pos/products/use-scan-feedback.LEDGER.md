# Behaviour ledger: `pos/products/use-scan-feedback.ts`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Own scan notifications and platform-specific audible/haptic feedback.

**Composes:** `@wcpos/components/toast`.

## Lines

1. Each scan owns one toast ID, updated through searching and terminal outcomes — avoids stacking separate notifications for one scan — evidence: `463acde555 2026-07-17 feat(core): scan-feedback module — one updating toast per scan + engine-outage banner`, spec #722 — platform: all.
2. Searching feedback expires after 30 seconds — missing-parent bailout paths must not leave an immortal toast — evidence: `2d23a21980 2026-07-18 fix(core): add missing scan_add_failed locale key; cap searching toast; copy polish` — platform: all.
3. Sounds are opt-in, distinguish success/failure and remain silent during searching — audible confirmation belongs to the outcome, not merely detection — evidence: `6cac33b648 2026-07-18 feat(barcode): opt-in scan sounds + settings toggle (phase 7)`, decisions #717/#722 — platform: all.
4. Sound settings are read when playback occurs, not when the scan begins — disabling sound silences an already-running lookup — evidence: `a3c917f132 2026-07-18 fix(barcode): honor sound toggle at play-time; resume audio context before scheduling` — platform: all.
5. Classic/checkout/soft themes share tone definitions across synthesized web audio and native WAVs; volume is clamped — keeps platform feedback aligned and offers quieter shop settings — evidence: `203500b211 2026-08-18 feat(core,database,scanner): scan-sound themes, quieter too-short warning, wizard links` — platform: all.
6. Failure vibration can run without the failure tone, but the master switch silences both — supports vibration-only counters without overriding the master preference — evidence: `aeb1d560f3 2026-08-18 fix(core,database): decouple failure vibration from the failure tone`, review on #1278; test name: `use-scan-feedback.test.tsx`, “failure sound off + vibration on fires the haptic alone” — platform: iOS/Android; web/Electron haptic export is inert.
7. Web tones schedule only after AudioContext resumes; native players rewind for repeated scans; audio failures do not break scanning — avoids clipped first tones and truncated repeats — evidence: `a3c917f132 2026-07-18 fix(barcode): honor sound toggle at play-time; resume audio context before scheduling`; `play-scan-sound.ts:50`, “Rewind so rapid consecutive scans each get a full sound.”; `play-scan-sound.web.ts:3`, “swallows errors: a missing/blocked AudioContext must never break a scan.” — platform: all.
