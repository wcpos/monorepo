# Behaviour ledger: `pos/products/use-hid-scan.web.ts`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Feed direct HID-POS scanner reports into the shared scan pipeline.

**Composes:** None directly.

## Lines

1. Direct connections use HID-POS usage page `0x8c`, with a capability-gated web implementation and inert native stub — keyboard-wedge devices are not interchangeable with structured HID-POS reports — evidence: `5a94836d04 2026-07-18 feat(core): Web Serial + WebHID barcode sources, device scan bus` — platform: Chromium/Electron; stub: iOS/Android.
2. Decode `event.data` without prepending `reportId` — report-ID-zero scanners otherwise interpret the extra zero as a length and lose every scan — evidence: `5e1e806dcb 2026-07-18 fix(core): web serial/HID source lifecycle — reader cancel, listener/device cleanup, reportId 0`, findings on #743 — platform: Chromium/Electron.
3. Attach/detach operations are serialized and stale opens are closed; replacement/unmount removes listeners and resets scan-session state — prevents orphan devices and duplicate delivery — evidence: `d0672a3821 2026-07-18 fix(core): serialize scanner transport attachment`; `5e1e806dcb 2026-07-18 fix(core): web serial/HID source lifecycle — reader cancel, listener/device cleanup, reportId 0` — platform: Chromium/Electron.
4. Already-granted devices matching saved profiles reopen on mount — reload should not require another chooser interaction for the registered scanner — evidence: `bf26786303 2026-07-18 feat(core): persistent device-scanner manager + settings connect UI` — platform: Chromium/Electron.
5. Canonical device keys drive profile upserts and live-device status; absent platform names remain empty — avoids duplicate registrations, misleading “some scanner connected” status and frozen English fallback names — evidence: `dfdcbd8e0c 2026-08-24 refactor(scanner)!: one canonical device key, and a scanner section that stays quiet (#1531)` — platform: Chromium/Electron.
