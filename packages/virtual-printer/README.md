# Virtual Printer (dev tool)

A fake network printer package for developing/testing WCPOS printer **discovery and printing**
without hardware. It contains no WCPOS app code and the app is never aware it is fake.

## Run

From the monorepo root:

```bash
pnpm virtual-printer
```

Or directly:

```bash
pnpm --filter @wcpos/virtual-printer start
```

Environment overrides:

| Variable | Default | Notes |
| --- | --- | --- |
| `VP_NAME` | `Virtual WCPOS Printer` | Advertised mDNS name. Include `Epson`/`Star` if testing vendor-name inference. |
| `VP_VENDOR` | `both` | `both`, `epson`, or `star`. `star` exposes only WebPRNT; `epson` exposes only ePOS. |
| `VP_RAW_PORT` | `9100` | Raw TCP print port for Electron/native testing. |
| `VP_HTTP_PORT` | `8008`, or `80` when `VP_VENDOR=star` | HTTP endpoint port. Explicit value always wins. |

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
