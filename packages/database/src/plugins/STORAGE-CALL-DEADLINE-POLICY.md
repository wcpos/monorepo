# Storage-call deadline policy

The one statement of how a storage call's clock is allowed to behave, on every platform and every
engine. Written down once (#2242, from the #2146 ruling) because the 30 s storage timeout was
written in 1.8.x, deleted in 2026-04, and reinvented on web in 2026-08 after a live incident; the
next engine must not reinvent it a third time. The implementation is
`wrapped-error-handler-storage.ts`; each line below names the constant or function that carries it.

1. **A deadline informs; it never cancels.** No wrapper can cancel an RPC in flight — a worker,
   an IPC bridge and a native binding all keep working after the page stops waiting — so a
   deadline only changes what the caller is told, never what storage does.
   (`raceStorageCall`, `STORAGE_RPC_STALL_REPORT_MS` is report-only.)

2. **Reads may be failed by the clock.** A read is idempotent and the worst case of a wrong guess
   is a spurious banner, so the watchdog condemns the worker after two consecutive
   `STORAGE_RPC_WATCHDOG_MS` windows in which nothing answered, and only the watched read methods
   arm it (`WATCHDOG_WATCHED_METHODS`, `STORAGE_RPC_SILENT_WINDOWS_BEFORE_DEAD`). The condemned
   state is a one-shot latch (`worker-lost`) cleared only by a reload. Opening a store
   (`createStorageInstance`) is the one non-read call that arms the watchdog: it is a remote RPC
   with no instance yet to arm a read against, so its expiry rejects the open as a bootstrap error
   rather than leaving the app on a spinner forever.

3. **Writes are never failed by the clock, only signalled — and the signal blocks Pay.** Rejecting
   a `bulkWrite` on elapsed time would tell the caller it failed while it may still commit, which is
   how a sale gets rung twice. A caller that has waited `STORAGE_WRITE_DEADLINE_MS` calls
   `noteStorageWriteDeadlinePassed`, which raises `write-stalled` on `degradedStorage$`; the
   checkout save (`use-checkout-save.ts`) arms it around the order enqueue, and the money-path guard
   blocks Pay while it is raised. The write itself is still awaited; the next successful storage
   call on any database clears the entry.

4. **A write of unknown outcome is resolved by reading the document back, never by retrying the
   write.** After a stall, a worker loss or a reload, the record's current state is the truth
   (`await-write-outcome.ts` waits for the outcome event; under WAL a committed write is durable
   after reopen). Retrying blind is the duplicate-order path.

5. **Every platform adapter is built with the error-handler wrapper.** `adapters/default/index.web.ts`,
   `index.electron.ts` and `index.ts` wrap their raw storage with `wrappedErrorHandlerStorage` before
   anything else sees it; `adapters/default/error-handler-wrapping.test.ts` fails when any platform
   drops it. The ephemeral adapter (`adapters/ephemeral`) is the one deliberate exception: it is
   in-memory, single-process and never persists a sale, so there is no boundary to watch.

What the policy does not say: a latency target. A slow call is never failed on elapsed time alone
(`storageCompletions` feeds the liveness clock; only total silence condemns).
