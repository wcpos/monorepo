/**
 * Scope-guarded operation — the generic scope-safety seam, distilled from
 * scopeGuardedPull.ts (and the since-deleted orders-only scopeGuardedPush.ts,
 * which the generic push rides this template for now). The pull specialization
 * closes over pull-specific shapes (a checkpoint store guarded as a SECOND
 * write, the pending-mutation provider). This is the bare mechanic underneath,
 * for every operation that is not that pull:
 *
 *   - run under ONE ScopeBound — captured here via manager.runGuarded, or
 *     PASSED IN when the operation is one arm of a larger bound operation (the
 *     change-signal tick runs poll + plan + apply inside a single runGuarded,
 *     so a switch mid-poll drops every arm against the captured scope instead
 *     of the newly-active one);
 *   - GATHER the payload (`produce`) through the bound scoped fetch — late
 *     responses dropped + counted, a switch before the first request refuses
 *     network work (bound.bindFetch);
 *   - COMMIT the payload (`commit`) through ONE bound.guardWrite — a stale
 *     write is dropped + counted, never persisted.
 *
 * The playground's targeted product pull (paginated `include=` fetch → bulk
 * upsert) and product delete (write-only tombstone application) ride this, so
 * the ticket/scopedFetch/guardWrite wiring lives in sync-core, not inline in a
 * host. sync-core stays pure: the produce callback owns all URL/Woo/rxdb
 * specifics, this module only owns the scope-safety mechanic.
 */

import {
	type Fetcher,
	type ScopeBound,
	ScopeStaleError,
	type StoreScopeManager,
} from './storeScopeManager';

export type ScopeGuardedOperationResult = {
	/**
	 * - 'applied':  produced and committed under a still-current ticket
	 * - 'dropped':  the guarded commit arrived after the scope moved on — counted
	 *               + evented by the manager, never persisted
	 * - 'stale':    a response landed after the epoch moved (ScopeStaleError from
	 *               the scoped fetch) — the commit was never attempted
	 * - 'aborted':  an in-flight request was aborted, or a request refused to
	 *               start because the captured ticket had already moved on
	 * - 'error':    any other failure (HTTP error, produce/commit throw, ...)
	 */
	status: 'applied' | 'dropped' | 'aborted' | 'stale' | 'error';
	/** Records the guarded commit applied; 0 unless 'applied'. */
	applied: number;
	detail?: string;
};

/**
 * Runs one scope-guarded operation. `produce` GATHERS a payload (optional —
 * write-only operations like a delete omit it and the fetcher); `commit` WRITES
 * it and returns the count applied. The fetch wrapping (bound pre-check +
 * scoped fetch) and the guardWrite both happen HERE, so hosts cannot forget a
 * guard — exactly the runScopeGuardedPull contract.
 *
 * When `bound` is omitted, the operation is captured HERE via
 * manager.runGuarded — capture time is call time, by construction. When this
 * operation is one arm of a larger bound operation (the change-signal tick
 * runs poll + plan + apply under a single runGuarded), the caller passes its
 * bound in, and THAT capture — not a fresh, possibly-newly-current one — is
 * what every fetch and the commit are guarded against.
 */
export async function runScopeGuardedOperation<T = void>(input: {
	manager: StoreScopeManager;
	/** The enclosing operation's bound (the change-signal binding). Omit to capture at call time. */
	bound?: ScopeBound;
	/** Raw host fetcher; bound.bindFetch (pre-check + scoped fetch) is applied HERE. Omit for write-only operations. */
	fetcher?: Fetcher;
	/**
	 * Gather the payload to write, through the bound scoped fetcher passed in.
	 * Runs AFTER capture, so a switch landing during it (or during an await
	 * before its first request) drops the operation. Omit for write-only
	 * operations.
	 */
	produce?: (scopedFetch: Fetcher, guardWrite: ScopeBound['guardWrite']) => Promise<T>;
	/** Write the gathered payload under one guardWrite; return the count applied. */
	commit: (produced: T) => Promise<number>;
}): Promise<ScopeGuardedOperationResult> {
	const operation = async (bound: ScopeBound): Promise<ScopeGuardedOperationResult> => {
		// Built only when a fetcher is supplied; a produce that fetches without one
		// is a wiring mistake, surfaced loudly rather than silently swallowed.
		const scopedFetch: Fetcher = input.fetcher
			? bound.bindFetch(input.fetcher)
			: () => {
					throw new Error(
						'runScopeGuardedOperation: produce attempted a fetch but no fetcher was supplied'
					);
				};
		const produced = input.produce
			? await input.produce(scopedFetch, bound.guardWrite.bind(bound))
			: (undefined as T);
		let applied = 0;
		const writeResult = await bound.guardWrite(async () => {
			applied = await input.commit(produced);
		});
		if (writeResult === 'dropped') {
			return { status: 'dropped', applied: 0 };
		}
		return { status: 'applied', applied };
	};

	try {
		return input.bound ? await operation(input.bound) : await input.manager.runGuarded(operation);
	} catch (error) {
		const { category, detail } = classifyScopeError(error);
		return { status: category, applied: 0, detail };
	}
}

/**
 * The write half of the swap guard: applies one host write-back only under a
 * still-current (scope, epoch) ticket. A drop is counted by the manager
 * (wrongScopeWrites + a 'write-dropped' event) and surfaced as an
 * AbortError-named throw so the write drain treats it as a scope switch — the
 * mutation stays queued for the scope that owns it (drainMutationQueue skips
 * backoff and never acknowledges on an aborted ack) instead of acknowledging a
 * write that never landed.
 */
export async function applyScopeGuardedWrite(input: {
	/** The enclosing operation's bound — the write is guarded by ITS capture. */
	bound: ScopeBound;
	/** Names the write in the thrown drop message (diagnostics/telemetry). */
	label: string;
	write: () => Promise<void>;
}): Promise<void> {
	const outcome = await input.bound.guardWrite(input.write);
	if (outcome === 'dropped') {
		const dropped = new Error(`scope switched before ${input.label} could apply`);
		dropped.name = 'AbortError';
		throw dropped;
	}
}

/**
 * Maps a thrown error to the scope-guarded result category shared by every seam
 * (operation, pull, push): a late response is 'stale' (ScopeStaleError from the
 * scoped fetch), an abort is 'aborted' — classified BY NAME because DOMException
 * does not extend Error in every runtime (jsdom notably) — and anything else is
 * 'error'. `detail` is the human string each seam carries on its result. This is
 * the single home of that decision; each seam maps the category into its OWN
 * result shape (pull adds hasMore, push checks conflict first) and adds only
 * what is specific to it.
 */
export function classifyScopeError(error: unknown): {
	category: 'stale' | 'aborted' | 'error';
	detail: string;
} {
	const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
	if (error instanceof ScopeStaleError) {
		return { category: 'stale', detail };
	}
	if (
		typeof error === 'object' &&
		error !== null &&
		(error as { name?: string }).name === 'AbortError'
	) {
		return { category: 'aborted', detail };
	}
	return { category: 'error', detail };
}
