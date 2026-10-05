# WCPOS Monorepo

React Native + Expo cross-platform POS client app.

## Local Agent Configuration

Coding standards live in `CODING_STANDARDS.md`; `/code-review` enforces them on the diff. They are not repeated here.

This repository keeps project-specific agent configuration local to the repo:

- `CLAUDE.md` — project overview and shared local agent policy.
- `AGENTS.md` — Codex/agent entrypoint and local discovery instructions.
- `.claude/rules/*.mdc` — local project rules.
- `CODING_STANDARDS.md` § Design — **must-read before any UI work** (screens, components, `global.css`, mockups, UI review); `.claude/rules/design.mdc` is the pointer that loads for UI files.
- `.claude/skills/*/SKILL.md` — local project skills.

Do not move these local rules or skills to global `~/.claude`, `~/.codex`, or other global agent configuration without explicit user approval.

Before substantial work, agents should read the local rules and discover local skills. If the user names a skill, check `.claude/skills` before falling back to global skill directories.

## Wiki

Architecture, product and operations docs live in the [WCPOS wiki](https://github.com/wcpos/wiki) (`wcpos/wiki`, private). It is **not** vendored in this repo — the wiki changes daily, so a pinned copy goes stale fast; always read a fresh copy.

- **Local agents** (on Paul's machine): read from the sibling clone at `/Users/kilbot/Projects/wiki`, but pull first — the clone can be stale:

  ```bash
  git -C /Users/kilbot/Projects/wiki pull --ff-only
  ```

- **Cloud/CI agents** (no sibling clone): fetch specific pages fresh via `gh api repos/wcpos/wiki/contents/<path> -H "Accept: application/vnd.github.raw"`, or `https://raw.githubusercontent.com/wcpos/wiki/main/<path>` if you have a token (the repo is private, so unauthenticated raw fetches fail).

Start with `INDEX.md` at the wiki root — one line per page — then fetch only the pages you need.

Relevant wiki pages (paths relative to the wiki repo root):

- `product/overview.md` — what WCPOS is, business context
- `architecture/client.md` — React Native app architecture, state management, data flow
- `product/features.md` — feature inventory (free vs Pro)
- `product/personas.md` — user personas and design implications

## Native E2E: dev client + Metro — builds are rare and cost real money

The `E2E Native` workflow (Maestro; phones on PRs that touch its inputs, all
four devices on every push to `main`) drives the `development`-profile **dev
client** — the same build developers use — and the JS under test comes from
**Metro on the test runner**, bundling the checked-out revision
(`expo start --no-dev --minify`). The dev client contains no JS, so
**JS-only changes never need a build**: every run tests the checked-out commit
for free. An EAS build happens only when `npx @expo/fingerprint` moves — native
deps, config plugins, app config, native code — historically once or twice a
month.

**Before writing or diagnosing a flow, read `apps/main/.maestro/README.md`.**
It holds the flow-authoring rules, the green baseline, every known failure
class with its signature and handling, and the tripwire scripts.

Builds that do happen are metered: $2 iOS / $1 Android against a $45/month
credit **shared with release builds** (Expo Starter plan; the Free plan's hard
limit is the same 15 + 15). History: nine ad-hoc dispatches on 2026-08-27/28
bought nine build pairs in sixteen hours verifying fixes one commit at a time.

- **Do not dispatch `e2e-native.yml` with `build=true` without asking the
  owner.** A dispatch defaults to `build=false` and fails fast on a cache miss
  instead of spending; a miss means the NATIVE fingerprint moved, which is
  rare and worth a human look anyway.
- Changes to the workflow, `apps/main/.maestro/**`, the seed script, or ANY
  app JS/TS need no build — dispatch freely, it runs from cache.
- When a native change genuinely needs a build, pass `platform=ios` or
  `platform=android` if only one platform is affected ($1–$2, not $3).
- Local runs are identical to CI: install the dev client, `npx expo start` in
  `apps/main` (Android: `adb reverse tcp:8081 tcp:8081`), then
  `maestro test apps/main/.maestro`.

## Mobile OTA lane (EAS Update)

Mobile release channels are `production` (store) and `adhoc` (internal).
Ship JS-only patches with `publish-mobile-update.yml` at the release SHA.
Updates reach only binaries with a matching fingerprint runtime version.
`apps/main/fingerprint.config.js` skips version fields so patch releases keep
the runtime version stable; it must not be removed. Native inputs still feed the hash.
A fingerprint move (native dep, config plugin, app config, native code) needs
`build.yml` instead: a store submit for `production`, a new internal build for `adhoc`.
The release train decides with
`eas fingerprint:compare --build-id <shipped build of that platform and profile>`
(adhoc builds carry plugins production does not, so compare like with like).

CI sets `EAS_BUILD_PROFILE` to match `--profile`; the CLI does not set it locally. Laptop users must do the same from `apps/main`:
`EAS_BUILD_PROFILE=development eas build --profile development`.
Use `adhoc` or `production` in both places for those profiles.

**Historical only — shipped 1.10.16 production baseline:** these binaries included
version fields in their hashes and can never receive updates from this OTA lane.
The first OTA-capable cohort is the first store build made after the fingerprint
config change. When it ships, record its per-platform `.runtime.version` here
using `eas build:view <build-id> --json` from `apps/main`, not a local fingerprint.

| Platform | Build ID | Runtime version |
| --- | --- | --- |
| Android | `2c2a5601-5db5-44ea-abaa-aee8be4fe048` | `0aeafa6969b108dab0f4082f117bc8ee488238a5` |
| iOS | `98efef84-0804-4d91-ba9e-92b656b3302f` | `d02402d0a158a9b73e6c6666647eeef5e67a2887` |

There is no single production hash: compare each platform with its shipped build of the same profile before OTA.

**First OTA-capable cohort — 1.10.18 store build from `e962c8b6` (after #2087), run 35059240821.**
This is the baseline every `eas update` on the `production` channel is compared against; a patch
version bump no longer moves it. Read from `eas build:view <build-id> --json`, not a local fingerprint.

| Platform | Build ID | Runtime version |
| --- | --- | --- |
| Android | `247b12c8-4d98-47d2-8f3e-9840666d211d` | `050c0144c106f24ab23db6509c37f998f4c1dddd` |
| iOS | `d650ce31-d233-481f-99dc-edc037e58fab` | `612a275dcc877f7d400f203cd56c0b8f77490683` |

## E2E store-agnostic policy

Orders are created **through the POS UI** (the app stamps the correct cashier/store scope; `order-cleanup.ts` finalizes them); products/customers via the store API with the captured or writer credentials.


The `e2e-product-writer` (shop_manager) identity exists on every dev server with one shared credential pair (`E2E_PRODUCT_WRITER_USER/_PASS` Actions secrets); a new or moved server needs exactly one `wp user create` line and the specs skip-with-reason until it's run.

## Standing rulings

- **Web `multiInstance` is pinned to the storage engine, never set on its own.** On `next` (2.0) the engine is `sqlite-sahpool` and the flag is `false` with one live tab per origin (#2242, #2271); on `main` (1.10.x) the engine is `opfs-filesystem` and the flag is `true` (#1057). The pair is enforced by `multi-instance-ruling.test.ts`; change both halves or neither, and never backport one lane's flag to the other. Read the Decision section of `packages/database/src/adapters/default/README.md` first.

## Branch lanes

This repo has two permanent trunks:

- **`main`** — the **stable**, released line (1.9.x patches ship from here).
- **`next`** — the **in-development** major/minor (1.10, then 1.11, 2.0 …).

Feature work usually targets `next`; patches to the shipped release target `main`. Never commit directly to either trunk — branch off the correct one in a worktree, and target the PR's base at the same lane. **If it isn't clear which lane a task belongs to, ask "main or next?" before branching, pulling (`git pull origin <lane>`), or opening a PR — don't default to `main`.**

### Web bundle ref per lane (jsDelivr)

The WordPress plugin loads the POS JS/CSS from `https://cdn.jsdelivr.net/gh/wcpos/web-bundle@<ref>/build/`. There is exactly **one ref per lane, named after the lane** (owner ruling, 2026-09-04):

- **`next` lane → `@next`** — `https://cdn.jsdelivr.net/gh/wcpos/web-bundle@next`. The `next` _branch_ of `wcpos/web-bundle` **is** the dev lane's tag; there is no versioned or prerelease tag for `next`, and nobody should ask for one. Publishing it deploys the page: `gh workflow run publish-web-bundle.yml --ref main -f monorepo_ref=next -f bundle_branch=next -f override_release_gate='I accept a red main'` (a branch name or a FULL SHA; the checkout step rejects a short SHA). `dev-next.wcpos.com` reads `@next` (`WCPOS_WEB_BUNDLE_REF=next` in its `wp-config.php`).
  - **The storage worker is not in the bundle.** The plugin serves `sqlite.worker.js` (`Frontend.php` hands the app `opfsWorker`), and on dev-next the active plugin is **woocommerce-pos-pro**, whose *vendored copy* of the free plugin is what the page loads — the free plugin dir there is inactive and its own deploy changes nothing. When `apps/main/public/sqlite.worker.js` changes (an rxdb bump), the bundle boots against a stale worker and every tab fails with `RxDB RM1 mainVersion X remoteVersion Y` → "Failed to create user database". The order is: (1) re-vendor the worker in `wcpos/woocommerce-pos` `next` (`assets/js/sqlite.worker.js`, byte-identical to `web-bundle@next`'s), merge; (2) `gh workflow run deploy-dev.yml --repo wcpos/woocommerce-pos-pro --ref next` (Pro runs `composer update` against free `dev-next` at build time); (3) verify by fetching the worker URL the POS page emits, not the free plugin's path. The publish workflow's last step checks dev-next for exactly this and names the two deploys when it fails.
- **Released lane → `@<major.minor>`** — e.g. `@1.10` today, and `@1.11` once `next` moves to `main`. The plugin derives that ref from its own version, and the release train cuts the tag; `publish-web-bundle.yml` never does.
- Publishing to the web-bundle `main` _branch_ is staging only. It moves nothing a released plugin loads.
