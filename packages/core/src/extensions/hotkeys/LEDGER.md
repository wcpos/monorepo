# Hotkeys ledger

Decisions this directory lives under, one line each, appended never rewritten. Ruling:
wcpos/roadmap#428 (2026-10-13); spec `docs/specs/2026-10-13-commands-primitive-spec.md`.

1. R4: Alt/Option chords, `preventDefault` on every bound chord, active inside inputs and content-editable fields; nothing stops propagation, so the barcode wedge detector sees every keystroke.
2. Every chord raises its command through `runCommand` with source `key`; `when` and the surfaces gate it. A chord whose previous run has not settled is dropped by a module-level in-flight set, not by the registry.
3. `<Hotkeys />` is mounted in the POS layout beside the stack, inside `CommandsProvider`, rather than by the provider: the primitive does not import its consumer (spec §3 has the provider render it; the hotkeys index imports the commands index, so the other way round is an import cycle).
4. `pos.help.open` runs `ctx.focus('help')`; `<Hotkeys />` registers the sheet's opener as the `help` surface. The sheet lists every registered command in the map's order, dims the unavailable through the host Button's disabled state, and a row press closes the sheet before it runs the command (source `ui`), because the open sheet keeps focus inside itself.
5. Web and Electron only. No remapping, no per-merchant keys, no Electron accelerator in v1 (spec §7).
