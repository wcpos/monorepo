# Commands ledger

Decisions this directory lives under, one line each, appended never rewritten. Ruling:
wcpos/roadmap#428 (2026-10-13); spec `docs/specs/2026-10-13-commands-primitive-spec.md`.

1. R1: a command is a registry record `{ id, label, run, when? }` in a static typed registry with a closed dotted id list (`COMMAND_IDS`); an id outside it is a type error and a runtime throw. A command never writes a collection; the orders-write scanner's roots gain `packages/core/src/extensions/`.
2. R1: duplicate ids warn and replace outside production and throw in production, the action and slot registries' rule (Fast Refresh and tests re-evaluate registering modules).
3. R2: availability is a pure `when(ctx)` read at raise time; no published state per command in v1. A refusal writes an `info` row `command.refused`, a failure a `warn` row `command.failed`, a run a `debug` row `command.run`.
4. R3: `run` receives the command context, the action context plus `navigate`, `cart` and `focus`; every verb is a promise that may reject. The v1 verb list is only what the default hotkey map needs.
5. Spec amendment (2026-10-13, before PR 1): the Pay and void paths are not extracted. The buttons, the search input and the discount menu register their own handlers as surfaces while mounted, and the verbs invoke them, because the Pay handler reads the cart conditions context that exists only inside the cart column. A detach removes only its own entry; the newest mounted registration wins.
6. R5: 2.0 on `next`, two PRs. PR 1 is this primitive with the eight commands registered and no key bound; `pos.help.open` writes a `debug` row until PR 2 brings the hotkeys module and the help sheet. R4 (Alt chords, `preventDefault`, active inside inputs) is the hotkeys module's.
