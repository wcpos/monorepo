# Hotkeys — v1 (internal)

Keyboard chords for the POS on web and Electron: the first consumer of the commands primitive
(`../commands`), and the worked example of a module that raises commands. Ruled in
[wcpos/roadmap#428](https://github.com/wcpos/roadmap/issues/428) (R4: Alt/Option chords,
`preventDefault`, active inside inputs); spec `docs/specs/2026-10-13-commands-primitive-spec.md`
§3 and §4 in the roadmap repo.

Reachable at `@wcpos/core/extensions/hotkeys`. `<Hotkeys />` is mounted in the POS layout inside
`CommandsProvider`, beside the stack, so the chords exist exactly while the POS is mounted.

## The chords

| Chord | Command             |
| ----- | ------------------- |
| Alt+F | `pos.search.focus`  |
| Alt+P | `pos.checkout.open` |
| Alt+N | `pos.cart.new`      |
| Alt+← | `pos.cart.previous` |
| Alt+→ | `pos.cart.next`     |
| Alt+D | `pos.cart.discount` |
| Alt+V | `pos.cart.void`     |
| Alt+/ | `pos.help.open`     |

On a Mac the help sheet shows Alt as `⌥`. `DEFAULT_BINDINGS` (`bindings.ts`) is the map as data;
`describeChord(keys, platform)` turns a chord into keycaps. `react-hotkeys-hook` matches the
physical key (`event.code`), so `/` is spelled `slash`. Whether a chord does anything is the
command's `when`, not this module's: a refused chord does nothing visible and writes an `info` row.

`Alt+F` and `Alt+D` are also the Windows browser menu mnemonics. `preventDefault` stops them in
Chrome and Edge; Firefox is not verified, so the help sheet carries one line saying so.

## The help sheet

`Alt+/` raises `pos.help.open`, whose `run` is `ctx.focus('help')`; `<Hotkeys />` registers the
sheet's opener as the `help` surface. The sheet lists every registered command in the map's order
with its keycaps, dims the rows whose `when` answers false (the host Button's disabled state,
`aria-disabled`), and a row press closes the sheet and then runs the command with source `ui`.
It opens from the right like every side panel, and as a page on a phone.

## How to write a module like this one

1. **Register the command, not the key.** A command lives in `../commands/commands.ts` with an id
   from the closed `COMMAND_IDS`, a `pos_commands.*` label and a pure `when`. Its `run` calls a
   context verb (`navigate`, `cart`, `focus`); a verb that needs a mounted screen goes through a
   surface that screen registers with `useRegisterSurface`.
2. **Bind it.** Read `useCommandContext()`, hold the latest in a ref (a key lands between renders),
   and raise with `runCommand(id, ref.current, { source })`. Add a `CommandSource` before raising
   from a new kind of trigger.
3. **Drop repeats yourself.** The registry runs every raise; a trigger that can fire again before
   the run settles keeps its own in-flight set, as `hotkeys.web.tsx` does.

## Do not

- Run a command's path directly (call the surface, dispatch the action, write an order): raise
  the command, so `when`, the rows and the surfaces apply.
- Stop the event's propagation: the barcode wedge detector listens on the document.
- Bind on native: `hotkeys.tsx` renders nothing, and `@wcpos/hooks/use-hotkeys` is a no-op there.
- Import this module from `../commands`: the primitive does not know its consumers.
