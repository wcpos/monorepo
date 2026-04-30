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

Preview image output defaults to `apps/template-studio/gallery-previews` for this PR. Set `WCPOS_GALLERY_PREVIEW_DIR=/path/to/woocommerce-pos/packages/template-gallery/src/assets/previews` when copying generated assets into the plugin gallery UI.
