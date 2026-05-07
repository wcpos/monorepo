# WCPOS Template Studio

Local tuning harness for bundled/gallery receipt templates.

## Commands

- `pnpm dev` — run the Vite studio. Edit `woocommerce-pos/templates/gallery/*` and refreshes are hot-reloaded by Vite.
- `pnpm test:snapshots` — check the curated template/fixture goldens.
- `pnpm test:snapshots -- --update` — refresh curated goldens after an intentional renderer/template change.
- `pnpm generate:gallery-previews` — generate committed PNG gallery previews for bundled/gallery templates only.
- `pnpm check:gallery-previews` — fail if generated previews are stale.

The studio reads the sibling plugin checkout from `../../../woocommerce-pos` by default when run from this app directory, which resolves to a checkout beside `monorepo-v2`:

```bash
cd /path/to/monorepo-v2/apps/template-studio
pnpm dev
```

Override with `WCPOS_PLUGIN_ROOT=/path/to/woocommerce-pos` when you want Studio to read templates from a different plugin checkout or worktree:

```bash
WCPOS_PLUGIN_ROOT=/path/to/woocommerce-pos/.worktrees/template-tuning pnpm dev
```

The Vite dev server proxies `/wp-json` to `WCPOS_STUDIO_WP_URL` (default `http://localhost:8888`) and injects `X-WCPOS: 1`; browser requests keep cookie auth with `credentials: 'include'`.

## Real store data and print testing

Use the Store URL, Template ID, and Order ID fields to load real preview payloads from an allowed WCPOS store. The Studio dev server fetches `/wp-json/wcpos/v1/templates/{id}/preview` server-side and always sends `X-WCPOS: 1`. Browser cookies are forwarded only to the configured `WCPOS_STUDIO_WP_URL` origin (default `http://localhost:8888`) so arbitrary Store URLs cannot receive local auth cookies. To permit another store origin, start Studio with `WCPOS_STUDIO_STORE_ORIGINS=https://store.example`. Leave Order ID blank for sample preview data, use `latest` for the latest POS order, or enter a specific order ID.

Print testing options:

- **Print dialog** opens a print-sized browser document and calls `window.print()` so macOS/browser can target a desktop thermal-printer simulator.
- **Send raw ESC/POS** sends thermal template bytes to a TCP simulator using the host and port fields, for example `127.0.0.1:9100`. The dev endpoint only accepts loopback browser clients and only targets loopback hosts by default; set `WCPOS_STUDIO_PRINT_HOSTS=127.0.0.1,printer.local` when your simulator uses another hostname. Raw TCP printing is only available for thermal templates because logicless templates are HTML-only.

Thermal previews render barcode and QR nodes through `bwip-js`, matching the barcode library path used for browser preview output instead of placeholder bars.

Preview image output defaults to `apps/template-studio/gallery-previews` for this PR. Set `WCPOS_GALLERY_PREVIEW_DIR=/path/to/woocommerce-pos/packages/template-gallery/src/assets/previews` when copying generated assets into the plugin gallery UI.

## Thermal template column rules

Thermal paper width and printer character capacity are separate settings. An 80mm printer may be configured for 42 or 48 characters per line, and generic printers often use 42 CPL. Template Studio exposes **Characters per line** so raw ESC/POS output can match the target printer or simulator.

Authoring rules for gallery thermal templates:

- Treat 42 CPL as the safe default for generic 80mm templates.
- Use `width="*"` for flexible text columns.
- Reserve fixed widths for quantities and amounts, e.g. qty `5`, amount `12`-`14`.
- Do not create rows whose fixed widths sum to 48 unless the template is explicitly 48-CPL-only.
- Keep long product names as full-width text lines, not table cells beside prices.
- Avoid `<size width="2">` inside multi-column rows; wide text halves effective line capacity.
- Test 80mm templates at 42 and 48 CPL; test 58mm templates at 32 CPL.
