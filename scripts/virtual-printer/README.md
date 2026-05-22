# Virtual Printer (dev tool)

A fake network printer for developing/testing WCPOS printer **discovery and printing**
without hardware. It contains no WCPOS app code and the app is never aware it is fake.

## Run

```bash
pnpm virtual-printer
```

Environment overrides: `VP_NAME` (advertised name; include "Epson"/"Star" to drive vendor
inference), `VP_RAW_PORT` (default 9100), `VP_HTTP_PORT` (default 8008).

## What it simulates

| Surface | Exercises | Verify |
|---|---|---|
| mDNS `_pdl-datastream._tcp` on :9100 | Electron network **discovery** | `dns-sd -B _pdl-datastream._tcp` |
| TCP :9100 | Electron + native raw **print** | `printf '\x1b\x40hi' \| nc localhost 9100` |
| HTTP `:8008/cgi-bin/epos/service.cgi` | Web **discovery** (`probeVendor`) + web **print** | `curl -i http://localhost:8008/cgi-bin/epos/service.cgi` |

## Not simulated (test on real hardware)

USB, Bluetooth, and the native Epson/Star **SDK discovery** protocols — see the design spec
(`docs/superpowers/specs/2026-05-22-printer-discovery-connection-design.md`).

## Notes

- Epson ePOS is on **8008** (unprivileged). The Star WebPRNT path is served on the same port;
  matching it as Star via the default web sweep needs port **80** (privileged) — run with
  `VP_HTTP_PORT=80` and elevated privileges if you specifically need the Star path.
- In dev the web app is served over `http://localhost`, so there is no mixed-content block.
