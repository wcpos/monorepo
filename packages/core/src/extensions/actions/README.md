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
  refuses; `await next(e)` then work is the after-hook.
- A `deny` returned **after** `next` is a failure (the writer has written): a strike, and the
  inner result stands. `next` called twice throws into the hook.

## Tiers and order

- `guard`: first-party only, runs **outermost**, may refuse, **fails closed** (a timeout or throw
  refuses with `actions.hook_timeout` / `actions.hook_failed`).
- `extension`: may observe and rewrite; its `deny` is ignored and logged; **fails open** (a
  timeout or throw skips it).
- Chain: guards by `order` then `id`, then extensions the same way, then the bottom handler.
  A guard that must judge the _final_ payload registers with the highest `order` among guards;
  rewrites flow inward, so it sees what the extensions before it left.

## Budget and strikes

- `ACTION_BUDGET_MS[event]`: one budget shared by every hook on a dispatch; the bottom
  handler's time is not counted. A hook still pending at the deadline is timed out; it keeps
  running in JavaScript but its result is ignored and it can reach nothing (`ctx` is read-only
  and no document is in reach).
- `ACTION_HOOK_STRIKES` timeouts or throws in a session switch a hook off; one warn row names
  it. A disabled extension leaves the chain. A disabled **guard stays** and refuses every
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
- Add an event that fails the admission test, or a matcher argument (none in v1).
