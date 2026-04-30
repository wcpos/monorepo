# Agent Instructions for WCPOS Monorepo

This file is the local Codex/agent entrypoint for this repository. These instructions are project-local; do not copy them to global `~/.claude`, `~/.codex`, or other global agent configuration without explicit user approval.

## Source of Truth

Load these local files before substantial work in this repo:

1. `CLAUDE.md` — project overview and shared local agent policy.
2. `.claude/rules/*.mdc` — local project rules.
3. `.claude/skills/*/SKILL.md` — local project skills.

If global rules conflict with local repository rules, follow higher-priority system/developer/user instructions first, then the local repository rule for project-specific behavior.

## Local Skill Discovery

When the user names a skill, search this repository first:

```bash
find .claude/skills -maxdepth 2 -name SKILL.md -print
```

If a matching local skill exists, read and follow it before falling back to global skills. Do not say a named skill is missing until checking `.claude/skills`.

Current local skills:

- `electron-dev` — use when spinning up Electron dev from a worktree with logs visible in a macOS Terminal window.

## Local Rules

The consolidated local project rules live in `.claude/rules/project.mdc` and cover:

- React, TypeScript, and logging conventions.
- Uniwind/Tailwind styling and theming conventions.
- Language-agnostic E2E locator requirements.
- WCPOS naming requirements.
