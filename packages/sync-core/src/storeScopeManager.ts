/**
 * Store-scope lifecycle manager.
 *
 * Store switching is pause/resume between coexisting per-scope databases
 * (CONTEXT.md "Store scope" / "Store switching") — never a teardown, and it
 * must work offline. The production failure class this answers
 * (docs/prior-art/wcpos-current-sync-engine.md §5, docs/wcpos-pain-points.md
 * §4 and §6) is in-flight work outliving its store context: fire-and-forget
 * `void cancel()` lets late HTTP responses bulk-write into the wrong
 * database, collection reset needs a 50ms "phantom removal" sleep, and store
 * databases are never closed.
 *
 * The fix is epoch-tagged cancellation: every async operation captures a
 * (scopeId, epoch) ticket at issue time; switching or resetting bumps the
 * global epoch and aborts that scope's in-flight AbortController; any result
 * that still arrives is checked against the current (scope, epoch) BEFORE any
 * write and dropped if stale — counted and evented, never silently lost.
 * Collection reset is deterministic and event-driven (stop feeders -> drop ->
 * recreate -> one 'reset' event); there are no timers anywhere in this file.
 * The mutation queue is irreplaceable (CONTEXT.md "Mutation queue"): a reset
 * that would destroy pending mutations returns 'needs-confirmation' unless
 * explicitly confirmed.
 *
 * Ticket capture is NOT a caller concern. `runGuarded(op)` is the only way to
 * bind work to a scope: it captures the ticket synchronously at call time and
 * hands the operation already-bound effects (`bindFetch`, `guardWrite`), so
 * "capture the ticket before any await" cannot be violated — there is no
 * public ticket to mint early, late, or twice (CONTEXT.md "Scope-guarded
 * pull": the guarantee lives behind the sync engine's interface, not in
 * caller discipline). Holding a ScopeBound past its operation only ever makes
 * it go STALE — writes drop; it can never capture fresher scope state.
 *
 * Cursor invalidation on collection reset is NOT a caller concern either.
 * Whatever owns a checkpoint or in-memory detection cursor fed by a
 * collection registers an invalidator (`registerCursorInvalidator`), and
 * `resetCollection` runs the matching invalidators INSIDE the serialized
 * reset — after feeders stop, BEFORE the drop — so a reset that resolves has
 * already rewound every registered cursor, and a failed invalidation aborts
 * the reset with the collection intact (a zeroed cursor over intact data
 * merely re-pulls; a stale cursor over an emptied collection silently skips
 * records — the bug class this kills). Hosts wire NOTHING off the 'reset'
 * event for cursors; forgetting the clear is no longer representable.
 */

export type ScopeId = string;

export type ScopeEvent = {
  type: 'switched' | 'reset' | 'write-dropped' | 'late-response-dropped' | 'needs-confirmation';
  scopeId: ScopeId;
  epoch: number;
  detail?: string;
};

export type ScopeDatabase = {
  listCollections(): string[];
  resetCollection(name: string): Promise<void>;
  pendingMutationCount(): Promise<number>;
  close(): Promise<void>;
};

/** Context captured at issue time for one async operation. Internal — the
 * public capture surface is `StoreScopeManager.runGuarded` / `ScopeBound`. */
type ScopeTicket = {
  scopeId: ScopeId;
  epoch: number;
  signal: AbortSignal;
};

/**
 * Module-private brand: makes ScopeBound nominal, so the ONLY way to obtain
 * one without an explicit unsound cast is `runGuarded` — a hand-rolled
 * structural literal cannot satisfy the symbol key and therefore cannot smuggle
 * an unguarded `guardWrite`/`bindFetch` past the seams that accept a bound
 * (codex review on #431).
 */
const SCOPE_BOUND_BRAND = Symbol('sync-core.ScopeBound');

/**
 * The effects of one scope-bound operation, captured synchronously by
 * `runGuarded` at operation start. Everything on it is pinned to that
 * captured (scope, epoch): once the scope is switched away from or reset,
 * `bindFetch` refuses to start network work, `guardWrite` drops (counted +
 * evented), and `isCurrent()` reports false. Safe to close over — a held
 * ScopeBound can only go stale, never re-capture.
 */
export type ScopeBound = {
  /** Nominal brand — constructed only by `runGuarded`. See SCOPE_BOUND_BRAND. */
  readonly [SCOPE_BOUND_BRAND]: true;
  readonly scopeId: ScopeId;
  /** Epoch at capture — diagnostics/telemetry, not a guard input. */
  readonly epoch: number;
  /** Aborts when this captured scope is switched, reset, or closed. Engine
   * lanes combine it with their caller's cancellation signal for host ports
   * that are not fetch-based. */
  readonly signal: AbortSignal;
  /**
   * Binds a RAW host fetcher to this operation's captured ticket: a stale or
   * aborted ticket refuses to start the request (AbortError-named throw); a
   * non-aborted response landing after the epoch moved is dropped (counted,
   * evented, ScopeStaleError). Do NOT pass a pre-scoped fetcher, and do not
   * pass a signal in init — the live scope signal is bound internally (a
   * second signal would force AbortSignal.any, which some RN/Expo fetch
   * polyfills lack).
   */
  bindFetch(fetcher: Fetcher): Fetcher;
  /**
   * Applies the write only if this operation's captured (scope, epoch) is
   * still current. A stale write is counted, evented as 'write-dropped', and
   * never invoked.
   */
  guardWrite(write: () => Promise<void>): Promise<'applied' | 'dropped'>;
  /** False once the captured scope was switched away from or reset. */
  isCurrent(): boolean;
};

/** Same shape as the Fetcher convention in customPullAdapter.ts. */
export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/** The only client-side collection that cannot be re-fetched from the server. */
export const MUTATION_QUEUE_COLLECTION = 'mutations';

/**
 * Thrown by `scopedFetch` when a non-aborted response lands after its scope
 * was switched away from or reset. Always preceded by a
 * 'late-response-dropped' event.
 */
export class ScopeStaleError extends Error {
  readonly scopeId: ScopeId;
  readonly epoch: number;
  readonly currentEpoch: number;

  constructor(input: { scopeId: ScopeId; epoch: number; currentEpoch: number }) {
    super(
      `Stale scope ticket: (${input.scopeId}, epoch ${input.epoch}) issued before epoch moved to ${input.currentEpoch}`,
    );
    this.name = 'ScopeStaleError';
    this.scopeId = input.scopeId;
    this.epoch = input.epoch;
    this.currentEpoch = input.currentEpoch;
  }
}

type SubscriptionEntry = {
  teardown: () => void;
  done: boolean;
};

export class StoreScopeManager {
  private readonly createDatabase: (scopeId: ScopeId) => Promise<ScopeDatabase>;
  private readonly now: () => number;
  private readonly databases = new Map<ScopeId, ScopeDatabase>();
  /** One AbortController per (scope, current epoch for that scope); replaced on bump. */
  private readonly controllers = new Map<ScopeId, AbortController>();
  private readonly subscriptions = new Map<ScopeId, Set<SubscriptionEntry>>();
  /** collection name -> invalidators for the cursors that collection feeds. */
  private readonly cursorInvalidators = new Map<string, Set<(scopeId: ScopeId) => void | Promise<void>>>();
  /**
   * Scopes with a reset/close currently executing. A capture issued INSIDE
   * that window holds the already-bumped epoch — without this it would be
   * "current" and could write between the cursor rewind and the drop (e.g.
   * advance the just-zeroed cursor, then have its data removed by the drop:
   * a stale cursor over an empty replica through the direct-manager path).
   * isCurrent treats a mutating scope as stale, so mid-window writes and
   * fetches drop/refuse exactly like any other stale work.
   */
  private readonly mutatingScopes = new Set<ScopeId>();
  private readonly listeners = new Set<(event: ScopeEvent) => void>();
  private active: ScopeId | null = null;
  private currentEpoch = 0;
  private wrongScopeWrites = 0;
  private lateResponsesDropped = 0;
  /**
   * In-flight guarded writes per scope. Lifecycle operations bump the epoch
   * first (so no NEW write can pass the guard) and then drain these before
   * touching the database — a write that passed the guard check must finish
   * before a reset can drop the collection underneath it.
   */
  private readonly inflightWrites = new Map<ScopeId, Set<Promise<unknown>>>();

  /** Serializes switchTo/open/reset/close so racing lifecycle ops cannot interleave. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(input: { createDatabase: (scopeId: ScopeId) => Promise<ScopeDatabase>; now?: () => number }) {
    this.createDatabase = input.createDatabase;
    this.now = input.now ?? (() => Date.now());
  }

  get activeScope(): ScopeId | null {
    return this.active;
  }

  /** Global epoch — bumps on every switch and reset. */
  get epoch(): number {
    return this.currentEpoch;
  }

  /** Creates and caches the scope database. Does NOT activate it. */
  open(scopeId: ScopeId): Promise<void> {
    return this.enqueue(async () => {
      await this.ensureOpen(scopeId);
    });
  }

  /**
   * Pause the outgoing scope and resume the target: aborts the outgoing
   * scope's in-flight signals, bumps the epoch, activates the target (opening
   * it if needed). The outgoing database STAYS OPEN — pause, not teardown.
   * Atomic: concurrent calls are serialized, never interleaved.
   * Switching to the already-active scope is a no-op (no bump, no event).
   */
  switchTo(scopeId: ScopeId): Promise<{ scopeId: ScopeId; epoch: number }> {
    return this.enqueue(async () => {
      if (this.active === scopeId) {
        return { scopeId, epoch: this.currentEpoch };
      }
      await this.ensureOpen(scopeId);
      const outgoing = this.active;
      if (outgoing !== null) {
        this.abortAndReplaceController(outgoing);
      }
      this.currentEpoch += 1;
      if (outgoing !== null) {
        await this.drainGuardedWrites(outgoing);
      }
      this.active = scopeId;
      this.emit({
        type: 'switched',
        scopeId,
        epoch: this.currentEpoch,
        detail: outgoing === null ? undefined : `from ${outgoing}`,
      });
      return { scopeId, epoch: this.currentEpoch };
    });
  }

  /**
   * The ONLY way to bind work to the active scope. Captures the (scope,
   * epoch) ticket SYNCHRONOUSLY — before the operation body runs, so capture
   * time and operation start are the same instant and no await can slip
   * between them — then invokes the operation with the already-bound effects.
   * Throws synchronously if no scope is active. Errors from the operation
   * propagate untouched (classify with `classifyScopeError` where a seam
   * needs the stale/aborted/error split).
   *
   * The operation may freely await, switch scopes, or outlive a reset: every
   * effect on `bound` stays pinned to the capture, so late work drops instead
   * of landing on whichever scope is active by then.
   */
  runGuarded<T>(operation: (bound: ScopeBound) => Promise<T>): Promise<T> {
    const ticket = this.issueTicket();
    const bound: ScopeBound = {
      [SCOPE_BOUND_BRAND]: true,
      scopeId: ticket.scopeId,
      epoch: ticket.epoch,
      signal: ticket.signal,
      bindFetch: (fetcher) => this.ticketBoundFetch(ticket, fetcher),
      guardWrite: (write) => this.guardWrite(ticket, write),
      isCurrent: () => this.isCurrent(ticket),
    };
    return operation(bound);
  }

  /**
   * Capture (scopeId, epoch, signal) for an async operation. The signal
   * aborts when this scope is switched away from or reset. Private: capture
   * happens only inside runGuarded, at operation start.
   */
  private issueTicket(): ScopeTicket {
    if (this.active === null) {
      throw new Error('Cannot issue a scope ticket: no active scope');
    }
    return {
      scopeId: this.active,
      epoch: this.currentEpoch,
      signal: this.controllerFor(this.active).signal,
    };
  }

  /**
   * Applies the write only if the ticket still matches the current
   * (scope, epoch). A stale ticket is counted, evented as 'write-dropped',
   * and the write is never invoked. Private: reached through
   * `ScopeBound.guardWrite`.
   */
  private async guardWrite(ticket: ScopeTicket, write: () => Promise<void>): Promise<'applied' | 'dropped'> {
    if (!this.isCurrent(ticket)) {
      this.wrongScopeWrites += 1;
      this.emit({
        type: 'write-dropped',
        scopeId: ticket.scopeId,
        epoch: ticket.epoch,
        detail: this.staleDetail(ticket),
      });
      return 'dropped';
    }
    const pending = write();
    const registry = this.inflightWrites.get(ticket.scopeId) ?? new Set();
    this.inflightWrites.set(ticket.scopeId, registry);
    const tracked = pending.finally(() => registry.delete(tracked));
    registry.add(tracked);
    await tracked;
    return 'applied';
  }

  /** Settles every in-flight guarded write for a scope (post-epoch-bump drain). */
  private async drainGuardedWrites(scopeId: ScopeId): Promise<void> {
    const registry = this.inflightWrites.get(scopeId);
    if (!registry || registry.size === 0) {
      return;
    }
    await Promise.allSettled([...registry]);
  }

  /**
   * Wraps a fetcher so every call is epoch-tagged: issues a ticket, passes
   * its abort signal, and if the response lands after the epoch moved, emits
   * 'late-response-dropped' and throws ScopeStaleError instead of returning
   * the stale response. Private: per-call capture is an implementation detail
   * of ticketBoundFetch; operations bind through `ScopeBound.bindFetch`.
   */
  private scopedFetch(fetcher: Fetcher): Fetcher {
    return async (url, init) => {
      const ticket = this.issueTicket();
      const signal = init?.signal ? AbortSignal.any([init.signal, ticket.signal]) : ticket.signal;
      const response = await fetcher(url, { ...init, signal });
      if (!this.isCurrent(ticket)) {
        this.lateResponsesDropped += 1;
        this.emit({
          type: 'late-response-dropped',
          scopeId: ticket.scopeId,
          epoch: ticket.epoch,
          detail: this.staleDetail(ticket),
        });
        throw new ScopeStaleError({
          scopeId: ticket.scopeId,
          epoch: ticket.epoch,
          currentEpoch: this.currentEpoch,
        });
      }
      return response;
    };
  }

  /**
   * Binds a raw fetcher to a PRE-ISSUED ticket. Every request first re-checks
   * THAT ticket — aborted, or its (scope, epoch) moved on → refuse to start
   * network work, throwing an AbortError-named error — then delegates to
   * scopedFetch (per-call late-response drop + ScopeStaleError). A long-running
   * operation that captures ONE ticket up front and fetches through this — a
   * paginated pull, a push, a targeted product pull — therefore drops if a
   * switch/reset lands between requests, OR during an await BEFORE the first
   * request, instead of burning a request against a scope the ticket no longer
   * owns.
   *
   * This is the single home of that ticket-binding wiring. Private: reached
   * through `ScopeBound.bindFetch`. Do NOT pass an already-scoped fetcher —
   * hand over the raw host fetcher; scopedFetch is applied inside. No explicit
   * signal is forwarded (scopedFetch binds the live scope signal on its own),
   * so callers must not pass one either — a second signal would force
   * AbortSignal.any, which throws on RN/Expo fetch polyfills.
   */
  private ticketBoundFetch(ticket: ScopeTicket, fetcher: Fetcher): Fetcher {
    const scoped = this.scopedFetch(fetcher);
    return async (url, init) => {
      if (ticket.signal.aborted || !this.isCurrent(ticket)) {
        const stale = new Error(
          `scope ticket stale before fetch (scope ${ticket.scopeId}, epoch ${ticket.epoch})`,
        );
        stale.name = 'AbortError';
        throw stale;
      }
      return scoped(url, init);
    };
  }

  /**
   * Registers a per-scope teardown. Switching away pauses nothing here —
   * subscriptions belong to their scope and stay. resetCollection and
   * closeScope run and clear the scope's teardowns. Unsubscribe is
   * idempotent and runs the teardown once.
   */
  registerSubscription(scopeId: ScopeId, teardown: () => void): { unsubscribe(): void } {
    const entry: SubscriptionEntry = { teardown, done: false };
    let entries = this.subscriptions.get(scopeId);
    if (!entries) {
      entries = new Set();
      this.subscriptions.set(scopeId, entries);
    }
    entries.add(entry);
    return {
      unsubscribe: () => {
        if (entry.done) {
          return;
        }
        entry.done = true;
        entries.delete(entry);
        entry.teardown();
      },
    };
  }

  /**
   * Registers an invalidator for the cursors fed by `collection` — the
   * durable pull checkpoint, an in-memory change-signal engine's sequence
   * cursor / sweep baseline, whatever must rewind to zero when that
   * collection's local replica is wiped. Register it WHERE the cursor source
   * is created, once per source; the manager holds the mapping so no host
   * re-derives "which cursors die on which reset".
   *
   * The invalidator runs inside `resetCollection` for the matching
   * collection, after feeders stop and BEFORE the drop, and receives the
   * scope being reset (cursors are per-scope). It must be idempotent. A
   * throw aborts the reset with the collection intact — see resetCollection.
   * A store SWITCH never invokes invalidators: cursors survive pause/resume
   * (CONTEXT.md "Store switching").
   *
   * Returns an unregister function (idempotent).
   */
  registerCursorInvalidator(
    collection: string,
    invalidate: (scopeId: ScopeId) => void | Promise<void>,
  ): () => void {
    let entries = this.cursorInvalidators.get(collection);
    if (!entries) {
      entries = new Set();
      this.cursorInvalidators.set(collection, entries);
    }
    entries.add(invalidate);
    return () => {
      entries.delete(invalidate);
    };
  }

  /**
   * Deterministic, event-driven reset: stop feeders (bump epoch, abort the
   * scope's in-flight signals, drain guarded writes) -> rewind the
   * registered cursors -> run subscription teardowns -> drop -> recreate
   * (delegated to the database) -> emit ONE 'reset' event for
   * resubscription. No timers, no polling.
   *
   * Resetting the mutation queue with pending mutations returns
   * 'needs-confirmation' without touching the database unless
   * `confirmDestroyQueue` is set. Data collections always reset; the
   * mutation queue is never touched by a data-collection reset.
   *
   * Cursor ordering is load-bearing (proven in
   * apps/web/src/integration/collectionResetRxdb.test.ts): invalidators run
   * AFTER the epoch bump + guarded-write drain (nothing can re-persist a
   * stale cursor once they run — every later write drops) and BEFORE the
   * drop, so every failure mode is safe without host machinery: an
   * invalidator throw aborts the reset with the collection intact and no
   * 'reset' event (a zeroed-or-partial cursor over intact data merely
   * re-pulls redundantly); only after every registered cursor rewound does
   * the data drop. The stale-cursor-over-empty-replica state — the bug that
   * used to require each host to wire clears off the 'reset' event — cannot
   * be produced through this method.
   */
  resetCollection(
    scopeId: ScopeId,
    name: string,
    opts?: {
      confirmDestroyQueue?: boolean;
      beforeDrop?: () => Promise<void>;
    },
  ): Promise<'reset' | 'needs-confirmation'> {
    return this.enqueue(async () => {
      const database = this.databases.get(scopeId);
      if (!database) {
        throw new Error(`Cannot reset collection "${name}": scope ${scopeId} is not open`);
      }
      if (!database.listCollections().includes(name)) {
        throw new Error(`Cannot reset unknown collection "${name}" in scope ${scopeId}`);
      }
      if (name === MUTATION_QUEUE_COLLECTION && !opts?.confirmDestroyQueue) {
        const pending = await database.pendingMutationCount();
        if (pending > 0) {
          this.emit({
            type: 'needs-confirmation',
            scopeId,
            epoch: this.currentEpoch,
            detail: `${pending} pending mutation(s) would be destroyed by resetting "${name}"`,
          });
          return 'needs-confirmation';
        }
      }
      // From here to the finally, captures against this scope are stale by
      // construction (isCurrent checks mutatingScopes): a tick racing the
      // reset window cannot write between the cursor rewind and the drop.
      this.mutatingScopes.add(scopeId);
      try {
        this.currentEpoch += 1;
        this.abortAndReplaceController(scopeId);
        await this.drainGuardedWrites(scopeId);
        await opts?.beforeDrop?.();
        // Cursors rewind BEFORE the drop; a throw here aborts the reset with
        // the collection intact (see the method contract above). Subscriptions
        // are still alive at this point — an aborted reset must not leave
        // feeders torn down with no 'reset' event to resubscribe on.
        for (const invalidate of [...(this.cursorInvalidators.get(name) ?? [])]) {
          await invalidate(scopeId);
        }
        this.teardownScopeSubscriptions(scopeId);
        await database.resetCollection(name);
        this.emit({ type: 'reset', scopeId, epoch: this.currentEpoch, detail: name });
        return 'reset';
      } finally {
        this.mutatingScopes.delete(scopeId);
      }
    });
  }

  /**
   * Explicit eviction (e.g. logout) — the one path that actually closes a
   * scope database (the production engine never closes them). Aborts the
   * scope's in-flight signals, runs and clears its teardowns, closes the
   * database, and removes it from the cache. No-op if the scope is not open.
   */
  closeScope(scopeId: ScopeId): Promise<void> {
    return this.enqueue(async () => {
      const database = this.databases.get(scopeId);
      if (!database) {
        return;
      }
      // Same mid-window guard as resetCollection: a capture racing the close
      // must not write into a database that is being closed underneath it.
      this.mutatingScopes.add(scopeId);
      try {
        this.controllers.get(scopeId)?.abort();
        this.controllers.delete(scopeId);
        await this.drainGuardedWrites(scopeId);
        this.teardownScopeSubscriptions(scopeId);
        this.subscriptions.delete(scopeId);
        this.databases.delete(scopeId);
        if (this.active === scopeId) {
          this.active = null;
        }
        await database.close();
      } finally {
        this.mutatingScopes.delete(scopeId);
      }
    });
  }

  onEvent(cb: (event: ScopeEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  stats(): {
    wrongScopeWrites: number;
    lateResponsesDropped: number;
    activeSubscriptions: number;
    epoch: number;
    scopesOpen: number;
  } {
    let activeSubscriptions = 0;
    for (const entries of this.subscriptions.values()) {
      activeSubscriptions += entries.size;
    }
    return {
      wrongScopeWrites: this.wrongScopeWrites,
      lateResponsesDropped: this.lateResponsesDropped,
      activeSubscriptions,
      epoch: this.currentEpoch,
      scopesOpen: this.databases.size,
    };
  }

  private async ensureOpen(scopeId: ScopeId): Promise<ScopeDatabase> {
    const existing = this.databases.get(scopeId);
    if (existing) {
      return existing;
    }
    const database = await this.createDatabase(scopeId);
    this.databases.set(scopeId, database);
    return database;
  }

  private controllerFor(scopeId: ScopeId): AbortController {
    let controller = this.controllers.get(scopeId);
    if (!controller) {
      controller = new AbortController();
      this.controllers.set(scopeId, controller);
    }
    return controller;
  }

  private abortAndReplaceController(scopeId: ScopeId): void {
    this.controllers.get(scopeId)?.abort();
    this.controllers.set(scopeId, new AbortController());
  }

  private teardownScopeSubscriptions(scopeId: ScopeId): void {
    const entries = this.subscriptions.get(scopeId);
    if (!entries) {
      return;
    }
    for (const entry of [...entries]) {
      entries.delete(entry);
      if (!entry.done) {
        entry.done = true;
        entry.teardown();
      }
    }
  }

  // Binding long-lived operations to a captured ticket is not a caller
  // concern: runGuarded owns capture, ScopeBound owns the bound effects, so
  // the currency predicate stays private — there is one sanctioned way to
  // bind, not a loose isCurrent for hosts to re-implement the guard around.
  private isCurrent(ticket: ScopeTicket): boolean {
    return (
      ticket.scopeId === this.active &&
      ticket.epoch === this.currentEpoch &&
      !this.mutatingScopes.has(ticket.scopeId)
    );
  }

  private staleDetail(ticket: ScopeTicket): string {
    const current = this.active === null ? 'none' : this.active;
    return `ticket (${ticket.scopeId}, epoch ${ticket.epoch}) vs current (${current}, epoch ${this.currentEpoch}) at ${this.now()}`;
  }

  private emit(event: ScopeEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  /** Promise-chain mutex: lifecycle operations run strictly one at a time. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
