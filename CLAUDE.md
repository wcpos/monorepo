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

This repo includes the WCPOS wiki as a submodule at `.wiki/`. Pull latest before reading:

```bash
git submodule update --init --remote .wiki
```

Relevant wiki pages:

- [Product Overview](.wiki/product/overview.md) — what WCPOS is, business context.
- [Client Architecture](.wiki/architecture/client.md) — React Native app architecture, state management, data flow.
- [Features](.wiki/product/features.md) — feature inventory, free vs Pro.
- [Personas](.wiki/product/personas.md) — user personas and design implications.
