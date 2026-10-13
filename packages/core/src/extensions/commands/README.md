# Commands — v1 (internal)

A **command** is a named thing the POS can be told to do (`pos.checkout.open`), raised by a key,
a button, a macro or a palette. It dispatches an action event through that action's one writer,
or calls a host verb. **A command never writes a collection.** This is the fourth extension
primitive beside slots (UI in, `../slots`), action events (intent and refusal, `../actions`) and
the server-delivered descriptors (config in).

Ruled in [wcpos/roadmap#428](https://github.com/wcpos/roadmap/issues/428), 2026-10-13; spec
`docs/specs/2026-10-13-commands-primitive-spec.md` in the roadmap repo.

- **Contract version:** `COMMAND_API_VERSION = 1`.
- **Status: internal.** First-party commands in the same bundle as the host. Reachable at
  `@wcpos/core/extensions/commands`, exported from no other barrel. A surface registers from
  `extensions/commands/surfaces` directly, so a button does not import the provider.

## The commands (closed list)

| Command             | Does                               | `when`                              |
| ------------------- | ---------------------------------- | ----------------------------------- |
| `pos.search.focus`  | `focus('search')`                  | route is cart                       |
| `pos.checkout.open` | `navigate.openCheckout()`          | route is cart, `lineCount > 0`      |
| `pos.cart.new`      | `cart.newOrder()`                  | route is cart, `hasOpenOrder`       |
| `pos.cart.previous` | `cart.selectOrder('previous')`     | route is cart, `openOrderCount > 1` |
| `pos.cart.next`     | `cart.selectOrder('next')`         | route is cart, `openOrderCount > 1` |
| `pos.cart.discount` | `focus('discount')`                | route is cart, `hasOpenOrder`       |
| `pos.cart.void`     | `cart.void()`                      | route is cart, `hasOpenOrder`       |
| `pos.help.open`     | a `debug` row until the help sheet | always                              |

They register at import time in `commands.ts`, which the barrel imports. No key is bound here:
the hotkeys module (PR 2 of roadmap#428) binds them.

## The registry

```ts
registerCommand({ id: 'pos.cart.new', label: 'pos_commands.cart_new', when, run });
const { outcome } = await runCommand('pos.cart.new', ctx, { source: 'key' }); // ran | refused | failed
```

- `id` is a `CommandId` from `COMMAND_IDS`; any other id is a type error and throws at runtime.
  A duplicate id replaces with a `console.warn` outside production and throws in production
  (Fast Refresh and tests re-evaluate registering modules).
- The descriptor (`id`, `label`, `commandApiVersion`) is plain serialisable data; `label` is a
  translation key under `pos_commands.`. `getCommands()` is a frozen snapshot of frozen records,
  sorted by id.
- `runCommand`: an unregistered id throws; `when` false resolves `refused` with an `info` row
  `command.refused`; a `run` that throws or rejects resolves `failed` with a `warn` row
  `command.failed` carrying the error message; success writes a `debug` row `command.run`. Every
  row carries `{ command, source }`. Rows file under `wcpos.pos.commands`.

## The command context

`CommandsProvider` (mounted once at the POS root, inside `CurrentOrderProvider`, around the
stack) builds it; `useCommandContext()` reads it (a consumer that raises commands from a key handler holds the
latest context in a ref and calls `runCommand`). It is the action context plus:

- `navigate.openCheckout()`: the Pay button's own path (leaving checkout is reserved with
  `pos.checkout.leave`; Escape in checkout is the screen's own today).
- `cart.newOrder()`, `cart.selectOrder(uuid | 'previous' | 'next')` (open orders in the strip's
  order, wrapping, receipts skipped; the blank cart sits past the last cart; an unknown uuid
  rejects), `cart.void()`: the void button's own path.
- `focus('search' | 'discount')`.
- `screen: { route, hasOpenOrder, openOrderCount, lineCount }` for `when`. `route` is `checkout`
  when checkout mode holds the current order or the checkout sheet is the route, `other` on a
  receipt or outside the POS, `cart` otherwise. `lineCount` counts product, fee and shipping lines.

The context is frozen; nothing in it is a React object.

## Surfaces

A mounted surface registers its handler while mounted: `registerSurface(target, handler)`
returns the detach, so an effect is the whole registration.

| Target     | Registered by                                           | Handler                  |
| ---------- | ------------------------------------------------------- | ------------------------ |
| `pay`      | `PayButton` (`pos/cart/buttons/pay.tsx`)                | `handlePay`              |
| `void`     | `VoidButton` (`pos/cart/buttons/void.tsx`)              | `handleRemove`           |
| `search`   | the products screen's search input                      | focus the input          |
| `discount` | `AddCartItemsMenu` (`pos/cart/add-cart-items-menu.tsx`) | open the discount dialog |

`invokeSurface(target)` runs the newest registration and rejects with `SurfaceNotMountedError`
when none is mounted. A detach removes only its own entry. So the command does what the button
does, while the button exists: the void button lives in the order sheet, so `pos.cart.void`
fails while the sheet is closed.

## Do not

- Write to a collection from a command. A data command dispatches the action event the button
  already dispatches, through the button's registered path. `packages/eslint`'s orders-write
  scanner covers `packages/core/src/extensions/`.
- Read React state or await in `when`; it reads `ctx.screen` only.
- Put a router, an order record or a ref on the context; close over it in the provider or the
  surface.
- Add an id outside `COMMAND_IDS`.
