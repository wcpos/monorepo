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

| Command             | Does                           | `when`                                                                 |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `pos.search.focus`  | `focus('search')`              | route `cart` (the products panel shows beside the register picker too) |
| `pos.checkout.open` | `navigate.openCheckout()`      | in the cart, `lineCount > 0`                                           |
| `pos.cart.new`      | `cart.newOrder()`              | in the cart, `hasOpenOrder`                                            |
| `pos.cart.previous` | `cart.selectOrder('previous')` | in the cart, `openOrderCount > 1`                                      |
| `pos.cart.next`     | `cart.selectOrder('next')`     | in the cart, `openOrderCount > 1`                                      |
| `pos.cart.discount` | `focus('discount')`            | in the cart, `hasOpenOrder`                                            |
| `pos.cart.void`     | `cart.void()`                  | in the cart, `hasOpenOrder`, `hasSurface('void')`                      |
| `pos.help.open`     | `focus('help')`                | always                                                                 |

"In the cart" is route `cart` and `hasSurface('cart')`: the cart column registers `cart` only
while it shows the cart, so no key reaches an order behind the register picker, the Open register
card, the count or the loading rows. The commands register at import time in `commands.ts`, which
the barrel imports. No key is bound here: the hotkeys module (`../hotkeys`) binds them and hosts
the help sheet.

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
- `focus('search' | 'discount' | 'help')`: focus an input or open a dialog.
- `screen: { route, hasOpenOrder, openOrderCount, lineCount }` for `when`. `route` is `checkout`
  when checkout mode holds the current order or the checkout sheet is the route, `other` on a
  receipt or outside the POS, `cart` otherwise. `lineCount` counts product, fee and shipping lines.

The context is frozen; nothing in it is a React object.

## Surfaces

A mounted surface registers its handler while mounted: `registerSurface(target, handler)`
returns the detach, so an effect is the whole registration.

| Target     | Registered by                                           | Handler                    |
| ---------- | ------------------------------------------------------- | -------------------------- |
| `pay`      | `PayButton` (`pos/cart/buttons/pay.tsx`)                | `handlePay`                |
| `void`     | the cart column (`pos/cart/index.tsx`)                  | `useVoidOrder().voidOrder` |
| `search`   | the products screen's search input                      | focus the input            |
| `discount` | `AddCartItemsMenu` (`pos/cart/add-cart-items-menu.tsx`) | open the discount dialog   |
| `help`     | `<Hotkeys />` (`extensions/hotkeys`)                    | open the help sheet        |
| `cart`     | the cart column, only while it shows the cart           | nothing (a presence flag)  |

`invokeSurface(target)` runs the newest registration and rejects with `SurfaceNotMountedError`
when none is mounted. A detach removes only its own entry. So the command does what the button
does, while the button exists. The void button lives in the order sheet, which renders nothing
while closed, so its path is the hook `useVoidOrder` (`pos/hooks/use-void-order.ts`): the button
presses it and the cart column registers it, so `pos.cart.void`'s `hasSurface('void')` is true
whenever the cart column is mounted, sheet open or not. Surfaces register through
`useRegisterSurface(target, handler, enabled?)`, which registers once on mount (and while
`enabled`) and always invokes the latest handler, so a key landing between a render and an effect
flush never runs a previous cart's path.

## Do not

- Write to a collection from a command. A data command dispatches the action event the button
  already dispatches, through the button's registered path. `packages/eslint`'s orders-write
  scanner covers `packages/core/src/extensions/`.
- Read React state or await in `when`; it reads `ctx.screen` only.
- Put a router, an order record or a ref on the context; close over it in the provider or the
  surface.
- Add an id outside `COMMAND_IDS`.
