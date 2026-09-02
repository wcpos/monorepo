# Slots — v1 (internal)

A **slot** is a named UI insertion point in the app, identified by a closed dotted id with
the entry kind last (`pos.columns.panel`, `pos.products.filter-bar.item`). First-party code
registers entries into slots, in order, via the static typed registry in this directory.

Ruled in [wcpos/roadmap#139](https://github.com/wcpos/roadmap/issues/139), 2026-09-03.

- **Contract version:** `SLOT_API_VERSION = 1`.
- **Status: internal.** This is the 1.11 dogfood — the only consumers are first-party
  screens shipped in the same bundle. It is deliberately reachable **only** at
  `@wcpos/core/extensions/slots` and is exported from no other barrel, so nothing acquires
  it by accident before v2 makes it public.

## The contract

An entry component receives exactly three props (`SlotEntryProps`):

| prop    | what it is                                                              |
| ------- | ----------------------------------------------------------------------- |
| `data`  | a `ReadonlyView` — a readonly, subscribable value (`useSlotValue` reads it) |
| `api`   | the enumerated async methods for that slot; the host may reject any call |
| `entry` | the entry's own descriptor                                              |

Slot ids are a closed union (`keyof SlotContracts`), so a registration infers its contract
from the id it registers under. `getSlotEntries` orders by `order`, then `id`.

## Do not

- **Do not pass a database object across the slot boundary** — never an RxDB collection,
  document, or query. Slot props carry only JSON-serializable data plus the
  registry-provided functions. `registry.test.ts` holds descriptors to this by round-tripping
  them through `JSON.stringify`.
- **Do not export this module from another barrel**, or re-export it from `@wcpos/core`.
- **Do not add a slot id outside `SlotContracts`** — the union is closed on purpose.
- **Do not give an entry a synchronous host method.** Every `api` method returns a promise so
  the host stays free to defer, batch, or refuse.
- **Do not rely on registration order.** Order comes from the descriptor's `order` field.
