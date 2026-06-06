# Printer Settings Redesign — Executable Plan

**Branch:** `worktree-printer-settings-redesign`
**Spec/glossary:** `packages/printer/CONTEXT.md` (committed)
**Preview:** `planning/printer-settings-redesign/preview.html` (open in a browser — interactive, switch platform/origin)
**Status:** decisions locked; **revised after review round 1** — addressing all 5 approval conditions

> This folder (`planning/printer-settings-redesign/`) holds the design artifacts for review and is intended to be deleted before the implementation PR merges. The durable glossary lives in `packages/printer/CONTEXT.md`.

### Review round 1 — how each approval condition is addressed
1. **Synthetic cloud-printer identity + override persistence** → WS2.0 (`cloud:<id>` grammar; `template_printer_overrides` reframed as generic target id; `maxLength` 36→128; schema `version 0→1` passthrough migration preserving existing overrides).
2. **Shared available-printers source for settings AND receipt printing** → WS2.1 (`useAvailablePrinterProfiles()` consumed by both `settings/printing/index.tsx` and `receipt/hooks/use-resolved-printer.ts`).
3. **Server encoding mapped onto synthetic profiles before rendering** → WS2.3 (rewritten: encoding lives on the synthesized `PrinterProfile`; `CloudAdapter` unchanged).
4. **Electron mDNS dependency + standalone validation** → WS4.0 (declare/verify mDNS dep in `apps/electron`) + WS6.4 (per-repo validation).
5. **Corrected file paths + per-repo validation commands** → WS1 files note (`printer/schema.ts`, not `dialog/schema.ts`) + WS6.4.

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

## Conventions (apply to every workstream)

- **Reuse the shared component library `@wcpos/components`.** Do NOT hand-roll buttons, inputs, selects, toggles, dialogs, layout. Use the existing primitives — `Button`, `Text`, `Icon`, `IconButton`, `HStack`/`VStack`, `Dialog*`, `Modal*`, `Select*`, `FormField`/`FormInput`/`FormSelect`, `Collapsible*`, `Tabs*`, `Toast`. The Add Printer dialog already composes these (see `add-printer.*.tsx`); extend that composition rather than introducing new styling. If a needed primitive is genuinely missing, add it to `@wcpos/components` (don't inline a one-off).
- **Match surrounding style** (Tailwind/uniwind classes, naming, file layout). On native files, prefix `hover:`/`group-hover:` with `web:` (they leak on native).
- **E2E selectors:** add stable `testID`s to interactive elements; never select by localized text (repo e2e policy).
- **Translatable, not translated:** every user-facing string via `t('key','English default')` + key in `locales/en/core.json`.
- **No dead settings:** don't ship a toggle/field without a consumer wired up.

## WS1 — Unified Add Printer dialog (shared RN, `packages/core`)

Files (all under `packages/core/src/screens/main/settings/printer/`): `add-printer.{web,electron}.tsx`, `add-printer.tsx` (native), `dialog/connection/*`, `dialog/use-printer-dialog-form.ts`, and **`schema.ts`** (sibling of `dialog/`, i.e. `printer/schema.ts` — *not* `dialog/schema.ts`).

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

> **Revised after review.** Cloud printers are synthesized at runtime and NOT persisted, but routing IS persisted and print resolution reads only persisted profiles today. The tasks below add an explicit **identity contract** and a **single merged printer source** used by *both* settings and receipt printing, and put encoding on the synthesized profile (not the adapter).

**Verified constraints (code):**
- `template_printer_overrides.printer_profile_id` is `maxLength: 36`, "References printer_profiles.id" (`packages/database/src/collections/schemas/template-printer-overrides.ts`).
- `useResolvedPrinter` subscribes **only** to `printer_profiles`; `resolvePrinter` + manual pick look up `allPrinters` by `id` (`packages/core/src/screens/main/receipt/hooks/use-resolved-printer.ts`, `packages/printer/src/resolve-printer.ts`).
- `CloudAdapter.printRaw(data)` receives **already-rendered bytes**; encoding (language/columns/raster) happens upstream in the render path, before transport (`packages/printer/src/transport/cloud-adapter.ts`).

Client (`packages/core`, `packages/printer`, `packages/database`):
- [ ] **2.0 Printer target identity contract (do first).** Define a stable id for synthesized cloud printers: **`cloud:${cloudPrinterId}`** (namespaced so it never collides with uuid local ids or the built-in `system` id).
  - Reframe `template_printer_overrides.printer_profile_id` as a **generic printer target id** (`<uuid>` local | `system` | `cloud:<id>`). Update the field `description`.
  - **Widen `maxLength` 36 → 128** (cloudPrinterId is 1–64 chars + `cloud:` prefix). Bump `template_printer_overrides` schema `version: 0 → 1` with a **non-destructive passthrough migration** (existing ≤36 values stay valid; no data loss).
  - Record the id grammar in `packages/printer/CONTEXT.md`.
- [ ] **2.1 Single merged printer source — `useAvailablePrinterProfiles()`.** New shared hook/selector returning the union of (1) persisted local `printer_profiles`, (2) the built-in system print dialog, (3) synthesized read-only cloud printers (from `/settings/cloud-print`; id `cloud:<id>`, `isBuiltIn: true`, `connectionType: 'cloud'`). Consume it in **both** `settings/printing/index.tsx` (list + routing dropdowns) **and** `receipt/hooks/use-resolved-printer.ts` (so `allPrinters` / `resolvePrinter` see cloud printers). *Without this, cloud printers resolve in Settings but fail at print time — the #2 blocking issue.*
- [ ] **2.2 Routing references the target id.** Overrides store `cloud:<id>`. If the server no longer lists that printer, the merged source omits it and routing shows the target as "unavailable" (no crash; fall back to auto/system). Existing local overrides preserved by the 2.0 migration.
- [ ] **2.3 Server encoding mapped onto the synthesized profile (NOT the adapter).** The synthesized `PrinterProfile` carries server-owned `language` / `columns` / `autoCut` / `fullReceiptRaster` (for `star-cloudprnt`) so the **existing render path** (`usePrint` / `PrinterService`) encodes correctly before `CloudAdapter.printRaw()`. `CloudAdapter` is unchanged — it still just ships bytes. Order-based providers (`epson-sdp` / `printnode`) take the `order` job path and need no client encoding. These fields are **not** shown/edited in the device UI.
- [ ] **2.4 Empty + error states.** No cloud printers → nothing extra shown. `/settings/cloud-print` fetch failure → merged source still returns local + built-in; no crash; log + degrade.

Plugin (`woocommerce-pos`, separate PR):
- [ ] **2.5 Extend `/settings/cloud-print`** response to include per-printer encoding fields (`columns`, `language`, `autoCut`, `fullReceiptRaster`) for `star-cloudprnt`. Document the contract in the plugin's `cloud-print-queue-contract`.

**Accept:** a server cloud printer (a) appears on every till with no manual add, (b) is selectable in routing, (c) **resolves and prints via `useResolvedPrinter` at receipt time** with server encoding, (d) is not deletable on-device, (e) existing local overrides survive the schema migration, (f) a removed cloud printer degrades to "unavailable" without crashing.

## WS3 — Web network port/adapter fixes (`packages/printer`)

- [ ] **3.1 Origin-aware Star default.** `deriveWebVendorDefaults` (in `add-printer.web.tsx`): Star → `443` (https origin) / `80` (http origin), not the `9100` sentinel.
- [ ] **3.2 Fix Star WebPRNT adapter.** `transport/network-adapter.web.ts` (+ `star-webprnt-adapter.ts`): honor origin — build `http://host:80/...` on an http origin instead of hardcoding `https://`. (Fixes the "Star on :80 unreachable" bug.) Keep https on secure origins (mixed-content).
- [ ] **3.3 Endpoint hint** already correct for Epson; extend to reflect the resolved Star http/https + port.

**Accept:** unit tests asserting derived port + endpoint URL for {Epson,Star}×{https,http}. No `9100` ever surfaced on web.

## WS4 — Electron mDNS discovery (`apps/electron` submodule, separate PR)

- [ ] **4.0 mDNS dependency in the standalone repo (do first).** `bonjour-service` is declared **only** in the monorepo root `package.json` (line 39) — **not** in `apps/electron/package.json`. Since WS4 is a separate `wcpos/electron` PR with its own lockfile, the dependency must be added/verified there (or pick an alternative mDNS lib the Electron repo already ships). *(Note: `apps/electron` is not initialized in this worktree, so its current deps could not be inspected — confirm on the submodule repo.)*
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
- [ ] **6.2 Unit tests:** port derivation {Epson,Star}×{https,http} (WS3); `useAvailablePrinterProfiles()` merge of local+system+cloud (WS2.1); **cloud printer resolves at print time via `resolvePrinter`/`useResolvedPrinter`** (WS2.1, the #2 regression guard); `template_printer_overrides` v0→v1 migration preserves existing `printer_profile_id` values and accepts `cloud:<id>` (WS2.0); removed-cloud-printer → "unavailable" fallback (WS2.2); tab-set-per-platform (WS1).
- [ ] **6.3 Translatability sweep:** every new/changed string uses `t('key','English')`; add keys to `locales/en/core.json`. Produce a list of new keys for the `wcpos/translations` pipeline. No hardcoded UI text.
- [ ] **6.4 Per-repo validation (root scripts do NOT cover the submodule).** Root `lint`/`typecheck`/`test` filter `{./packages/*}` + `{./apps/main}` only — `apps/electron` and the plugin are excluded, so each repo validates itself:
  - **monorepo:** `pnpm run lint`, `pnpm typecheck --force` (turbo cache is stale in worktrees), package tests (`turbo run test --filter='{./packages/*}'`).
  - **electron (`wcpos/electron`):** `pnpm run lint`, `pnpm run ts:check`, `pnpm run test` inside the submodule.
  - **plugin (`woocommerce-pos`):** the PHP lint / unit / static-analysis checks that repo uses.

---

## Sequencing

1. **WS3** (web ports) + **WS4.1** (allow-list) — small, high-value, independent.
2. **WS1** (unified dialog) — the structural redesign; everything UI hangs off it.
3. **WS2** (cloud auto-surface) — **WS2.0 identity contract + DB migration first** (prerequisite for routing), then WS2.1 merged source, then 2.2–2.4; plugin WS2.5 in parallel.
4. **WS4** (Electron) — **WS4.0 dependency first**, then 4.1 allow-list (already noted in step 1), then 4.2–4.3 mDNS handler — all in the submodule.
5. **WS5 / WS6** — honesty + verification throughout.

## Open follow-ups (not blocking)

- Native (`add-printer.tsx`) network path: confirm whether vendor SDK vs raw-TCP selection needs UI exposure, or stays automatic.
- `printer_profiles` schema migration if any persisted cloud profiles exist from the native cloud tab (likely none in the wild).
