# Actions ledger

Decisions this directory lives under, one line each, appended never rewritten. Ruling:
wcpos/roadmap#421 (2026-10-09); spec `docs/specs/2026-10-09-action-event-contract-spec.md`.

1. A disabled guard stays in the chain and refuses (`actions.hook_disabled`); a disabled extension leaves it. The brief that built this said "disabled hooks are excluded", which would have let the stock guard fail open after three strikes — corrected on review, 2026-10-09.
2. Duplicate ids warn and replace outside production, throw in production, for the reason the slot registry gives (Fast Refresh and tests re-evaluate registering modules).
3. `e` is a JSON clone, deep-frozen; the caller's objects are never frozen (an RxDB payload must not be).
4. After-work (what a hook does once `await next(e)` returned) is not bounded by the budget: the budget's timers are cleared when the chain reaches the bottom handler. The writer's time is not a hook's to pay for; a slow after-hook is the consumer's bug to find in its own tests.
5. A hook that outlives the budget gets a no-op `catch` on its promise so its later rejection is never an unhandled rejection.
6. The primitive landed alone (slice 1a) with no consumer: the stock-guard move (1b) is the next PR, because together they passed the 400-line ceiling.
