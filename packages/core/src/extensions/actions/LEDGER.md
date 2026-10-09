# Actions ledger

Decisions this directory lives under, one line each, appended never rewritten. Ruling:
wcpos/roadmap#421 (2026-10-09); spec `docs/specs/2026-10-09-action-event-contract-spec.md`.

1. A disabled guard stays in the chain and refuses (`actions.hook_disabled`); a disabled extension leaves it. The brief that built this said "disabled hooks are excluded", which would have let the stock guard fail open after three strikes — corrected on review, 2026-10-09.
2. Duplicate ids warn and replace outside production, throw in production, for the reason the slot registry gives (Fast Refresh and tests re-evaluate registering modules).
3. `e` is a JSON clone, deep-frozen; the caller's objects are never frozen (an RxDB payload must not be).
4. ~~After-work is not bounded by the budget.~~ Superseded by line 9: after-work has a budget of its own, so a hung after-hook cannot hold the order's queue.
5. A hook that outlives the budget gets a no-op `catch` on its promise so its later rejection is never an unhandled rejection.
6. The primitive landed alone (slice 1a) with no consumer: the stock-guard move (1b) is the next PR, because together they passed the 400-line ceiling.
7. Independent review of #2454 (first head) found three defects, all fixed with tests: an outer guard was struck for passing on an inner guard's refusal (now: the same refusal value passes through unstruck); a disabled extension could refuse a dispatch already in flight (now skipped; only a disabled guard refuses); a hook that returned without awaiting `next` let the dispatch settle before the writer (now the dispatch waits for the inner chain and a writer error propagates).
8. Second review of #2454 (head 7f3db4e5): a hook's own timer now stops when it calls `next` (an awaiting guard was being struck for a slow inner hook's time); and the chain order is reversed to **extensions first, guards last**, because with guards outermost an extension could rewrite a quantity after the stock guard had passed it. R3's "guards outermost" is amended on #421 as an overnight call; the fail-closed property it protected is kept (a guard still refuses before the writer), and what it loses is only that a refusal no longer saves the extensions' work.
9. Bots on the third head (#2454): a hook that calls `next` synchronously got a timer anyway (now none when `nextCalled` is already true); after-work that never returned left the dispatch pending forever (now a fresh budget of the same length starts when the inner chain settles; on timeout the hook is struck and the inner answer stands); a rewrite that could not be cloned was recorded as `next` called (now the clone happens first, so the throw is an ordinary hook failure).
