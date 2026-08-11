# docs.wcpos.com stack and the publishing path for error-code pages

Research note for [monorepo#1138](https://github.com/wcpos/monorepo/issues/1138) (map: [#1136](https://github.com/wcpos/monorepo/issues/1136)).
Fact base only — the docs-pipeline grilling ticket makes the decision.

Verified 2026-08-11 against `origin/next` (monorepo, at `a5996be4a`), a fresh clone of `wcpos/docs`, and live probes of `docs.wcpos.com`.

---

## 1. Headline findings

1. **The docs site already has a complete, fully-translated error-code section — for the *wrong* code scheme.**
   `wcpos/docs` carries 64 English pages under `versioned_docs/version-1.x/error-codes/` (59 per-code pages + 4 domain hubs + an index), mirrored into all 11 non-English locales — **768 MDX files total**. They document the **legacy** `API01001` / `DB01001` / `PY01001` / `SY01001` scheme.
2. **The new registry uses a different, incompatible scheme, so nothing behind the new URLs exists.**
   `packages/utils/src/logger/error-registry.json` (`origin/next`) holds **38 codes** in the `SYNC101` / `AUTH201` / `CHECKOUT101` form. Live probe: `https://docs.wcpos.com/error-codes/SY01001` → **200, real page** ("SY01001: Out of Memory"); `https://docs.wcpos.com/error-codes/SYNC101` → **HTTP 404**. Confirms #1136's "no pages exist behind the URLs".
3. **There is no drift gate between the registry and the docs site — none, in either repo.** The monorepo gate is real but stops at its own generated files (§4.2). The docs repo has no knowledge of the registry at all.
4. **The deep-link is not yet load-bearing.** `getErrorCodeDocURL()` is exported but has **no UI consumer** — the logs UI renders `docsBody` in an offline in-app dialog instead (§4.3). The lockstep mandate is therefore currently unenforced *and* unobserved by merchants; that changes the moment a "Learn more" link ships.
5. **Any generation design must feed a 12-locale pipeline and hand-edit a sidebar.** Translation is automated (an external OpenClaw agent, "Aide", triggered by pushes to `main` plus a nightly self-healing sweep) — but **`/error-codes/` pages are explicitly deprioritized in that queue** so hand-written guides translate first, and versioned sidebars are explicitly **not** auto-generated. Bots are blocked from writing `i18n/**` at all (§2.2–2.3).

---

## 2. The docs site: stack facts

| Fact | Value | Source |
|---|---|---|
| Repo | `github.com/wcpos/docs` (public, "User documentation for WooCommerce POS") | `gh repo list wcpos` |
| Framework | **Docusaurus 3.10.2** (`preset-classic`) | `package.json` deps |
| Runtime | Node `>=22.13 <23`, `pnpm@11.1.1` | `package.json` `engines` / `packageManager` |
| Content format | MDX with required frontmatter + explicit heading anchor IDs | `versioned_docs/**/*.mdx`, `.ai/rules/docs.mdc` |
| Hosting | **Vercel** | `vercel.json` (`$schema: openapi.vercel.sh/vercel.json`), `@vercel/edge` dep, `middleware.js` |
| Production branch | `main` | `docusaurus.config.js` `editUrl: 'https://github.com/wcpos/docs/edit/main/'`; repo default branch is `main` |
| Doc versions | `["1.x", "0.4.x"]`; `lastVersion: '1.x'`, **`includeCurrentVersion: false`**, `routeBasePath: '/'` | `versions.json`, `docusaurus.config.js` (docs preset options) |
| Search | Algolia (audit script `scripts/audit-algolia.js`) | `package.json` scripts |
| Analytics | PostHog, self-hosted | `docusaurus.config.js` comment; `posthog-js` dep |
| Extras | `@signalwire/docusaurus-plugin-llms-txt` (machine-readable llms.txt), mermaid theme, ideal-image, client-redirects | `package.json` deps |

**Consequence of `includeCurrentVersion: false`:** the unversioned `docs/` tree holds no user content (only `docs/adr/` and `docs/superpowers/`). **New user-facing pages must be written into `versioned_docs/version-1.x/`** — a generator cannot target `docs/`.

### 2.1 Deploy pipeline

- **Vercel Git integration, no deploy workflow.** `README.md`: *"The site auto-deploys via Vercel's Git integration: pushes to `main` deploy to production, and pull requests get preview deployments."* The `"deploy": "docusaurus deploy"` npm script is vestigial and unused. Note the install split: **local/CI use pnpm, Vercel installs with npm** (`package-lock.json` is committed; `pnpm-lock.yaml` is gitignored).
- Builds are gated by `"ignoreCommand": "node scripts/should-ignore-vercel-build.js"` (`vercel.json`), which skips previews for automated `aide/docs-translations-*` branches.
- **`middleware.js`** (Vercel Edge) does content negotiation — `Accept: text/markdown` rewrites `/route` → `/route.md` to serve the `@signalwire/docusaurus-plugin-llms-txt` output — plus browser-language 302s **on the site root only** (deep links are never redirected). So `/error-codes/<CODE>` is served directly, and each page automatically gains a machine-readable `.md` twin for AI/support consumption.
- **`.github/workflows/build.yml`** is the blocking correctness gate. Its own header comment states the reason: Vercel previews are intentionally skipped for automated translation branches, *"so without this job a broken build only surfaces on the production deploy to `main` after merge."* It runs the full `pnpm build` (**all locales**) on any PR touching `docs/**`, `versioned_docs/**`, `versioned_sidebars/**`, `i18n/**`, `src/**`, `static/**`, `docusaurus.config.*`, `sidebars*`, or lockfiles.
- `vercel.json` is ~29 KB and is dominated by a large hand-maintained `redirects` array (IA-restructure legacy URLs). **No redirect currently touches `/error-codes/*`** (only `/troubleshooting/*` → `/support/troubleshooting/*`). ADR `docs/adr/0002-redirects-via-vercel-301.md` records that redirects are done as Vercel 301s.
- **Known infrastructure failure mode:** [`wcpos/docs#254`](https://github.com/wcpos/docs/issues/254) (OPEN, `priority: high`) — *"Vercel deployment quota blocks docs PR previews"*: the account hit `api-deployments-free-per-day` ("more than 100"), leaving the `Vercel` status context failed on PRs even when Actions were green. **Directly relevant:** any design that opens frequent docs PRs, or that produces a large per-code page set, pushes against a quota that has already caused an outage.

### 2.2 i18n today

- **12 locales**, `defaultLocale: 'en'`: `en, es, fr, de, nl, ja, pt-BR, ko, it, ar, hi-IN, zh-CN` (`docusaurus.config.js` i18n block). `ar` is configured RTL; `en` uses `htmlLang: 'en-GB'`.
- Translations live as **full mirrored MDX trees** at `i18n/<locale>/docusaurus-plugin-content-docs/version-1.x/…` — not message catalogues. Verified coverage for error codes: **64/64 files in each of the 11 non-English locales**, 768 files in total.
- **Live routing works today**: `https://docs.wcpos.com/fr/error-codes/SY01001` returns a genuinely French page, *"SY01001: Mémoire Épuisée"*.
- **Translation is performed by an external agent ("Aide", via OpenClaw), not by the in-repo scripts.** No workflow runs `scripts/translate-docs.js` — it is manual-only (`pnpm translate`). The production path is: **push to `main` touching `versioned_docs/**/*.mdx`, `i18n/en/**/*.json`, `versioned_sidebars/**`, `sidebars.js` or `docusaurus.config.js` → `.github/workflows/forward-docs-translations-to-aide.yml` runs `pnpm write-translations --locale en` + `scripts/detect-doc-translation-changes.js` → POSTs the changed-file list to `$OPENCLAW_BASE_URL/translation/webhook` (default `https://openclaw.wcpos.com`) → Aide opens an `aide/docs-translations-<date>` PR titled `feat(aide): update docs translations` → a human merges it.** The workflow deliberately does not wait for completion (`.github/scripts/test-forward-docs-translations-to-aide.sh`: *"Docs forwarding workflow must not poll Aide tasks; docs translations are long-running AI work"*), and `scripts/wait-for-openclaw-task.js` exists but is intentionally unused here.
- **Dispatch is suppressed while any `aide/docs-translations-*` PR is open.** Both the forward and sweep workflows gate on `has_open_pr != 'true'`. Content merged during that window is picked up only by the nightly sweep.
- **The nightly self-healing sweep.** `.github/workflows/sweep-docs-translations.yml` runs `cron: '0 3 * * *'` + `workflow_dispatch`: it *"Periodically finds docs that are missing/stubbed/stale OR rendering raw English … in ANY locale and asks Aide to repair them, so a newly-added locale or any missed page self-heals without a human having to notice."* Gap definition shared with the blocking Translation Completeness gate (`check-translation-completeness.js --audit-json`), ordered worst-first (raw English → missing/stub → stale drift), **batched at `batch_size` default 12 source files per run** (cap 50).
- **⚠️ Error-code pages are explicitly deprioritized in that queue.** `scripts/check-translation-completeness.js:63` — `const AUDIT_DEPRIORITIZE_DEFAULT = '/error-codes/';`, applied as `priority: (s) => (deprioritizeRe.test(s) ? 1 : 0)`. The docblock is unambiguous: *"Default pushes the ~60 boilerplate error-code reference pages behind the hand-written content guides so the high-value pages translate first."* **This is the single most important i18n fact for this workstream:** dropping 38 generated pages does not get them translated promptly — they queue behind every hand-written guide gap in all 11 locales, at 12 source files per night. It is tunable via the `AUDIT_DEPRIORITIZE` env var, but that is a deliberate policy choice someone made, not an oversight to route around silently.
- **Bots may not write `i18n/**`.** `AGENTS.md`: *"Localized content under `i18n/**` is generated by the translation pipeline and must not be rewritten by AI reviewers or generic fixer agents"*; *"Do not 'complete coverage', regenerate localized docs, or replace translated prose…"*. Machine-enforced by `scripts/check-translation-safety.js`, whose `DEFAULT_DISALLOWED_AUTHORS` blocks `wcpos-agents[bot]`, `chatgpt-codex-connector[bot]`, `coderabbitai[bot]`, `coderabbit[bot]` from committing under `i18n/`. **A generator must emit English only and let Aide translate.**
- Engine reality check: `openai` (`gpt-4o-mini`, `gpt-4o` for QA) is the only SDK actually used by in-repo scripts; **`@anthropic-ai/sdk` and `@google-cloud/translate` are dependencies with zero code references** — the real translator lives in OpenClaw, outside this repo.
- `scripts/should-ignore-vercel-build.js` matches the single prefix `aide/docs-translations-` — **any new generated-branch prefix must be added explicitly**; it will not match by accident.
- **Net cost of a new English page:** author the MDX, **hand-edit the sidebar**, and merge the resulting translation PR. Everything between is automated — but for `/error-codes/` pages the automation is deliberately slow.

### 2.3 Authoring constraints a generator must satisfy

From `.ai/rules/docs.mdc` (`alwaysApply: true`):

> **Sidebar Updates (CRITICAL)** — When adding new pages to versioned docs, you MUST manually update `versioned_sidebars/version-1.x-sidebars.json` … **Versioned sidebars are NOT auto-generated. New pages won't appear in navigation until added.**

The existing error-codes sidebar entry is a hand-written explicit list nested under an "Error Codes" category with per-domain sub-categories (`versioned_sidebars/version-1.x-sidebars.json`, ~lines 277–385). Programmatic check: **sidebar ids and on-disk files match exactly, 64/64, no orphans in either direction** — the sidebar is currently in perfect sync, which is exactly what a generator must not break. The four domain category labels are translated as sidebar strings in `i18n/<locale>/docusaurus-plugin-content-docs/version-1.x.json` (e.g. `es`: *"Códigos de error"*), not in the sidebar JSON.

Other hard constraints a generated page must satisfy:

- **`description:` frontmatter is always double-quoted.** `AGENTS.md`: *"This is an enforced, deterministic policy, not a style preference… Many descriptions contain a colon; an unquoted colon makes YAML read the value as a mapping pair, which breaks the frontmatter and fails the production build."* Canonical form comes from `scripts/validate-frontmatter.js --fix`, enforced in CI by `--check --changed`, and applied at build time via `docusaurus.config.js` `markdown.parseFrontMatter`. Registry `docsBody`/`summary` strings **do contain colons and apostrophes** (e.g. SYNC131), so a naive emitter will break the build.
- **`onBrokenLinks: 'throw'`** (`docusaurus.config.js`) — the prior-art pages' `## Related Errors` cross-links mean a generator emitting a link to a not-yet-generated code fails the whole build, and thus the `build.yml` PR gate.
- **Explicit `{#anchor-id}` on every heading** — load-bearing, not cosmetic: `check-translation-completeness.js` uses missing anchors as its *staleness* signal (*"a missing slug is a missing section, not a translation artifact"*), threshold 1. Anchor charset is `[a-z0-9-]` only.
- **README's stated frontmatter requirement is `title`, `sidebar_label`, `sidebar_position`, and optionally `slug`/`description`** — but the existing error-code pages carry only `title` + `sidebar_label`, and `validate-frontmatter.js` does not enforce key presence. Prior art and the documented rule disagree; a generator has to pick one.
- Markdown headings *before* custom components (so the TOC populates), MDX-only text (hardcoding text inside components "breaks translations"), `<Icon name="…" />` rather than Unicode symbols, and **UK English**.
- `CONTEXT.md` places these pages firmly in user-facing docs: *"Error Codes — User-facing troubleshooting reference… Must stay inside the main, search-indexed, user-facing docs. Avoid: filing under 'Developer Reference'; an Owner/Operator looks these up constantly."*

### 2.4 In-house precedent for committed generated content

`scripts/build-ui-glossary.js` writes a generated UI-label table **in place** into `scripts/translation-context.md` between sentinels:

```
<!-- UI-GLOSSARY:START - generated by scripts/build-ui-glossary.js, do not edit by hand -->
… <!-- UI-GLOSSARY:END -->
```

It pulls the app's real strings from `wcpos/translations` because *"the source of truth is wcpos/translations (the app's own translation files), not the translator's judgement."* It ships a `--check` staleness mode that exits 1 with *"❌ UI glossary is stale"* — **but no workflow invokes it, and it is not even in `package.json` scripts.**

This is simultaneously the best precedent (sentinel-delimited, generated-from-upstream-truth, committed) and the sharpest cautionary tale in the repo: **an unwired drift check is indistinguishable from no drift check.** Whatever this workstream builds, the gate has to run in CI, not merely exist.

---

## 3. Prior art in the docs repo

### 3.1 What exists

`versioned_docs/version-1.x/error-codes/` — 64 English files:

- **59 per-code pages**: `API01001`–`API01008`, `API02001`–`API02010`, `API03001`–`API03007`, `API04001`–`API04006`, `API05001`–`API05005`, `API06001`–`API06003` (39 API); `DB01001`–`DB01003`, `DB02001`–`DB02003`, `DB03001`–`DB03003` (9 DB); `PY01001`–`PY01004`, `PY02001`–`PY02002` (6 PY); `SY01001`–`SY01003`, `SY02001`–`SY02002` (5 SY).
- **4 domain hubs**: `api.mdx`, `db.mdx`, `py.mdx`, `sy.mdx`.
- **1 index**: `index.mdx`, which documents the legacy `[DOMAIN][CATEGORY][SPECIFIC_CODE]` format and publishes the counts "API 39 / DB 9 / PY 6 / SY 5" (live-confirmed on `https://docs.wcpos.com/error-codes`).

### 3.2 Page shape (the de-facto template)

`SY01001.mdx` in full is representative — frontmatter `title: "SY01001: Out of Memory"` + `sidebar_label: SY01001`, then `## What This Means`, `## Common Causes`, `## How to Fix` (numbered `###` sub-steps), `## Minimum Requirements`, `## Ongoing Issues`, `## Related Errors` (relative links, e.g. `[SY01002](./SY01002)`). Every heading carries an explicit anchor (`{#what-this-means}`). These are **long, hand-written, human-toned pages** — roughly 60 lines each.

**Contrast with the registry:** `docsBody` is one short paragraph — min 58 / median 96 / max 244 characters across the 38 entries. A generated page built from `summary` + `docsBody` + the five taxonomy fields would be *far* thinner than the prior art it replaces. That gap is a decision the grilling ticket owns, not a fact to paper over.

### 3.3 The "8 of 17 DB codes" datapoint, confirmed

The legacy catalogue in the app (`packages/utils/src/logger/error-codes.ts`, present on **both** `origin/main` and `origin/next`) defines **67 codes**. Of its **17 DB codes** (`DB01001`–`DB01005`, `DB02001`–`DB02007`, `DB03001`–`DB03005`), the docs site publishes only **9**. The missing 8 (`DB01004`, `DB01005`, `DB02004`–`DB02007`, `DB03004`, `DB03005`) deep-link to 404s today. This is the ticket's "8 of 17 DB codes once pointed at missing pages", verified — **and it is the exact drift the lockstep mandate exists to prevent: 67 codes in the app, 59 pages on the site, no gate between them.**

The docs repo's own planning documents already treat this section as a fixed cost: `plans/2026-05-30-docs-inventory.md` — *"Totals: ~130 user pages + ~65 error-code pages. 12 locales mirror the tree."* — and `plans/2026-06-02-docs-growth-plan.md` flags *"Error-codes — audit the public set against the wiki's full list"* as outstanding.

### 3.4 No registry awareness

The docs repo contains **no** reference to `error-registry.json`, the monorepo, or any code-generation of error pages. Every error-code page is hand-authored and committed. `git log` for the directory shows only incidental edits (`c2a4250 docs: use WCPOS in versioned docs`).

---

## 4. The monorepo side

### 4.1 Registry and codegen

- **Registry:** `packages/utils/src/logger/error-registry.json` — 38 entries, each with `code, symbol, domain, severity, safeAction, retryPolicy, dataSafety, escalation, summary, docsBody, introducedIn, evidence`.
- **Generator:** `scripts/generate-error-codes.mjs`, run via `pnpm generate:error-codes` (`package.json`). It validates the registry (required fields, closed vocabularies, `^<DOMAIN>\d{3}$` code shape, duplicate code/symbol detection) and writes two committed artifacts into `packages/utils/src/logger/generated/`: `error-codes.generated.ts` (TS unions + `ERROR_CATALOGUE` + `ERROR_CODES`) and `error-catalogue.json`. Both carry the banner `// GENERATED — do not edit by hand; run pnpm generate:error-codes`.
- The generator already accepts `--registry` and `--output-dir` flags, so **a second output target (MDX) is a natural extension of an existing, tested script** rather than a new tool.
- Domains: `AUTH, SYNC, CHECKOUT, PAYMENT, PRINT, PRODUCT, LICENSE, CLIENT`.

### 4.2 The drift gate that exists (and where it stops)

`packages/utils/src/logger/error-registry.test.ts` enforces four things: the registry matches an explicit 38-symbol seed list; entries are complete/unique with domain-matching prefixes; the generator **"regenerates byte-identical checked-in artifacts"** (it runs the real generator into a temp dir and byte-compares); and the generator exits non-zero on invalid input. This runs in CI — `.github/workflows/test.yml` iterates `for pkg in core components database hooks utils order-math`.

**This is a strong template for the docs gate, and it currently covers nothing outside the monorepo.** No workflow in either repo references the docs site's error pages.

### 4.3 The URL scheme and its (absent) consumer

`packages/utils/src/logger/constants.ts`:

```ts
export const ERROR_CODE_DOCS_BASE_URL = 'https://docs.wcpos.com/error-codes';
export const getErrorCodeDocURL = (errorCode: string): string => `${ERROR_CODE_DOCS_BASE_URL}/${errorCode}`;
```

Repo-wide, `getErrorCodeDocURL` / `ERROR_CODE_DOCS_BASE_URL` appear only in `constants.ts`, its test, the barrel `index.ts`, and `README.md` — **no UI calls it**. Instead `packages/core/src/screens/main/logs/row-detail.tsx` imports `ERROR_CATALOGUE` and renders `entry.summary`, the data-safety line, the safe action, and `entry.docsBody` (split on blank lines) inside an in-app `HelpDialog`. Notably, `constants.test.ts` still asserts against **legacy** codes (`getErrorCodeDocURL('API01001')`, `'DB01001'`, `'PY01001'`, `'SY01001'`) — the test encodes the old scheme.

**Two consequences.** (a) Merchants cannot currently reach a 404, because nothing links out — so the pipeline can be built before the link ships, without a broken-link window. (b) The offline dialog already delivers the core guidance, which means the docs pages' job is the *longer* form (causes, step-by-step fixes, related codes) that `docsBody` alone does not contain.

### 4.4 Legacy vs new: both catalogues are live on `next`

`error-codes.ts` (67 legacy codes) still ships on `next` alongside the new registry. `packages/utils/src/logger/registry.ts` wraps every legacy code as `deprecated: true` with a `legacyDomain()` mapping (`DB*` → `db`, `PY*` → `payment`, else `client`). So the transition is explicit in code — but the **docs site only documents the deprecated set**, and there is no redirect or deprecation notice from legacy pages toward the new scheme.

### 4.5 Spec §5 — the mandate

From the [logging implementation spec gist](https://gist.github.com/kilbot/7f6f4886f0be843fc8a4b017068694e0), §5 "Error-Code Registry":

- Clean-slate domains `AUTH, SYNC, CHECKOUT, PAYMENT, PRINT, PRODUCT, LICENSE, CLIENT`; compact form `SYNC104`.
- Split rule: *"a code exists iff the merchant response differs (safe action, retry policy, money/data-safety, escalation target). Same response ⇒ same code; cause lives in context."*
- The registry produces *"TS types; bundled offline in-app catalogue + i18n keys; machine-readable JSON for support/AI; **per-code markdown pushed to the `../docs` repo by automated PR**."*
- *"Published codes immutable — deprecate, never reuse"*; *"**catalogue↔docs lockstep is mandatory**"*.
- *"**CI fails on unregistered/duplicate codes, missing fields, registry↔docs drift**."*

Note that §5 already names a preferred mechanism — **automated PR into the docs repo** (Option A below). The unresolved parts are *where the gate runs*, *what the page body contains*, and *how i18n is reconciled*. §1136 also records that i18n of catalogue and docs bodies is explicitly "not yet specified" and *"sharpens once the docs-pipeline ticket decides how pages are generated"*.

---

## 5. Generation-pipeline options

All three assume the generated pages target `versioned_docs/version-1.x/error-codes/` (forced by `includeCurrentVersion: false`) and must update `versioned_sidebars/version-1.x-sidebars.json`.

### Option A — In-monorepo codegen → automated PR to `wcpos/docs`

Extend `scripts/generate-error-codes.mjs` with an MDX emitter (it already takes `--output-dir`). A monorepo workflow on `next` detects registry changes, renders 38 MDX files + the sidebar fragment, and opens a PR on `wcpos/docs`. **This is what spec §5 names.**

- **Lockstep / drift gate.** Strongest available, and it can be made *symmetric*: (1) monorepo CI extends the existing byte-identical test to the MDX output, so a registry edit without regenerating fails `test.yml`; (2) the docs PR is the delivery; (3) a docs-side check asserts every registry code has a page. Failure is loud and lands in the monorepo, where the registry author is already working.
- **Effort.** Moderate. MDX template + sidebar-fragment writer + a cross-repo workflow with a token that can push to `wcpos/docs`. The pattern is proven in-house — the translation sweep already lands via bot PRs (`aide/docs-translations-*`).
- **Failure modes.** Cross-repo credentials to provision and rotate. PR volume feeds the *already-open* Vercel quota issue (docs#254) — the generated branch prefix must be added explicitly to `should-ignore-vercel-build.js`, which today matches only `aide/docs-translations-`. Merge lag means the site trails the registry between merge and merge. Generated MDX committed into a repo whose reviewers expect hand-written prose needs an unmistakable "do not edit" banner — and, more subtly, the self-healing sweep will happily "repair" a generated page's translation, so the generator must never be the thing that overwrites `i18n/**`.
- **i18n.** Mechanically free, but **slow by design**: merging generated English to `main` fires the forward workflow and Aide translates all 11 locales; anything missed self-heals nightly. However `/error-codes/` is explicitly deprioritized in the sweep queue (§2.2), so a 38-page drop translates only after hand-written guide gaps clear, 12 source files per night. The generator must write English only — bots are blocked from `i18n/**`.

### Option B — Docs build-time consumption of the registry

The docs site fetches/imports `error-catalogue.json` (published artifact, npm package, or git submodule) and renders `/error-codes/<CODE>` from it at build time via a Docusaurus plugin creating routes dynamically.

- **Lockstep / drift gate.** Structurally the tightest — **drift becomes impossible for page existence**, since pages *are* the registry; no code can lack a page. But the gate moves to "is the pinned artifact current?", which is a new, quieter drift axis (a stale pin looks healthy). Needs a freshness check plus a docs rebuild trigger on registry change.
- **Effort.** Highest. A custom Docusaurus plugin, a publish/consume channel for the catalogue, and — the real cost — this bypasses the file-based i18n system entirely.
- **Failure modes.** **i18n is the blocker:** the entire translation pipeline operates on MDX files in `i18n/<locale>/…`; dynamically generated routes have no files to translate, so these pages would fall out of the 12-locale story unless a parallel translation mechanism is built. Also loses per-page hand-authored depth, loses Algolia/llms-txt behaviour that assumes real docs, and adds a build-time network/version dependency to a site whose builds are already quota-constrained.
- **i18n.** Effectively unsolved without extra work — the sharpest trade-off against the status quo, where 768 translated files exist today. The entire pipeline (`detect-doc-translation-changes.js` → webhook → `i18n/**` files → completeness gate on anchors) is file-based end to end; dynamic routes have no files to detect, forward, translate, or audit.

### Option C — Docs-repo CI job pulling the registry

A scheduled/dispatched workflow inside `wcpos/docs` fetches `error-catalogue.json` from the monorepo, regenerates the MDX + sidebar, and commits (or self-PRs) within the docs repo.

- **Lockstep / drift gate.** Weakest by default — the gate lives in the *consumer*, so a registry change is not blocked by anything; the site catches up on the next run. Can be strengthened with a docs-side check that fails when generated files differ from a fresh pull, but that check fails in the repo whose owner did not make the change. A `repository_dispatch` from the monorepo narrows the lag but re-introduces the cross-repo token of Option A without its gating benefit.
- **Effort.** Lowest — one workflow, entirely inside a repo that already runs six translation-related workflows and knows how to self-PR.
- **Failure modes.** Registry-to-site lag is a *schedule*, not a gate — exactly how the 67-vs-59 drift in §3.3 arose. Cross-repo fetch needs the monorepo raw file (public, so no token needed for read). Notifications land on the wrong team.
- **i18n.** Same as Option A — generated files enter the forward/sweep pipeline, with the same `/error-codes/` deprioritization.

### Comparison

| | **A — monorepo codegen → docs PR** | **B — docs build-time consumption** | **C — docs-repo CI job** |
|---|---|---|---|
| Named by spec §5 | **Yes** | No | No |
| Drift possible? | No (gated in monorepo CI) | No for existence; yes for stale pin | Yes, until the job runs |
| Gate fails where the author works | **Yes** | Partly | No |
| Effort | Moderate | High | Low |
| Works with the 12-locale pipeline | **Yes** (but `/error-codes/` deprioritized) | **No — major blocker** | Yes (same deprioritization) |
| Sidebar maintenance | Generated | N/A (dynamic routes) | Generated |
| Adds Vercel deploy pressure (docs#254) | Yes | Reduces (fewer PRs) | Yes |
| Cross-repo credentials | Yes | Fetch only | Fetch only |
| Keeps hand-written depth possible | Yes (hybrid) | Hard | Yes (hybrid) |

**Where the facts point (not a decision):** Option A is the only one that both satisfies §5's literal wording and preserves the existing translation pipeline, at moderate cost. Option B's structural elegance collides head-on with the file-based i18n system that currently delivers 768 translated files. Option C is the cheapest and is the mechanism whose known failure mode is the drift this workstream exists to eliminate.

---

## 6. Open questions the grilling ticket must settle

1. **Page depth.** Registry `docsBody` is 58–244 characters; the prior-art pages are ~60 lines of causes/fixes/related-codes. Generated-only, or generated skeleton + hand-written expansion (and if hybrid, how does the drift gate tell the two apart)?
2. **The 59 orphaned legacy pages × 12 locales.** Delete, redirect to nearest new code, or leave standing with a deprecation banner? `vercel.json` redirects are the established mechanism (ADR 0002), and legacy codes are already `deprecated: true` in `registry.ts` — but the mapping from 67 legacy codes to 38 new ones is not 1:1 and does not exist yet.
3. **i18n ownership of registry English.** Registry strings are not written to the UK-English house style (`.ai/rules/docs.mdc`), and the same English feeds both the offline in-app dialog and the docs page. Does the registry become the translation source for both, and does §5's "i18n keys" output arrive before or after the docs pipeline?
4. **The `/error-codes/` deprioritization.** `AUDIT_DEPRIORITIZE_DEFAULT` was set deliberately so *"high-value pages translate first"*. Shipping 38 generated pages inherits that policy — they will be the last thing translated. Keep it (accepting English-only error pages for a long tail), override it via `AUDIT_DEPRIORITIZE` for registry pages, or one-off `workflow_dispatch` with a raised `batch_size` at launch?
5. **When the deep-link ships.** No UI links out today (§4.3). The link should not ship before pages exist — and `constants.test.ts` still asserts legacy codes, so it needs updating either way.
6. **Vercel quota.** docs#254 is open and `priority: high`. Any PR-generating design should be weighed against it, and generated branches likely need adding to `scripts/should-ignore-vercel-build.js`.
7. **Event codes.** #1136 lists public reference pages for engine event codes (`context.type`) as unspecified — if they get a docs surface too, the pipeline's page count is not 38.

---

## 7. Sources

**Monorepo (`origin/next` @ `a5996be4a`)** — `packages/utils/src/logger/error-registry.json`, `constants.ts`, `constants.test.ts`, `error-codes.ts`, `registry.ts`, `error-registry.test.ts`, `generated/error-codes.generated.ts`, `generated/error-catalogue.json`; `scripts/generate-error-codes.mjs`; `package.json` (`generate:error-codes`); `.github/workflows/test.yml`; `packages/core/src/screens/main/logs/row-detail.tsx`. Legacy catalogue also confirmed on `origin/main`.

**Docs repo (`wcpos/docs`, default branch `main`, clone HEAD `f5fd98d`)** — `package.json`, `docusaurus.config.js`, `vercel.json`, `middleware.js`, `versions.json`, `sidebars.js`, `versioned_sidebars/version-1.x-sidebars.json`, `versioned_docs/version-1.x/error-codes/**`, `i18n/<locale>/docusaurus-plugin-content-docs/version-1.x/error-codes/**` and `…/version-1.x.json`, `AGENTS.md`, `CONTEXT.md`, `README.md`, `.coderabbit.yaml`, `.ai/rules/docs.mdc`; scripts `translate-docs.js`, `sync-translations.js`, `validate-frontmatter.js`, `check-translation-completeness.js` (esp. `AUDIT_DEPRIORITIZE_DEFAULT`, line 63), `check-translation-safety.js`, `detect-doc-translation-changes.js`, `fix-anchor-ids.js`, `build-ui-glossary.js`, `should-ignore-vercel-build.js`, `wait-for-openclaw-task.js`, `translation-context.md`; workflows `build.yml`, `check-translations.yml`, `qa-translations.yml`, `sweep-docs-translations.yml`, `translation-audit-report.yml`, `forward-docs-translations-to-aide.yml`, `aide-coderabbit-status.yml`, and `.github/scripts/test-forward-docs-translations-to-aide.sh`; `plans/2026-05-30-docs-inventory.md`, `plans/2026-06-02-docs-growth-plan.md`, `docs/adr/0002-redirects-via-vercel-301.md`. Issues/PRs: [wcpos/docs#254](https://github.com/wcpos/docs/issues/254), wcpos/docs#352, #354.

**Live probes (2026-08-11)** — `https://docs.wcpos.com/error-codes` (200, index, "API 39 / DB 9 / PY 6 / SY 5"); `https://docs.wcpos.com/error-codes/SY01001` (200, "SY01001: Out of Memory"); `https://docs.wcpos.com/fr/error-codes/SY01001` (200, "SY01001: Mémoire Épuisée"); `https://docs.wcpos.com/error-codes/SYNC101` (**404**).

**Spec** — [logging implementation spec gist](https://gist.github.com/kilbot/7f6f4886f0be843fc8a4b017068694e0) §5. **Map** — [monorepo#1136](https://github.com/wcpos/monorepo/issues/1136).
