# WCPOS Monorepo

React Native + Expo cross-platform POS client app.

## Local Agent Configuration

This repository keeps project-specific agent configuration local to the repo:

- `CLAUDE.md` — project overview and shared local agent policy.
- `AGENTS.md` — Codex/agent entrypoint and local discovery instructions.
- `.claude/rules/*.mdc` — local project rules.
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

## Native E2E builds cost real money

The `E2E Native` workflow (Maestro) runs against EAS builds of the `e2e-test`
profile. **Every dispatch on a commit that has never been built buys a new
build** — roughly $12 for iOS and $7 for Android against a $45/month allowance.
Nine ad-hoc dispatches verifying native fixes on 2026-08-27/28 took the month
past 40% in its first week.

- **Do not dispatch `e2e-native.yml` to verify a fix without asking the owner.**
  The nightly at 03:00 already covers `main`; a fix landing today is tested
  tonight for free.
- A dispatch now defaults to `build=false` and **fails fast rather than
  spending**. Re-running the suite against an already-built commit is free.
- When a build genuinely is warranted, pass `platform=ios` or `platform=android`
  if only one is affected. Most native fixes are one-platform; paying for the
  pair is the exception, not the default.
- Batch fixes into one commit before building. Seven dispatches for seven
  commits cost seven times what one dispatch after the last one would have.

## E2E selector policy

E2E tests must use stable `testID` selectors for app UI. Do not use localized UI text as selectors: no `getByText`, no `getByPlaceholder`, no `getByLabel`, and no `getByRole(..., { name })` in `apps/main/e2e`. If a UI element needs to be exercised by E2E, add a stable `testID` to the component and select it with `getByTestId()`. (Reading a testID-addressed cell's `textContent` is fine; *selecting* by text is not.)

**Assertions follow the same referent discipline.** Never assert on a composite or translated sentence when a value-bearing testID exists: `data-table-count` renders `Showing {shown} of {total}`, so a digit regex on it (`/[1-9]/`, `/\b1\b/`) matches the SERVER total and passes on an empty grid — the exact failure that let a dead scope database pass readiness on 2026-08-19 (#1336, #1345). Assert `data-table-loaded-count` (the rendered-row count on its own; `display:none`, so use text assertions, not visibility). Where a composite string deliberately IS the referent (e.g. probing the server total), say so in a comment naming which constituent is being read.

## E2E store-agnostic policy

E2E specs must pass against **any** store — never against one store's remembered contents. A spec that hardcodes a product name, an order number, or a customer that "should exist" is deterministically wrong the day the store drifts, and it reads as a product regression (this cost a full diagnosis loop on 2026-08-07).

- **Create-and-find is the primary pattern.** A spec that needs data creates its own record with a unique probe token (single alphanumeric word, ≥ 3 chars for the search tokenizer — see `mintSearchProbeToken` in `apps/main/e2e/search-probe.ts`), acts on it, and asserts on *that* record. This also exercises the full pipeline: server write → sync demand → materialization → rendered row. Orders are created **through the POS UI** (the app stamps the correct cashier/store scope; `order-cleanup.ts` finalizes them); products/customers via the store API with the captured or writer credentials.
- **No fixture-content assumptions.** Never assert absolute row counts, other records' names/ids, or hidden-column values. Count assertions are relative; row assertions target the probe's id-bearing testID.
- **Declared-missing environment is a skip; broken environment is a failure.** Zero rows in scope, or a capability the environment never claimed (no writer credentials configured, the anonymous demo user's known catalog read-only 403) produce `test.skip` with a reason naming exactly what's missing — the spec lights up when the environment provides it. But when the environment *declares* a capability (credentials configured) and the operation still fails (401/403/500), that is a **test failure**, not a skip — otherwise an auth or creation regression turns CI green while the covered behavior silently goes untested.
- **Both permalink styles.** Any direct REST call must tolerate pretty (`/wp-json/...`) and plain (`?rest_route=...`) permalinks — see `probeRequest` in `search-probe.ts`.
- **Infra identities are keyed by well-known username, never server-specific ids.** The `e2e-product-writer` (shop_manager) identity exists on every dev server with one shared credential pair (`E2E_PRODUCT_WRITER_USER/_PASS` Actions secrets); a new or moved server needs exactly one `wp user create` line and the specs skip-with-reason until it's run.
- **Leftover probe records on dev stores are acceptable** (owner ruling, 2026-08-07): unique per-run tokens make past probes invisible to future runs; delete in teardown only best-effort, never letting teardown fail a test.

## Branch lanes

This repo has two permanent trunks:
- **`main`** — the **stable**, released line (1.9.x patches ship from here).
- **`next`** — the **in-development** major/minor (1.10, then 1.11, 2.0 …).

Feature work usually targets `next`; patches to the shipped release target `main`. Never commit directly to either trunk — branch off the correct one in a worktree, and target the PR's base at the same lane. **If it isn't clear which lane a task belongs to, ask "main or next?" before branching, pulling (`git pull origin <lane>`), or opening a PR — don't default to `main`.**
