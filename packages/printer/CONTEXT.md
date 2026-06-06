# Printing — Context Glossary

The shared language for the printing domain (settings UI, discovery, transport, cloud
queue). This is a glossary, not a spec. Implementation lives in `src/`, the settings UI in
`packages/core/src/screens/main/settings/printer/`, the persisted schema in
`packages/database`, Electron IPC in `apps/electron`, and the cloud queue in the
`woocommerce-pos` PHP plugin.

## Terms

### Printer Profile
A user-configured, **device-local** printer record (persisted in the `printer_profiles`
RxDB collection; not server-synced). It is what receipt templates route to. Every printer
the POS can target — network, USB, Bluetooth, system print dialog, or cloud — is a Printer
Profile.

### Connection Type
The **primary axis** of the Add Printer dialog: *how the printer is reached*. One of
`network`, `bluetooth`, `usb`, `system` (OS print dialog), or `cloud`. A given platform
only offers the connection types it can physically perform (a browser cannot open a raw
socket; iOS has no USB). The dialog leads with this choice on every platform.

### Vendor
The printer manufacturer protocol family: `epson`, `star`, or `generic`. On the **Network**
connection type, Vendor is a **sub-choice**, because the wire protocol and default port
depend on it. It is *not* a top-level peer of "Scan Network." On web, only `epson` and
`star` are valid (see Network printing).

### Network printing
Reaching a printer over IP. Two distinct transports, not interchangeable:
- **Raw socket** — JetDirect-style TCP, default port `9100`. Available on desktop/native
  only; **impossible from a browser**.
- **Vendor HTTP(S) protocol** — the only network path a browser has:
  - **Epson ePOS-Print** — HTTPS port `8043` / HTTP port `8008`, endpoint
    `/cgi-bin/epos/service.cgi`.
  - **Star WebPRNT** — HTTP(S), endpoint `/StarWebPRNT/SendMessage`.

  Because of this, the default Port is a function of (Vendor × transport), never a single
  global constant.

### Cloud Printer
A printer that pulls (or is pushed) print jobs from a **server-side queue** rather than a
direct device connection (`connectionType: 'cloud'`). It is registered and configured in
the `woocommerce-pos` PHP plugin, not on the device. The client references it by
`cloudPrinterId`. Because the server is reachable from anywhere, a Cloud Printer is
**device-independent**: it is **auto-surfaced** on every till — synthesized into the
printer list at runtime from the server, exactly like the built-in OS Print Dialog entry.
It is **not** manually added per device and is **not** user-deletable on the device; it is
managed in the plugin. See [[Built-in printer]]. Its encoding options (columns, language,
auto-cut, raster) are **owned server-side** and returned in the cloud-print payload — the
device does not edit them. Only *routing* (template → cloud printer) is device-local.

### Cloud Provider
The server-side backend that delivers jobs to a Cloud Printer; drives the job format.
One of `star-cloudprnt`, `epson-sdp`, `printnode`. `star-cloudprnt` receives raw
pre-encoded bytes; `epson-sdp` / `printnode` receive server-rendered order jobs.

### Discovery (Scan)
Finding printers on the local environment automatically. Platform-specific: web does an
HTTP **sweep** of common subnets; Electron uses **mDNS** (currently unimplemented — IPC
channel missing); native uses vendor **SDK** discovery (Epson/Star). Distinct from
manually typing an IP. Cloud Printers are not "discovered" — they are read from the server.

### Printer Settings (transport-independent)
The properties that describe the *physical printer*, not how it is reached: Name,
[[Vendor]] language (`esc-pos`/`star-prnt`/`star-line`), text width (`columns` — 32 for
58mm, 42/48 for 80mm), full-receipt raster, auto-cut, auto-open drawer, set-as-default.
These apply to **every** [[Connection Type]] (a 58mm printer is 58mm whether reached by
network, USB, or Bluetooth). Contrast with transport-specific fields: **Port** (network
only), IP / Scan (network), device picker (USB/Bluetooth).

### Built-in printer
A platform-provided Printer Profile (e.g. the OS print dialog) that cannot be deleted
(`isBuiltIn: true`).
