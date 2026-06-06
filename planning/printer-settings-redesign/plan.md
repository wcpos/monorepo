# Printer Settings Redesign — Executable Plan

**Branch:** `worktree-printer-settings-redesign`
**Spec/glossary:** `packages/printer/CONTEXT.md` (committed)
**Preview:** `planning/printer-settings-redesign/preview.html` (open in a browser — interactive, switch platform/origin)
**Status:** decisions locked; **awaiting plan review** before implementation

> This folder (`planning/printer-settings-redesign/`) holds the design artifacts for review and is intended to be deleted before the implementation PR merges. The durable glossary lives in `packages/printer/CONTEXT.md`.

Spans three repos:
- **monorepo-v2** (this) — shared RN UI, web/native transport, client cloud surfacing
- **wcpos/electron** submodule (`apps/electron`) — mDNS discovery + preload allow-list
- **woocommerce-pos** plugin (`~/Projects/woocommerce-pos`) — `/settings/cloud-print` encoding fields

Each repo lands its own PR. The monorepo PR is the lead; ADR ingested to wiki via `/wiki-ingest` after it merges.

---

## Locked architecture decisions

1. **Connection-first IA on every platform.** Primary choice = "How is it connected?" (`network`/`usb`/`bluetooth`); vendor is a sub-choice on the Network path only. Platforms differ only in which tabs/vendors appear (iOS: no USB; web: Epson/Star only; desktop/native: + Generic).
2. **Cloud printers are server-owned, auto-surfaced read-only** (like the built-in Print Dialog). No manual Cloud tab anywhere. Encoding options owned server-side. Only routing is device-local. *(ADR-worthy — ingest post-merge.)*
3. **Web network ports are per-vendor, origin-aware, applied on first open.** Epson `8043`(https)/`8008`(http); Star `443`(https)/`80`(http). Desktop/native = raw TCP `9100`, vendor-independent.
4. **Scan = an action inside Network**, never a top-level sibling. Single entry point: Add Printer.
5. **mDNS discovery in scope for Electron.** Fix the preload allow-list AND implement the main-process handler.
6. **UI degrades honestly** — Searching…/None found, never silent dead buttons. Hide tabs a platform can't do.
7. **Translatable, not translated** — every string via `t()` + English key in `core.json`; no hardcoded UI text.
8. **No hardware until ~next week** — verify via virtual-printer sim + unit tests; defensive coding.

---

## WS1 — Unified Add Printer dialog (shared RN, `packages/core`)

Files: `screens/main/settings/printer/add-printer.{web,electron}.tsx`, `add-printer.tsx` (native), `dialog/connection/*`, `dialog/use-printer-dialog-form.ts`, `schema.ts`.

- [ ] **1.1 Make web connection-first.** `add-printer.web.tsx`: introduce `ConnectionTypeSegmented` (Network/USB/Bluetooth) as the primary control; move the Epson/Star `WebVendorSegmented` *inside* the Network section. USB/BT tabs render only when `isWebUsbSupported()` / `isWebBluetoothSupported()`.
- [ ] **1.2 Remove the manual Cloud tab everywhere.** `ConnectionTypeSegmented`: drop the `cloud` option and `includeCloud` prop. Delete `dialog/connection/cloud-fields.tsx` and the `cloud` branch from native `add-printer.tsx`. (Cloud now via WS2 auto-surface.)
- [ ] **1.3 Scan Network is an in-Network action.** `network-fields.tsx`: keep the inline Scan button + render scan **results as a pick-list** under the IP field (relocated from WS5/printing tab). Same visual pattern as USB/BT `DeviceList`.
- [ ] **1.4 Fix first-open port derivation.** `use-printer-dialog-form.ts`: apply `deriveVendorDefaults(vendor)` on dialog open / when prefill lacks a vendor — not only on vendor *change*. Verify Epson shows `8043` (https) on first open.
- [ ] **1.5 Schema cleanup.** `schema.ts`: drop cloud-printer schema branches from the add path (cloud no longer user-added). Keep `cloudPrinterId`/`cloudProvider` on `PrinterProfile` type only if still used by routing (see WS2).
- [ ] **1.6 Separate transport-specific from printer-intrinsic fields.** "Printer Settings" (Name, Language, **Text width/`columns`**, Raster, Auto-cut, Auto-open drawer, Set as default) describe the *physical printer* and must render for **every** connection type (network/usb/bluetooth). *(Current app already shares them via always-rendered `AdvancedSettings` + `showPort` gate — preserve this; do NOT nest the block inside the Network section.)* Consider renaming the collapsible from "Advanced Settings" → "Printer Settings" for clarity.
- [ ] **1.7 Move Port inline beside IP Address.** Port is part of the network *destination* (`IP:port`), so render it as a small field next to the IP input in `network-fields.tsx` — not as a standalone item in the Printer Settings block. Remove it from `AdvancedSettings` (drop the `showPort` prop). Port shows only on the Network connection type; vendor-defaulted + editable.
- [ ] **1.8 Match the Add Printer dialog width to the parent Settings modal.** Settings uses `ModalContent size="2xl"` (`w-200`); the dialog uses `DialogContent size="lg"` (`w-lg`) and `Dialog` has **no `2xl` variant** (tops out at `xl`/`w-160`). Add `'2xl': 'w-200'` to `dialogContentVariants` in `packages/components/src/dialog/index.tsx` (parity with `modal/index.tsx`), then set `printer-dialog-layout.tsx` → `DialogContent size="2xl"`. Keep the existing single-column form layout (user confirmed it reads fine at the wider width) — no two-column rework needed.

**Accept:** preview parity across all 4 platform modes; snapshot/RTL tests for tab sets per platform (iOS has no USB tab; web has no Generic vendor).

## WS2 — Cloud printers auto-surface (client + plugin)

Client (`packages/core`, `packages/printer`):
- [ ] **2.1 Synthesize cloud printers into the printer list.** Read `/settings/cloud-print`; map each server printer to a synthetic, read-only `PrinterProfile` (`isBuiltIn: true`, `connectionType: 'cloud'`, not persisted in `printer_profiles`). Merge into the Printers section + template routing dropdowns alongside the built-in Print Dialog.
- [ ] **2.2 Routing keyed by `cloudPrinterId`.** Device-local routing (template → cloud printer) references the server id; survives if the server printer set changes (show "unavailable" if id no longer present).
- [ ] **2.3 Encoding from server.** Cloud transport (`transport/cloud-adapter.ts`) takes encoding (columns/language/cut/raster) from the server payload for `star-cloudprnt`; order-based providers (`epson-sdp`/`printnode`) defer to server rendering.
- [ ] **2.4 Empty + error states.** No cloud printers → nothing extra shown. Fetch failure → list still renders local printers; no crash.

Plugin (`woocommerce-pos`, separate PR):
- [ ] **2.5 Extend `/settings/cloud-print`** response to include per-printer encoding fields (`columns`, `language`, `autoCut`, `fullReceiptRaster`) for `star-cloudprnt`. Document the contract in `docs/cloud-print-queue-contract.md`.

**Accept:** a server-configured cloud printer appears on every till without manual add, is selectable in routing, and is not deletable on-device. Matches the preview's left panel.

## WS3 — Web network port/adapter fixes (`packages/printer`)

- [ ] **3.1 Origin-aware Star default.** `deriveWebVendorDefaults` (in `add-printer.web.tsx`): Star → `443` (https origin) / `80` (http origin), not the `9100` sentinel.
- [ ] **3.2 Fix Star WebPRNT adapter.** `transport/network-adapter.web.ts` (+ `star-webprnt-adapter.ts`): honor origin — build `http://host:80/...` on an http origin instead of hardcoding `https://`. (Fixes the "Star on :80 unreachable" bug.) Keep https on secure origins (mixed-content).
- [ ] **3.3 Endpoint hint** already correct for Epson; extend to reflect the resolved Star http/https + port.

**Accept:** unit tests asserting derived port + endpoint URL for {Epson,Star}×{https,http}. No `9100` ever surfaced on web.

## WS4 — Electron mDNS discovery (`apps/electron` submodule, separate PR)

- [ ] **4.1 Register the channel.** `apps/electron/src/preload.ts`: add `printer-discovery` to the `ipc.render.invoke` allow-list. (Immediately stops "Channel printer-discovery is not allowed".)
- [ ] **4.2 Implement the main handler.** `ipcMain.handle('printer-discovery', …)` using the already-present `bonjour-service` dep; emit discovered printers back over the channel matching `use-printer-discovery.electron.ts`'s expected shape (`start`/`stop` actions, dedup, progress).
- [ ] **4.3 Honest progress/empty states** in the dialog Network section: Searching… → results pick-list → "No printers found".

**Accept:** Scan Network in the dialog returns mDNS results in the virtual-printer sim; no IPC error; cancel works.

## WS5 — USB/Bluetooth honesty (all platforms)

- [ ] **5.1 Relocate** the settings-tab scan/results block out of `printing/index.tsx` into the dialog (WS1.3); remove the top-level Scan Network button (done in preview).
- [ ] **5.2 Electron USB/BT** (`use-printer-discovery.electron.ts`): verify `usb-discovery` IPC returns devices and Web Bluetooth works in the renderer; wire Searching…/None-found; if a path is genuinely unsupported, hide its tab rather than show a dead button.
- [ ] **5.3 Web USB/BT** buttons already gated by capability checks — confirm and keep.

**Accept:** no button is a no-op; every tap leads to scanning UI, a result, or an explicit "none found".

## WS6 — Verification & hygiene (cross-cutting, no hardware)

- [ ] **6.1 Virtual-printer sim** (per `docs/superpowers/plans/2026-05-22-printer-discovery-phase-1-virtual-printer.md`) exercised in tests for network/mDNS/USB/BT flows.
- [ ] **6.2 Unit tests:** port derivation (WS3.3), cloud synth/merge (WS2.1), tab-set-per-platform (WS1), routing-by-cloudId fallback (WS2.2).
- [ ] **6.3 Translatability sweep:** every new/changed string uses `t('key','English')`; add keys to `locales/en/core.json`. Produce a list of new keys for the `wcpos/translations` pipeline. No hardcoded UI text.
- [ ] **6.4 Lint + typecheck:** `pnpm run lint`; `pnpm typecheck --force` (turbo cache is stale in worktrees).

---

## Sequencing

1. **WS3** (web ports) + **WS4.1** (allow-list) — small, high-value, independent.
2. **WS1** (unified dialog) — the structural redesign; everything UI hangs off it.
3. **WS2** (cloud auto-surface) — client side first against current `/settings/cloud-print`; plugin WS2.5 in parallel.
4. **WS4.2–4.3** (mDNS handler) — Electron submodule.
5. **WS5 / WS6** — honesty + verification throughout.

## Open follow-ups (not blocking)

- Native (`add-printer.tsx`) network path: confirm whether vendor SDK vs raw-TCP selection needs UI exposure, or stays automatic.
- `printer_profiles` schema migration if any persisted cloud profiles exist from the native cloud tab (likely none in the wild).
