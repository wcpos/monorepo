# Handoff Prompt — Printer Settings Redesign

Paste the block below as the opening instruction for the implementing agent.

---

```
You're implementing a cross-platform redesign of the WCPOS Printer Settings
(POS > Settings > Printing) across web, Electron, iOS, and Android. The design is
locked and reviewer-approved; your job is to build it, not redesign it.

REPO & WORKSPACE
- Monorepo: /Users/kilbot/Projects/monorepo-v2 (React Native + Expo POS).
- Work in the EXISTING worktree/branch — do NOT create a new one:
  worktree: .claude/worktrees/printer-settings-redesign
  branch:   worktree-printer-settings-redesign  (draft PR #554)
- The branch already contains the approved design artifacts. Implementation continues
  on this same branch so PR #554 evolves from plan → implementation.

READ FIRST (in order)
1. planning/printer-settings-redesign/plan.md — the executable plan. This is your
   source of truth: 8 locked decisions, Conventions, WS1–WS6 tasks with accept-criteria,
   a "Review round 1" section, and Sequencing. Follow it task by task.
2. packages/printer/CONTEXT.md — the printing-domain glossary (terms: Connection Type,
   Vendor, Cloud Printer, Printer target id, etc.). Use this vocabulary.
3. planning/printer-settings-redesign/preview.html — open in a browser for the intended
   UI/behaviour across platforms (toggle platform + HTTPS/HTTP).

NON-NEGOTIABLE CONVENTIONS (see plan "Conventions")
- REUSE the shared component library @wcpos/components (Button, Text, Icon, Dialog*,
  Modal*, Select*, FormField/FormInput/FormSelect, Collapsible*, Tabs*, HStack/VStack,
  Toast). Do not hand-roll UI. If a primitive is genuinely missing, add it to
  @wcpos/components rather than inlining a one-off.
- Add stable testIDs; never select by localized text (repo e2e policy).
- All strings via t('key','English default') + key in locales/en/core.json. Translatable,
  not translated — do NOT add translations to the external wcpos/translations repo.
- No dead settings: every control must have a wired consumer.
- On native files, prefix hover:/group-hover: with web:.

CONSTRAINTS
- No printer hardware available yet. Verify via the virtual-printer sim + unit tests,
  and make the UI degrade honestly (Searching…/None found, never silent dead buttons).
- This spans 3 repos / 3 PRs:
    * monorepo-v2 (this branch) — shared RN UI, web transport, client cloud surfacing.
    * wcpos/electron submodule (apps/electron) — mDNS + preload allow-list. It is NOT
      initialized in the worktree: `git submodule update --init apps/electron` first;
      it has its own package.json + lockfile (WS4.0: declare the mDNS dep there).
    * woocommerce-pos plugin (sibling repo ~/Projects/woocommerce-pos) — /settings/cloud-print
      encoding fields (WS2.5). Separate PR.
- Do NOT edit the .wiki submodule directly. The cloud-ownership ADR is ingested via the
  /wiki-ingest skill AFTER the monorepo PR merges (referencing that PR).

SEQUENCING (from the plan)
1. WS3 (web ports) + WS4.1 (Electron preload allow-list) — small, independent wins.
2. WS2.0 (printer-target identity contract + template_printer_overrides v0→v1 migration)
   — gate for all cloud work; do before other WS2 tasks.
3. WS1 (unified connection-first dialog).
4. WS2.1–2.5 (cloud auto-surface via shared useAvailablePrinterProfiles()).
5. WS4.0/4.2/4.3 (Electron mDNS), WS5 (USB/BT honesty), WS6 (verification) throughout.

WORKFLOW
- Setup: pnpm install must run with the sandbox disabled (rxdb-premium license needs
  network); use --no-frozen-lockfile.
- Validate per-repo before pushing (root scripts exclude apps/electron):
    monorepo: pnpm run lint; pnpm typecheck --force; package tests.
    electron:  pnpm run lint; pnpm run ts:check; pnpm run test (inside the submodule).
    plugin:    that repo's PHP lint/unit/static checks.
- The pre-commit hook auto-bumps the apps/electron/.wiki submodule pointers; keep those
  stray bumps OUT of your commits (stage only your intended files).
- Keep PR #554 updated as you go. Before marking it ready-for-review, DELETE the
  planning/printer-settings-redesign/ folder (it's design scaffolding); keep
  packages/printer/CONTEXT.md (it's permanent).

Start by reading the three docs above, then confirm your understanding and your first
concrete step (WS3 + WS4.1) before writing code.
```
