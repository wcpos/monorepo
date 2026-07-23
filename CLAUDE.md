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

## E2E selector policy

E2E tests must use stable `testID` selectors for app UI. Do not use localized UI text as selectors: no `getByText`, no `getByPlaceholder`, no `getByLabel`, and no `getByRole(..., { name })` in `apps/main/e2e`. If a UI element needs to be exercised by E2E, add a stable `testID` to the component and select it with `getByTestId()`.

## Branch lanes

This repo has two permanent trunks:
- **`main`** — the **stable**, released line (1.9.x patches ship from here).
- **`next`** — the **in-development** major/minor (1.10, then 1.11, 2.0 …).

Feature work usually targets `next`; patches to the shipped release target `main`. Never commit directly to either trunk — branch off the correct one in a worktree, and target the PR's base at the same lane. **If it isn't clear which lane a task belongs to, ask "main or next?" before branching, pulling (`git pull origin <lane>`), or opening a PR — don't default to `main`.**
