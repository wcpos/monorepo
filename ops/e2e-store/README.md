# Lane-`next` web E2E store on the Mac mini (#2321)

A WordPress + WooCommerce + WCPOS store for the lane-`next` web E2E suite, in
Docker on the Mac mini. It is reachable **only on the tailnet**:

    https://claudes-mac-mini.tail6a20e3.ts.net:8443/

It replaces `dev-next.wcpos.com` (on the production VPS) as the E2E target, so
test load stays off the box that runs the business. The plan is
`~/agent/handoff/plan-e2e-store-on-mini-2026-09-30.md` (option C).

## What runs

| Piece | Detail |
|---|---|
| colima profile `e2e-store` | 4 CPU / 4 GiB / 30 GiB, vz + virtiofs, shares only `~/e2e-store`. The `default` profile is untouched. |
| `e2e-store-nginx` | `nginx:1.27-alpine`, 0.5 CPU / 128 MiB, bound to `127.0.0.1:18443` only |
| `e2e-store-php` | `wordpress:php8.3-fpm`, 3 CPU / 2 GiB, `pm.max_children = 20` |
| `e2e-store-db` | `mariadb:11.4`, 1.5 CPU / 768 MiB, 384 MiB buffer pool |
| `tailscale serve --https=8443` | TLS (MagicDNS cert) → `http://127.0.0.1:18443`, tailnet only, never Funnel |
| `com.kilbot.e2e-store-start` | launchd, RunAtLoad: `start.sh` after a reboot or login |
| `com.kilbot.e2e-store-reset` | launchd, 03:17 local nightly: `reset.sh` |

The memory caps fit inside the VM, and the CPU caps oversubscribe it on
purpose; `compose.yaml` has the arithmetic.

No script creates the `:8443` serve entry. After `uninstall.sh` (which removes
it) or on a new machine, recreate it with exactly this, and never with
`tailscale funnel`, which would publish the store to the internet:

    tailscale serve --bg --https=8443 http://127.0.0.1:18443

State lives under `~/e2e-store/`, never in this repo:

    ops/        installed copy of this directory (what launchd and colima use)
    plugins/    WooCommerce + WCPOS plugins, mounted read-only
    catalogue/  dev-next Store API export the seed rebuilds from
    data/       mysql/ and uploads/
    snapshot/   db.sql.gz, uploads.tar.gz, SNAPSHOT (what reset restores)
    logs/       start.log, reset.log

## Use

Run `install.sh` from the repo once, and again after changing this directory.
Everything else runs from the installed copy:

    ops/e2e-store/install.sh             # copy to ~/e2e-store/ops, load both agents (starts the store)
    ~/e2e-store/ops/fetch-plugins.sh     # newest `next` deployment-package of each WCPOS plugin + WooCommerce
    ~/e2e-store/ops/fetch-catalogue.sh   # read-only GETs of dev-next's public Store API
    ~/e2e-store/ops/seed.sh              # idempotent: install, activate, settings, taxes, catalogue, users
    ~/e2e-store/ops/snapshot.sh          # after any seed you want to keep
    ~/e2e-store/ops/reset.sh             # restore the snapshot (nightly by launchd)
    ~/e2e-store/ops/smoke.sh             # tailnet reachable, internet not, cashier login round-trip
    ~/e2e-store/ops/wp.sh <args>         # WP-CLI against the store
    ~/e2e-store/ops/start.sh             # start colima profile + stack
    ~/e2e-store/ops/uninstall.sh [--purge]

**Plugins** come from each repo's CI `deployment-package` artefact on `next`,
the same bits dev-next runs; nothing is built on the mini. When
woocommerce-pos-pro's artefact is present, `seed.sh` activates Pro alone (Pro
2.x bundles the free plugin and deactivates a standalone copy), sets the
test-only licence flag (below) and creates the three WCPOS stores. After a
plugin update, `docker restart e2e-store-php` (or wait 60 s) clears opcache.

**Seeded data**: dev-next's catalogue shape (simple, variable, grouped and
external products, variations, categories, SKUs, prices, stock) minus its E2E
probe leftovers, with placeholder images; GBP with `,` decimals; prices include
tax; GB VAT 20% + compound 2% surcharge, US:AL state + two compound rates, AU
GST 10%; the suite's `tax-class-fixtures.php`; three coupons; 75 customers.
Store ids differ from dev-next's: specs discover them from the cashier API
(globalSetup writes `stores-pro.json`).

`seed.sh`, `reset.sh` and `snapshot.sh` take one lock,
`~/e2e-store/.store.lock` (a `mkdir` lock with the holder's pid), so their
WP-CLI runs never overlap: a second run waits up to 30 minutes, and a lock
whose holder died is removed.

## Test-only Pro licence flag

**What.** `seed/pro-licence.php` sets `activated => true` in Pro's licence
option, `woocommerce_pos_pro_settings_license`, and leaves `key` empty. No
licence key is read, stored or sent, and nothing contacts the licence server.

**Why.** Pro 2.x starts its Stores service (the `wcpos_store` post type and the
filters that list stores to the cashier API) only while that flag is true
(`includes/Init.php`, `LicenseSettings::is_activated()`); without it the
cashier sees only the default store and the pro multi-store specs cannot see
the seeded ones. Pro has no development or test constant that forces the
licence, so the seed sets the option (owner's ruling, 2026-09-30).

**Scope.** Local to this tailnet-only test store, which runs Paul's own
plugin. `seed.sh` sets it after activating Pro, and `reset.sh` re-applies it
after a restore (so an older snapshot cannot drop it); both are no-ops when the
flag is already set. `smoke.sh` fails when Pro is active and the cashier API
lists fewer than 3 stores.

**Remove.** Delete the `pro-licence.php` lines from `seed.sh` and `reset.sh`,
reinstall, then clear the flag and take a new snapshot:

    ~/e2e-store/ops/wp.sh option patch update woocommerce_pos_pro_settings_license activated false --format=json
    ~/e2e-store/ops/snapshot.sh

## Credentials

Generated by `seed.sh`, stored only in the login keychain, service
**`wcpos-e2e-store`**, account = username:

- `e2e-cashier-1` … `e2e-cashier-16`: one shared password (the suite reads a
  single `E2E_CASHIER_PASS`);
- `e2e-product-writer` (shop_manager);
- `e2e-admin` (administrator, for debugging in wp-admin).

`demo` / `demo` (cashier) is the free variant's built-in default login
(`fixtures.ts`), as on dev-next. `seed.sh --rotate-passwords` regenerates all
generated passwords; update the GitHub secrets afterwards. A new password goes
into the keychain first (fed to `security -i` on stdin, never on a command
line) and into WordPress only after that succeeds, so a failed keychain write
leaves WordPress unchanged and the next `seed.sh` retries. A failed
`--rotate-passwords` must be rerun **with** `--rotate-passwords`: WordPress
still holds the old passwords, so a plain rerun sees every group as set and
does not reconcile the keychain items that were already overwritten.

## Needs Paul (Tailscale admin console, GitHub settings)

1. A `tag:ci` OAuth client (Devices: write), stored in the monorepo as
   Actions secrets `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET`.
2. ACL grant: `tag:ci` → `claudes-mac-mini:8443`, and nothing else.
3. Actions secrets for this store, from the keychain above, under NEW names:
   `E2E_MINI_CASHIER_PASS` and `E2E_MINI_PRODUCT_WRITER_PASS` (the writer user
   is `e2e-product-writer`, as everywhere). The existing `E2E_CASHIER_PASS` /
   `E2E_PRODUCT_WRITER_PASS` also serve lane `main` (dev-pro) in
   `deploy.yml`, so overwriting them would break `main`; the CI PR maps the new
   names onto the env vars the suite reads, for lane `next` only.

The CI change (a `tailscale/github-action` step and the lane-`next` store URL)
is a separate PR.
