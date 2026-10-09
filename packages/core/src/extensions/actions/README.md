# Actions — v1 (internal)

An **action event** is a named thing the POS is about to do (`cart.line.add`), dispatched
through a chain of **hooks** before the action's one writer, the **bottom handler**, runs. A hook
observes, rewrites or refuses the event. This is the third extension primitive beside slots
(UI in, `../slots`) and the server-delivered descriptors (config in).

Ruled in [wcpos/roadmap#421](https://github.com/wcpos/roadmap/issues/421), 2026-10-09; spec
`docs/specs/2026-10-09-action-event-contract-spec.md` in the roadmap repo.

- **Contract version:** `ACTION_API_VERSION = 1`.
- **Status: internal.** First-party hooks shipped in the same bundle as the host. Reachable
  **only** at `@wcpos/core/extensions/actions`, exported from no other barrel.

## The two axes

| You need                                                                              | Use                                          |
| ------------------------------------------------------------------------------------- | -------------------------------------------- |
| the fact that state changed, to redraw or rebroadcast                                 | an RxDB subscription (document or query `$`) |
| the intent, the actor, the moment before the write, or the power to refuse or rewrite | an action hook                               |

A hook never writes to a collection. The bottom handler is the action's one writer, and RxDB
then streams the result to the UI. RxDB's own `preInsert` / `preSave` hooks are infrastructure
(ids, populate), never an extension surface: pulls bypass them and a throwing `preSave` rejects
unrelated queued writes.

## The events (closed list)

| Event              | Raised by           | Rewritable keys | Can refuse |
| ------------------ | ------------------- | --------------- | ---------- |
| `cart.line.add`    | `useAddItemToOrder` | `line`          | yes        |
| `cart.line.update` | `useUpdateLineItem` | `changes`       | yes        |

First registered hooks: `stock.guard.add` and `stock.guard.update` (`screens/main/pos/hooks/stock-guard-hook.ts`),
the prevent-overselling check moved onto the two cart events as guards. Ids are unique per event
and strikes follow the id, so the two stock functions carry distinct ids: a fault in one never
disables the other.

**Admission test** for a new event, all three: (a) one writer function already exists for the
action, (b) the event has a typed result, (c) a named consumer is waiting. Candidates that fail
(a) today: `checkout.tender.commit` and `checkout.complete` (their slices are next), receipt
print, register open/close, discount apply, customer set, refund.

## The hook

```ts
registerActionHook('cart.line.add', hook, { id: 'stock.guard', tier: 'guard', order: 0 });

const hook: ActionHook<'cart.line.add'> = async (ctx, e, next) => {
	if (!ctx.store.preventOverselling) return next(e); // observe
	if (short) return { deny: { reasonKey: 'pos_cart.only_n_available', params } }; // refuse
	const result = await next({ ...e, payload: { ...e.payload, line } }); // rewrite
	ctx.log('warn', 'Product will be backordered', { showToast: true }); // after-work
	return result;
};
```

- `e` is **deeply frozen plain data** (a JSON clone of the caller's input, never the caller's
  objects, never an `RxDocument`): `{ event, orderId, actor, source, payload }`. `actor` and
  `source` (`user | replay | system`) are stamped by the dispatcher.
- `return next(e)` observes; `next({ ...e, payload })` rewrites, and only the event's rewritable
  keys survive (the dispatcher restores the rest); returning `{ deny }` without calling `next`
  refuses; `await next(e)` then work is the after-hook. Once `next` was called, what the chain
  beneath answered is the dispatch's answer: the hook's own return is ignored, so an after-hook
  can neither replace a guard's refusal nor lose it by forgetting `return`.
- A `deny` of the hook's own returned **after** `next` is a failure (the writer may have written):
  a strike, and the inner result stands, so nothing is refused. Passing on the refusal an inner
  guard returned is not that. `next` called twice throws into the hook.

## Tiers and order

- `guard`: first-party only, runs **innermost** (right before the writer, after every
  extension's rewrite), may refuse, **fails closed**: a timeout before `next` refuses with
  `actions.hook_timeout`; a throw or a return without `next` refuses with `actions.hook_failed`;
  disabled refuses with `actions.hook_disabled`. A deny of its own after `next` is a strike and
  the inner answer stands. Passing on the refusal an inner guard returned is not a strike.
- `extension`: may observe and rewrite; its `deny` is ignored and logged; **fails open** (a
  timeout or throw skips it).
- Chain: extensions by `order` then `id`, then guards the same way, then the bottom handler.
  Rewrites flow inward, so every guard judges the payload the writer will write and an extension
  can never rewrite past a guard. The price: an extension's after-work runs after the guards'
  refusal is known, never before; and a refusal costs the extensions' work first.

## Budget and strikes

- `ACTION_BUDGET_MS[event]`: one budget per **tier** on a dispatch, started when that tier's
  first hook runs and shared by the tier's hooks, so a slow extension can never spend the guards'
  time (hook latency before the writer is bounded by two budgets; the after-work budgets below
  add one per hook that called `next`, since each starts when the chain beneath it settles); the bottom
  handler's time is not counted, and neither is the time a hook spends waiting on `next` (its
  own timer stops when it calls `next`; the hooks beneath keep theirs). A hook still pending at
  the deadline before calling `next` is timed out; it keeps running in JavaScript but its result
  is ignored and it can reach nothing (`ctx` is frozen and read-only, no document is in reach).
  After-work (once `next` has answered) gets a fresh budget of the same length for every hook that
  called `next`: a hook that never returns is struck and the inner answer stands, so the dispatch, and the order's queue behind it,
  never hang.
- `ACTION_HOOK_STRIKES` failures in a session (a timeout, a throw, a return without `next`, or a
  deny of its own after `next`) switch a hook off. Every strike writes a warn row (`Action hook
failed`, with the reason and the error message); the disabling writes one more. A disabled extension leaves the chain. A disabled **guard stays** and refuses every
  dispatch with `actions.hook_disabled`, because a money-path guard that silently dropped out
  would fail open.

## Where a dispatch runs

Every dispatch runs **inside** `enqueueOrderMutation(orderId, …)`: `dispatchAction` takes the
queue's `dispatchToken` and throws without one. The queue serialises an order's writes, so a
rewrite is always applied against an unchanged target.

## Do not

- Write to a collection from a hook. The bottom handler is the one writer.
- Pass an `RxDocument` or any live object in `payload`; `toJSON()` it.
- Dispatch outside the order mutation queue.
- Give `ctx` an effectful method that runs before `next`.
- Put anything live in `deny.detail`; it is frozen on the way out, so it holds plain data the
  guard built itself (ids, counts), never a catalog record.
- Mint a dispatch token anywhere but the order mutation queue (the factory is deliberately not
  on this module's barrel; the queue imports it from `registry.ts`).
- Add an event that fails the admission test, or a matcher argument (none in v1).
- Swallow a refusal. A caller that maps a refusal to `false` first calls `presentActionRefusal(ctx,
refusal)`, which shows the translated reason unless the hook set `deny.presented` (it toasted
  itself, as the stock guard does). The dispatcher's own refusals (`actions.hook_timeout`,
  `actions.hook_failed`, `actions.hook_disabled`) are never presented by a hook.
- Rely on `undefined` surviving the clone: `e` is a JSON clone, so an `undefined` value is dropped;
  use `null` to clear a field.
