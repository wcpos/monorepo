# Handoff: get the web POS first paint under 1 MB

**Date:** 2026-10-16
**Lane:** `next` (plugin 2.0). Nothing here touches `main`.
**Owner:** Paul Kilmurray. Written by a Claude session after the CDN brainstorm; the
numbers below were measured on the published `web-bundle@next` build that day.
**Related:** `wcpos-infra/docs/specs/2026-10-16-cdn-delivery-control-plane-design.md`
(the delivery side; it does not depend on this work and this work does not depend on it).

## The goal in one sentence

Everything a cashier needs to see the POS screen and ring a sale should arrive in one
chunk of **≤ 1 MB brotli**, and everything else should stream in behind it from
separate chunks that load on first use.

## Where the bundle is today

| Measurement (web-bundle `next`, 2026-10-16) | Value |
|---|---|
| Entry chunk `_expo/static/js/web/entry-*.js`, raw | 14.5 MB |
| Entry chunk, brotli (what the browser downloads) | 3.4 MB |
| Entry chunk, gzip | 3.6 MB |
| Next-largest JS chunk | 0.2 MB (`index-*.js`, a handful of these exist) |
| Whole `build/` directory, raw, 110 files | 18.1 MB |
| Lazy boundaries in `apps/main` and `packages/` | **two**: `components/health/trend-line.web.tsx` imports `./trend-line-chart` on demand, and `components/root-error.tsx` imports `@wcpos/database/clear-all-db`. No `React.lazy` anywhere. |
| `zxing_reader.wasm` (barcode) | 0.94 MB, already a separate asset |
| `sqlite3.wasm` + `sqlite.worker.js` | 0.85 MB + 0.3 MB, separate, served by the plugin |
| `Inter-Medium.ttf` | 387 KB, **bundled twice** under two asset paths |
| `global-*.css` (Tailwind via uniwind) | 105 KB |

The shape is the problem, not the total: one chunk carries the whole app, so nothing
renders until 14.5 MB has downloaded, parsed and compiled. On a desktop that is one to
two seconds of compile; on a cheap Android tablet or an older iPad it is five to ten.
The small `index-*.js` chunks are those two dynamic imports: Metro already splits
`import()` in this config and the chunks already load through the plugin loader from
the CDN base, which is the mechanism to build on.

## How the bundle reaches the browser (so you know what you may change)

- Built by `expo export --platform web` from `apps/main` (on `next`: Expo `~58.0.8`,
  React `19.3.0`, React Native `0.88.0-rc.4`, react-native-web, Metro with a custom
  config at `apps/main/metro.config.js`; read the SDK 58 docs, not older ones).
  The `apps/web` submodule is the `wcpos/web-bundle` repo; `pnpm web build` wraps the
  export. CI: `.github/workflows/publish-web-bundle.yml`.
- The free plugin's page (`woocommerce-pos/includes/Templates/Frontend.php`) fetches
  `metadata.json` from the CDN and injects the CSS and the scripts it lists. The loader
  **already supports a `bundles` array** (v1 metadata: "metro runtime, common, entry")
  and loads them in order, so splitting the entry into a runtime + vendor + app set
  needs no plugin change as long as `metadata.json` lists them.
- Lazy chunks are fetched by Metro's runtime from `cdnBaseUrl` with leading-slash
  paths. The plugin comment about the trailing slash is load-bearing: jsDelivr
  301-redirects `//` with a year-long cache, which breaks every lazy chunk. Keep the
  convention.
- The same export, with `ELECTRON=true`, is the desktop app's bundle. Electron has a
  CSP that blocks jsDelivr, which is why `zxing-wasm` is a local asset. Any lazy-load
  path you add must work when `cdnBaseUrl` is the app's own origin.
- `metro.config.js` carries a resolver that forces `rxdb` and `rxdb-premium` to their
  ESM builds so there is exactly one module instance of each. Metro chunks share one
  module registry, so splitting does not duplicate modules, but do not touch that
  resolver and do verify after splitting that `RXDB_UTILS_GLOBAL` is still a single
  object (the comment in the file explains the failure).
- There is a custom serializer wrapper, `apps/main/metro/bundle-serializer-cache.js`.
  Check whether it assumes a single output bundle before relying on `import()` splits.

## Suspects for the 14.5 MB (verify with the measurement step; do not trust this list)

Dependencies in `apps/main/package.json` and the workspace packages that are large and
not needed to draw the POS screen:

- **Charts:** `victory-native` + `@shopify/react-native-skia`. Skia on web also pulls
  `canvaskit-wasm` (loaded from jsDelivr npm at runtime by
  `apps/main/components/health/trend-line.web.tsx`). Only `reports/` and `health/` use
  charts.
- **Receipts and printing:** `@wcpos/receipt-renderer`, `@wcpos/printer`,
  `@wcpos/virtual-printer`, `expo-print`, `react-native-esc-pos-printer`,
  `react-native-star-io10`. Only needed when a receipt is rendered or printed.
- **Hardware integrations:** `@stripe/stripe-terminal-react-native`,
  `react-native-ble-plx`, `react-native-webrtc`, `react-native-tcp-socket`. Check what
  their web shims cost; some ship real code on web. **Not `@wcpos/scanner`**: `AppStack`
  mounts `ScanHubProvider` around the POS and the product screen uses it for wedge, HID,
  serial, camera and BLE scanning, so barcode entry is on the ring-a-sale path and stays
  eager.
- **Translations:** `packages/core/src/contexts/translations/locales/en/core.json` is
  bundled and installed synchronously as the `fallbackLng: 'en'` resource in
  `packages/core/src/contexts/translations/index.tsx`; the CDN-backed `RxDBBackend`
  returns `{}` when the CDN and cache are both unavailable. **English stays eager**: it
  is the guarantee that a cold offline start renders text at all. The only legitimate
  savings here are stripping keys the app no longer uses and making sure the JSON is
  not duplicated into other chunks.
- **Settings, health, support, gallery, coupons, customers, orders, products** route
  groups (see `apps/main/app/`): every route module is statically imported by
  expo-router on web unless made async, so all of them sit in the entry today.
- **`lodash`**, date libraries, icon sets, `react-native-reanimated`,
  `react-native-gesture-handler`: measure before judging.

## Plan

### 0. Measure first (the first deliverable is a table, not a diff)

Build locally with source maps (`npx expo export --platform web --source-maps external
--output-dir <dir>`) and produce a composition table of the entry chunk by package and
by workspace package. `source-map-explorer` on the exported bundle plus its map is
enough. Commit the script
under `scripts/` so the table can be regenerated, and attach the first table to the PR.
Decisions below should be re-ordered by what that table says.

Memory note for this machine: one build at a time, cap test workers at 2, and set
`NODE_OPTIONS=--max-old-space-size=6144` for the export if it OOMs.

### 1. Confirm the split path end to end

`import()` already splits here (see the two existing boundaries), so this step is a
check, not an experiment: add one `React.lazy(() => import(...))` around a **merchant**
route that the deployed app can navigate to (the `support` or `health` group; not the
gallery, which merchant builds resolve to `registry.stub.tsx` and never mount), export
for web, and confirm the new chunk appears in `_expo/static/js/web/`, loads in a
browser from the CDN base URL, **and loads in the Electron build from its own origin**. The Electron half is the one nobody has exercised with a route-level
chunk; the health chart is the only lazy chunk that ships today.

### 2. Cut the boundaries

Behind lazy boundaries, in rough order of payoff:

1. Route groups that are not the POS screen: `reports`, `health`, `settings`,
   `support`, `gallery`, `coupons`, `customers`, `orders`, `products`, and the
   `(auth)` connect flow after login. Keep `(pos)` eager. expo-router on web does not
   do this for you in production; the boundary lives in each group's `_layout.tsx` or
   in the screen component it renders.
2. Charts and skia/canvaskit: only inside the lazy reports/health chunks.
3. Receipt **preview** in order history (`orders/(modals)/receipt`, `orders/(modals)/view`)
   can be lazy. Checkout receipt rendering and printing cannot: the checkout
   `ReceiptStageDocument` calls `useReceiptDocument({ autoPrintAllowed: true })` and
   "New Sale" stays disabled while `autoPrintPending` is true, so for a store with
   auto-print on, a lazy chunk here would block the first sale on a cold or offline
   start. The renderer and the print path used by `(pos)/(modals)/cart/receipt` and
   checkout stay in the eager set.
4. Hardware integrations: lazy on first use from the settings pages that enable them.
5. Translations: keep English eager (see above); verify no other locale's JSON is
   bundled, and prune unused English keys.
6. Fonts: emit Inter once. Two asset paths point at identical bytes.

Rule for every boundary: nothing a cashier touches between "page open" and "sale
complete" goes behind one. Cart, product search, checkout, payment, the receipt
renderer and the print path used at checkout are eager. Only receipt *preview* from
order history is a candidate, and the measurement table decides it.

### 3. Shape the eager set

After step 2 the entry should be: Metro runtime + React/react-native-web + rxdb +
database/query/sync packages + the POS screens + English strings + the checkout
receipt path. If that is still over 1 MB brotli, the only moves that count are
removing modules or adding further lazy boundaries: rxdb-premium plugins the POS
screen does not use, reanimated and gesture-handler if the POS screen can do without
them, icon sets, and the web shims of the hardware integrations. A vendor/app split
does **not** reduce the eager set, because the cold-cache test still downloads and
compiles both files; it is worth doing separately for cache reuse across releases, and
it must be reported as that, never as a budget win. Do not go below what the POS needs
to be interactive offline; the point is first paint, not a smaller number.

### 4. Preload what comes next

Metro's runtime fetches a lazy chunk when the import executes. For the common path
(POS → checkout → receipt) add preload hints after first paint so the next chunk is
warm before it is needed: a small `requestIdleCallback` that calls the lazy importers
is enough and needs no Metro changes.

### 5. Keep it under budget

Add a CI check to `publish-web-bundle.yml` (and to the monorepo PR checks if the export
is cheap enough) that fails when the brotli size of the eager set exceeds **1 MB** and
reports the top-20 composition diff against `next`. Without this the number drifts back
within a quarter.

### 6. Measure on real hardware

Record time-to-interactive on the POS screen before and after on one cheap Android
tablet and one older iPad, from a cold cache, through the actual plugin loader on
dev-next. Those two numbers are the result; the byte counts are the means.

## Done when

- Eager set ≤ 1 MB brotli as measured by the CI check, on `next`.
- POS screen interactive with the lazy chunks still loading; a sale can be rung without
  any lazy chunk having arrived.
- Electron build still works with lazy chunks from its own origin.
- Reports, settings, receipts, and every other lazy group load on first use with no
  visible breakage, and the composition table is committed with a regeneration script.
- Both real-hardware numbers improved and are recorded in the PR.

## Do not

- Swap bundlers. Metro is the bundler for native too, and the web export must stay one
  pipeline with Electron.
- Touch the rxdb resolver in `metro.config.js`, or introduce a second rxdb instance.
- Add env vars for budgets or chunk lists; they are named constants in the check script.
- Lazy-load anything on the ring-a-sale path to hit the number.
- Change the plugin loader's URL conventions (leading-slash paths, no trailing slash).

## Open questions for the implementer to answer in the PR, not here

- What does the Electron CSP allow for chunk loading from the app origin? (Step 1,
  Electron half.)
- Is `canvaskit-wasm` better vendored as a local asset like `zxing-wasm` so Electron and
  the future own-origin CDN serve it without jsDelivr? Probably yes; it is a separate
  small PR.
