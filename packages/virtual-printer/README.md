# Virtual Printer (dev tool)

A fake network printer package for developing/testing WCPOS printer **discovery and printing**
without hardware. It contains no WCPOS app code and the app is never aware it is fake.

## Run

From the monorepo root:

```bash
pnpm virtual-printer
```

Or directly, with a scenario:

```bash
pnpm --filter @wcpos/virtual-printer start -- --scenario secure-printing
pnpm virtual-printer:secure   # the same thing from the root
```

Environment overrides:

| Variable | Default | Notes |
| --- | --- | --- |
| `VP_NAME` | `Virtual WCPOS Printer` | Advertised mDNS name. Include `Epson`/`Star` if testing vendor-name inference. |
| `VP_VENDOR` | `both` | `both`, `epson`, or `star`. `star` exposes only WebPRNT; `epson` exposes only ePOS. |
| `VP_RAW_PORT` | `9100` | Raw TCP print port for Electron/native testing. |
| `VP_HTTP_PORT` | `8008`, or `80` when `VP_VENDOR=star` | HTTP endpoint port. Explicit value always wins. |

`--scenario <name>` overrides `VP_VENDOR`; HTTPS binds 8043 and IPP 6310, since 443/631 need root.

## Star WebPRNT on port 80

To mimic a plain-HTTP Star WebPRNT printer for web testing:

```bash
VP_VENDOR=star VP_HTTP_PORT=80 pnpm virtual-printer
```

Port 80 is privileged on many systems. If binding fails, either run with appropriate local
permissions or use a high port for smoke-testing the server itself:

```bash
VP_VENDOR=star VP_HTTP_PORT=8080 pnpm virtual-printer
```

For the browser Local Network Access flow fixed in the web printer transport, test from an
HTTPS-served POS page against a LAN hostname/IP and port 80.

## Scenarios

Each scenario is a printer we have actually had to reason about. Pick the one a merchant's
report sounds like, reproduce it locally, and the app never knows the difference.

| Scenario | Mimics | Reported as |
| --- | --- | --- |
| `default` | a generic LAN receipt printer with both web endpoints | — |
| `secure-printing` | Epson TM-m30III with Secure Printing on: ePOS over TLS only, raw 9100 takes the bytes and bins them | "printing stopped after a firmware update", "it prints once then nothing for minutes" |
| `held-503` | an Epson holding jobs (cover open, busy): the endpoint answers, the job gets 503 | "the printer is found but nothing comes out" |
| `epos-off` | ePOS-Print switched off in the network settings; raw 9100 still prints | "it worked on the old app" |
| `star-only` | a Star TSP with WebPRNT on plain HTTP and no ePOS | "Star printer, web app" |
| `starprnt-raw-only` | a LAN Star without WebPRNT — raw 9100 is the only lane | "Star printer, desktop app only" |
| `epos-device` | an ePOS-Device / socket.io box that answers on the ePOS path but is not a printer | "a random device shows up in the printer list" |
| `no-name` | advertised with an instance name only and no model in TXT | "my printer shows up blank" |
| `slow` | every answer arrives just before the probe gives up | "discovery times out on my wifi" |
| `office-printer` | an HP OfficeJet: IPP on 631 and a web UI, no receipt endpoints | "my office printer is in the list" |

## Library API

`lib.mjs` runs a scenario in-process on ephemeral ports (mDNS off), so tests can start several
at once. `packages/printer/src/__integration__/` drives the real identify/print code at it.

```js
import { createVirtualPrinter } from '@wcpos/virtual-printer/lib.mjs';

const printer = await createVirtualPrinter({ scenario: 'secure-printing' });
// printer.ports  → { raw, http, https, ipp }  (null when the scenario has no such lane)
// printer.jobs   → everything it was asked to print: { lane, bytes|xml, held, at }
// printer.events → every request the app made, including ones that printed nothing
await printer.close();
```

`held: true` means the printer took the job and did nothing with it — the Secure Printing
failure that looks like success from the app's side. `events` is what proves a negative, e.g.
that raw 9100 was never touched on an Epson.

The HTTPS scenarios generate a self-signed certificate at runtime with `node:crypto`
(`self-signed-cert.mjs`) — no openssl, nothing checked in, and an untrusted chain by design,
which is exactly what a Secure Printing Epson presents.

## What it simulates

| Surface | Exercises | Verify |
| --- | --- | --- |
| mDNS `_pdl-datastream._tcp` on :9100 | Electron network **discovery** | `dns-sd -B _pdl-datastream._tcp` |
| TCP :9100 | Electron + native raw **print** | `printf '\x1b\x40hi' \| nc localhost 9100` |
| HTTP `:8008/cgi-bin/epos/service.cgi` | Epson web **discovery** (`probeVendor`) + web **print** | `curl -i http://localhost:8008/cgi-bin/epos/service.cgi` |
| HTTP `:80/StarWebPRNT/SendMessage` with `VP_VENDOR=star` | Star WebPRNT web **print** over plain HTTP | `curl -i http://localhost/StarWebPRNT/SendMessage` |

## Not simulated (test on real hardware)

USB, Bluetooth, and the native Epson/Star **SDK discovery** protocols — see the design spec
(`docs/superpowers/specs/2026-05-22-printer-discovery-connection-design.md`).

## Notes

- Epson ePOS is normally on **8008**.
- Star WebPRNT is normally on **80** for plain HTTP and **443** for HTTPS.
- In dev the web app is often served over `http://localhost`, so there is no mixed-content or
  Local Network Access prompt. Use an HTTPS-served POS page to test the Chromium LNA prompt.
