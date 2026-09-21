# Behaviour ledger: `pos/products/use-serial-scan.web.ts`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Frame USB serial and Bluetooth RFCOMM byte streams into scan events.

**Composes:** None directly.

## Lines

1. Streaming text passes through the shared prefix/suffix line decoder, scan-session dedup and current minimum-length setting — serial chunks are not assumed to be complete barcodes — evidence: `5a94836d04 2026-07-18 feat(core): Web Serial + WebHID barcode sources, device scan bus` — platform: Chromium/Electron; native stub is inert.
2. Teardown cancels the active reader before closing the port — an abort signal alone did not release a pending `reader.read()` — evidence: `5e1e806dcb 2026-07-18 fix(core): web serial/HID source lifecycle — reader cancel, listener/device cleanup, reportId 0` — platform: Chromium/Electron.
3. Lifecycle operations serialize; stale attachment requests close their ports, and new attachments reset framing/dedup state — replacement must not leave a second transport reading — evidence: `d0672a3821 2026-07-18 fix(core): serialize scanner transport attachment` — platform: Chromium/Electron.
4. A read loop clears connection state only if it still owns the active port — late termination of the old stream must not mark its replacement disconnected — evidence: `dfdcbd8e0c 2026-08-24 refactor(scanner)!: one canonical device key, and a scanner section that stays quiet (#1531)`; test name: `use-serial-scan.web.test.tsx`, “does not let a replaced port’s ending read loop clear the live state of its replacement” — platform: Chromium/Electron.
5. The chooser allowlist includes standard SPP and saved vendor service UUIDs — Chromium otherwise silently omits nonstandard RFCOMM services — evidence: `251aed0d89 2026-08-17 fix(core,database): make Bluetooth SPP scanners connectable and explain scanner modes` — platform: Chromium/Electron.
6. Silent reconnect requires exactly one matching granted port — service/model identity cannot distinguish identical physical units, so ambiguity requires a chooser pick — evidence: `572f326635 2026-08-17 fix(core): address Bluetooth scanner review findings`; `use-serial-scan.web.ts:303–306`, “a key identifies a service or model, not a physical unit”; “ambiguity waits for an explicit chooser pick.” — platform: Chromium/Electron.
7. USB and Bluetooth identities share canonical key construction with normalized UUIDs, upserts and per-device live keys — fixes case-mismatched reconnects and duplicate registration; unnamed devices keep empty names — evidence: `dfdcbd8e0c 2026-08-24 refactor(scanner)!: one canonical device key, and a scanner section that stays quiet (#1531)` — platform: Chromium/Electron.
