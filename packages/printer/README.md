# @wcpos/printer — how we support printers

This is the living doctrine for everything under `packages/printer`, the printer settings UI in
`packages/core/src/screens/main/settings/printer/`, and the Electron printer handlers in
`apps/electron/src/main/print*`. Read it before writing a printer spec, before a live session with a
device, and before triaging a merchant's printer ticket. The glossary is in `CONTEXT.md`; the gotcha
catalogue with live evidence is wcpos/roadmap#136; specs are on wcpos/monorepo#1597.

**When you learn something at a printer, add it to the Lessons log at the bottom of this file in
the same PR as the fix.** The ruling that created this file (Paul, 2026-09-03) is recorded in
`wcpos/roadmap` at `docs/printer-support-doctrine.md`; this README is the copy that must stay true.

## Why this exists

Getting one Epson TM-m30III to print reliably over the network took two people, every tool and doc
on the internet, and roughly three sessions across two days. The post-mortem found the time went to,
in order of cost: no observability (the printer path logged nothing); building lanes before reading
the vendor's own port table and the competitors' help pages; app messages that lied and were trusted;
and hardware behaviour that is documented nowhere. We cannot buy every printer. We do not need to:
the number of _lanes_ is small and vendors do not invent new ones.

## The rules

### 1. Research gate before any printer spec

No lane, adapter, or wizard step gets a spec until its first section links, with a sentence each:

- the **vendor's own developer docs** for the lane (Epson: ePOS-Print XML manual, ePOS SDK, the eRED /
  Secure Printing guide and its port table; Star: WebPRNT, CloudPRNT, mC-Print; generic: the ESC/POS
  reference the printer claims);
- **three POS vendors' help pages** for the same printer family (Shopify, Lightspeed, Square, Odoo,
  Loyverse are the usual ones) — what they support, on which lane, and what they tell merchants to
  change on the printer. If all of them tell merchants to flip a setting, that is the wizard remedy,
  not a lane to engineer around;
- the **port/lane table** for the vendor: which ports print, which acknowledge, which are held or
  quarantined, under each security setting.

### 2. Observability is a feature

Missing logging in the printer path is a defect. Every main-process handler logs inputs, outcome and
elapsed time (`apps/electron/src/main/print-epos-http.ts`, `print-raw-tcp.ts`,
`printer-discovery.ts`); every probe logs what it sent and what came back (`src/transport/
epos-endpoint.ts`, `src/discovery/identify.ts`) through `printerLogger` (`src/logger.ts`), which is
forwarded into Electron's `main.log` — the package-side half lands with wcpos/monorepo#1828; until
it merges, only the Electron main-process handlers log. When a live finding cannot be explained from the log, the first
fix is the log line that would have explained it, before any theory. Next on this rule: a diagnostics
export (log + probe matrix + identity + platform) so a merchant's ticket arrives as a signature.

### 3. Prefer lanes that acknowledge

ePOS-Print, WebPRNT, CloudPRNT and IPP return a result per job. Raw 9100 is fire-and-forget and, on
RED-era Epsons, harmful (a ~4 min quarantine). Order: acknowledged lane → encrypted raw only where the
vendor documents it for third parties → plain raw as the generic fallback with honest wording ("sent,
could not confirm it printed"). A raw fallback on a vendor that has an acknowledged lane must fail
loudly, never send bytes.

### 4. Design for signatures, not models

Identify classifies what a printer _answers_ (open ports, protocols, HTTP codes, states) and the
wizard maps signature → cause → remedy. Model names are hints for defaults (width, drawer pin), never
for status. "Detected: X" must come from a probe result; "No response from <ip>" is a first-class
outcome with its own copy.

### 5. Say what we support, in tiers

**Verified** (on a desk, walked through the script below) · **Documented** (vendor docs + the three
competitors' pages, same lane family) · **Generic** (raw ESC/POS over 9100/USB/Bluetooth, best effort,
honest wording). Anything else is "unsupported" in the UI, with the diagnostics export as the path in.

### 6. Live sessions run a fixed script

Research gate → scan/identify → width → Test Print → Open drawer → real receipt (image + barcode) →
browser / native client → security setting flipped → the five breakages (wrong port, alternate port,
raw port by hand, wrong subnet, device off). Timestamps, dialog text and log lines for each; record
on wcpos/roadmap#136 the same hour as signature + cause + remedy. Prove a lane on paper before building
on it. Never send bytes to raw 9100 on an Epson from a shell; only the app's own documented probes.

## Lane taxonomy (the whole market, as of 2026-09)

| Lane                                                  | Acks | Vendors                          | Notes                                                                            |
| ----------------------------------------------------- | ---- | -------------------------------- | -------------------------------------------------------------------------------- |
| Epson ePOS-Print XML, HTTPS 443 / 8043                | yes  | Epson TM-i / TM-m / intelligent  | The only lane that prints with Secure Printing ON; browser-capable; probed first |
| Epson ePOS-Print, HTTP 80 / 8008                      | yes  | Epson                            | Secure Printing OFF only (80 → instant 404 with it on)                           |
| Star WebPRNT (HTTP) / CloudPRNT                       | yes  | Star mC-Print, TSP               | Browser-capable                                                                  |
| IPP 631                                               | yes  | some Epson/Star, office printers | Identify signal, not a receipt lane on its own                                   |
| Raw ESC/POS TCP 9100                                  | no   | everyone                         | Generic fallback; quarantined on RED Epsons                                      |
| Raw over TLS 9143                                     | no   | Epson                            | For Epson's own drivers; held for third parties under Secure Printing            |
| USB (WebUSB / Electron / Android host)                | no   | everyone                         | No iOS                                                                           |
| Bluetooth classic (SPP; MFi ExternalAccessory on iOS) | no   | Epson, Star, generic             | iOS needs the MFi path + protocol string in Info.plist                           |
| BLE                                                   | no   | Netum and other generics         | Chunked writes; per-model characteristics                                        |

## Lessons log

Append, newest last. One entry = date · device/lane · signature → cause → remedy · where it is fixed.

- **2026-09-03 · Epson TM-m30III fw 13.21 (RED, Secure Printing ON by default in EU/UK) · network.**
  Every ESC/POS byte stream over the network is held and never printed (raw 9100 → quarantine; raw
  TLS 9143 → held; ePOS `<command>` → held). Structured ePOS-Print XML over 443 prints and is
  acknowledged. Fixed for text/receipt jobs: `renderEposXml` + `printMarkup` (wcpos/monorepo#1819).
  **Still open:** the `fullReceiptRaster` profile toggle renders ESC/POS bytes and goes through
  `printRaw` → ePOS `<command>`, which this printer holds; route raster output through structured
  `<image>` markup before calling that setting supported on RED Epsons. Shopify and Lightspeed
  simply tell merchants to switch Secure Printing off; Epson's eRED guide port table says 443/8043
  "can print (encrypted)". Wizard remedy for the signature (443 answers, 80 → 404, 9100 silent):
  print structured XML on 443, and offer the Web Config steps to disable Secure Printing.
- **2026-09-03 · same printer · "prints once, then hangs".** Printer-side, not client-side: curl and
  the app behave identically (`Connection: close`, no socket reuse), back-to-back jobs are not the
  trigger, spacing is not a cure, a hung job holds the status lane too (timeout, then 503, for 2–10
  min), a power-cycle always clears it. Troubleshooter note, not a code fix. Undocumented anywhere.
- **2026-09-03 · same printer · Server Direct Print enabled holds ePOS-Print** (503 on every POST while
  the web UI answers 200). Remedy: Web Config → Server Direct Print → Disable. Signature is distinct
  from the Secure Printing quarantine (ePOS timeout, no HTTP error) and from "ePOS off" (404).
- **2026-09-03 · Electron · Scan Network finds nothing after hours of uptime** while a fresh process
  sees the printer at once; only an app restart fixed it. Cause unknown at the time because
  discovery logged nothing — now it logs scan start/end, services seen and mapped, and mDNS errors
  (wcpos/electron#404). Troubleshooter: "restart the app, scan again".
- **2026-09-03 · all lanes · `4:35?PM` on paper.** `Intl.DateTimeFormat` emits U+202F before AM/PM;
  thermal fonts have no glyph. Fixed in `normalizeThermalText` (wcpos/monorepo#1823).
- **2026-09-03 · browser · logo missing, barcode fine.** The browser loads the store logo as a
  cross-origin image and WordPress sends no CORS header on uploads, so the raster is dropped silently;
  Electron fetches it through `wcpos-image://` and is fine. Remedy: serve the logo through the plugin
  REST namespace with CORS, or embed it as a data URL. Open.
- **2026-09-03 · Electron · Epson profiles ignore the Port field** unless it is an ePOS port: a wrong
  port still prints via the probe. Design, not a bug; the wizard should de-emphasise Port once a lane
  is identified.
- **2026-09-03 · Electron · unreachable host with an Epson name** gets Port rewritten to 9100 by
  identify and Test Print then falls back to raw 9100 with a bare error string. On a real RED Epson
  during a transient probe failure that path would quarantine the printer. Remedy: identify must not
  pick a lane when nothing answered; Epson profiles never fall back to raw from a failed ePOS probe.
  Open (Spec B item 2).
- **2026-09-03 · Electron · "Detected: Epson" is derived from the profile name**, so it stays green
  with the printer switched off; and the unreachable-printer panel gives certificate/port-8008/Chrome
  advice inside Electron. Remedy: status label only from probe results; a distinct "No response from
  <ip>" outcome. Open.
- **2026-09-04 · iOS + Android (dev clients on main) · network.** The native network lane is raw
  ESC/POS over `react-native-tcp-socket` to the profile port (default 9100), vendor ignored — not
  ePOS. With Secure Printing OFF it prints on the TM-m30III from both OSes (verified on paper); with
  it ON it is the raw-9100 quarantine by the app's own path. The identify probes on native: 443/8043
  fail on the self-signed certificate (`The certificate for this server is invalid` on iOS, `Trust
  anchor for certification path not found` on Android), 80/8008 are blocked on Android by the
  cleartext policy (`CLEARTEXT communication to <ip> not permitted`). Wizard remedy for RED printers
  stays "disable Secure Printing" (Lightspeed's six Web Config steps); the Epson SDK's `TCPS:` lane
  is the candidate encrypted native lane (prints with SP OFF; SP ON not yet tested).
- **2026-09-04 · iOS/Android · identify.** `parseEposResponse` used `DOMParser`, absent on Hermes, so
  every HTTP ePOS probe that got an answer ended in `ReferenceError: Property 'DOMParser' doesn't
  exist` and identify said "No ePOS port". DOM-free parse (G1). Same scan: the SDK-discovered
  `TM-m30III` was relabelled `generic` because the name hint only knew the word "epson" and
  identify's answer overrode the discovery vendor; discovery vendor now wins over an errored probe,
  `TM-`/`TSP`/`mC-Print` prefixes count as hints, and `TM-m30III_055889` (Bluetooth names carry a
  serial after `_`) now matches the model table (G2).
- **2026-09-04 · native · silent paths.** The raw TCP print and the dropped-logo `catch` logged
  nothing; a test print left zero lines. Both log now (G3, G5). The Epson discovery start error was
  swallowed too (a denied Nearby-devices permission looked like "nothing found"); logged (G6).
- **2026-09-04 · Android, raw 9100 · receipt.** Barcode printed without its number: the encoder
  was called with a bare height and `@point-of-sale/receipt-printer-encoder` defaults HRI text off;
  `text: true` now (G4). Logo missing: the image raster needs a browser canvas, which native has
  none of — logged now, and native rasterises through pure-JS PNG/JPEG decoders instead (G8,
  `thermal-raster.native.ts`; verify on paper next session).
- **2026-09-04 · Android · Bluetooth, TM-m30III.** Pairing needs the printer's Bluetooth Status
  Sheet (feed-button sequence) to enter pairing mode; the SDK then prints over Bluetooth Classic
  (verified on paper). Two gotchas: the `BT:` row only appears while the printer is discoverable
  although it is already bonded (the SDK's bonded-devices option is not used — open), and the
  Bluetooth picker listed the printer's `TCPS:` network targets, including its `[local_display]`
  and `[local_TSE]` sub-devices, as Bluetooth candidates — `TCPS:` now folds into the printer's one
  network row as `secureTarget`, sub-devices are dropped (G6).
- **2026-09-04 · Bluetooth/USB profiles · width.** Saved at the 42-column default because only the
  network path consulted the model table. Ruling (Paul): ask the printer. On Epson SDK lanes the
  adapter now reads the configured paper width (`getPrinterSetting(PAPERWIDTH)`: 58/60/70/76/80 mm →
  32/35/42/45/48 columns); the model table is the fallback, the ruler the last resort (G7).
- **2026-09-05 · Netum NT-1809 (58 mm generic) over USB on Electron · implementation complete;
  corrected output pending physical verification.** Found
  and printing at once (it enumerates as USB printer class 7 despite its Winbond VCP VID/PID; the
  class filter is fine). Two defects: the profile defaulted to 42 columns (no width source on the
  generic USB lane — open, the width must be asked at add time), and the store-hours block printed
  off-centre: a multi-line centred `<text>` bypassed the aligned-line path, so the encoder padded each
  line *and* a mid-line `ESC a 1` reached the printer; Epson ignores mid-line alignment, the Netum
  honours it (double-centring). The implementation now emits each line through the aligned path
  (Spec I1); the result has not yet been verified on paper.
  The dotted rule and the shifted payment amounts in the same photo were **not** in the emitted
  bytes — the raw job hex is now available during the explicit 24-hour verbose-diagnostics mode
  (Spec I2), so the next test can compare bytes, not theories. An earlier 32-column diagnostic print
  narrowed the investigation; the corrected receipt and byte capture still need a dated
  Netum/Electron paper run.
- **2026-09-05 · Netum over Bluetooth LE on Electron.** The chooser finds `BlueTooth Printer`, the
  print times out: `WebBluetoothAdapter` reconnects via the library's `getDevices()` path, which
  needs persisted device permissions Electron does not keep. Open (Spec H: connect through the
  device object in hand). Same lesson for any browser session without a persisted permission.
- **2026-09-05 · Scan-first setup must not read as a Wi-Fi scan.** A shop with only a USB or
  Bluetooth printer saw "Looking for printers on your network…" and a Bluetooth button hidden
  under Options. Chromium only opens the Bluetooth LE chooser from a click, so that button has to
  stay in view on every scan screen; USB and OS-paired printers enumerate in a second and are
  listed while the Wi-Fi scan continues. Copy is one line per screen plus the printer guide link.
