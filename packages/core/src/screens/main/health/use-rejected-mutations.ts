import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { type Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import {
	type DescribedQueueRow,
	observeDescribedQueueRows,
	REJECTED_QUEUE_STATUSES,
	useQueryRuntime,
} from '@wcpos/query';
import type { QueueRow, RxdbSyncEngine } from '@wcpos/sync-engine';

/**
 * The dead-letter feed for Store health → Database (#832).
 *
 * A `rejected` queue row is a write the server permanently refused — for a
 * CREATE that means a completed sale that exists only on this device and that
 * nothing will ever retry. Until this hook existed the only trace was a lumped
 * count, so the recovery story lived in a support session. Each row here carries
 * what a cashier needs to decide: what it was, what the server said, when, and
 * how many recoveries it has already survived.
 *
 * `residentMissing` is the one branch the UI must respect: recovery REBUILDS the
 * payload from the resident record, so a row whose record is gone from this
 * device can only be discarded.
 */
export type RejectedMutation = {
	mutationId: string;
	collectionName: string;
	recordId: string;
	operation: 'create' | 'update' | 'delete';
	/** Human handle for the record ("#1042 · 25.00"), or null when nothing names it. */
	label: string | null;
	/** The server's machine code (`rest_invalid_param`), when it sent one. */
	reason: string | null;
	/** The server's own sentence, when it sent one. */
	message: string | null;
	status: number | null;
	rejectedAt: string | null;
	/** Recoveries this chain has already survived; 0 for a first-time dead letter. */
	requeueCount: number;
	/** The record is no longer on this device — there is nothing to rebuild from. */
	residentMissing: boolean;
	/**
	 * Discarding this row DESTROYS the local record (#832 follow-up, R7b): a
	 * born-local create never reached the server, so there is no server version to
	 * fall back on and nothing will ever sync it — keeping it would leave an
	 * unsyncable ghost. The confirm copy must say so; every other row keeps its
	 * record, which is server truth.
	 */
	destroysRecord: boolean;
	/**
	 * Discarding MIGHT delete the record: the engine re-fetches the server document
	 * for a non-order row first, and removes the resident when the server no longer
	 * has it (`discardRemovesResident`). The client cannot know the answer without
	 * making that request, so the confirm says "if your server no longer has it"
	 * rather than promising either outcome (PR #1016 review — the old copy promised
	 * the record would be kept and then deleted it).
	 */
	mayDestroyRecord: boolean;
	/**
	 * The resident read FAILED — the record's state is unknown, so whether discard
	 * destroys it is unknowable too. Discard is disabled rather than shown behind a
	 * confirm that might be describing the wrong outcome (PR #1016 review). Distinct
	 * from `residentMissing`, which is a successful read finding nothing.
	 */
	residentUnknown: boolean;
};

function labelFor(resident: Record<string, unknown> | null, entry: QueueRow): string | null {
	const payload = (entry.payload ?? {}) as Record<string, unknown>;
	// Three sources, best first: orders promote `number`/`total` to the document
	// root; a collection without promoted columns keeps them in the resident's
	// nested payload; the queued snapshot is the last resort.
	const residentPayload = (resident?.payload ?? {}) as Record<string, unknown>;
	const number = resident?.number ?? residentPayload.number ?? payload.number;
	const total = resident?.total ?? residentPayload.total ?? payload.total;
	const parts = [
		typeof number === 'string' && number !== '' ? `#${number}` : null,
		typeof total === 'string' && total !== '' ? total : null,
	].filter((part): part is string => part !== null);
	return parts.length > 0 ? parts.join(' · ') : null;
}

function describe(rows: readonly DescribedQueueRow[]): RejectedMutation[] {
	const described = rows.map((entry) => {
		const { resident, residentRead, discard } = entry;
		return {
			mutationId: entry.mutationId,
			collectionName: entry.collectionName,
			recordId: entry.recordId,
			operation: entry.operation,
			label: labelFor(resident, entry),
			reason: entry.rejectedReason ?? null,
			message: entry.rejectedMessage ?? null,
			status: entry.rejectedStatus ?? null,
			rejectedAt: entry.rejectedAt ?? null,
			requeueCount: entry.requeueCount ?? 0,
			residentMissing: residentRead === 'missing',
			residentUnknown: residentRead === 'failed',
			destroysRecord: discard === 'destroys-record',
			mayDestroyRecord: discard === 'may-destroy-record',
		};
	});
	// Newest refusal first — the row a cashier is most likely looking for.
	return described.sort((a, b) => (b.rejectedAt ?? '').localeCompare(a.rejectedAt ?? ''));
}

/**
 * What the panel renders: the dead-letter rows, or the fact that they could not
 * be read. `readError` exists because "no rejected sales" and "cannot read
 * rejected sales" must never look the same to a cashier — an error rendered as
 * an empty panel hides exactly the unsynced sales this feed exists to surface.
 */
export type RejectedMutationsRead = { rows: RejectedMutation[]; readError: boolean };

function rejected$(engine: RxdbSyncEngine): Observable<RejectedMutationsRead> {
	return observeDescribedQueueRows(engine, { statuses: REJECTED_QUEUE_STATUSES }).pipe(
		map((rows) => ({ rows: describe(rows), readError: false })),
		// The resource is cached for the engine's whole life (that is the fix), so a
		// stream error must never be able to POISON it: `ObservableResource` latches
		// the error and `read()` would then throw forever, on every remount and every
		// scope switch, with no path to recovery. `describe()` already swallows a
		// failing resident read, but the RxDB query itself can still error on a
		// storage fault — degrade to a NON-throwing read-error emission so the
		// Database health screen stays usable while telling the cashier the panel
		// could not be read (never a silent empty state).
		catchError(() => of<RejectedMutationsRead>({ rows: [], readError: true }))
	);
}

/**
 * The resource MUST outlive the render that suspends on it (#40 / #832 — the
 * panel-hang this file exists to prevent). The house pattern —
 * `useMemo(() => new ObservableResource(…))` released in a `useEffect` cleanup —
 * is quietly broken for a panel that suspends BEFORE it ever commits: a
 * suspending render never runs its effects, so the resource is never registered
 * for cleanup, and — worse — React throws the memoized value away when it
 * discards the aborted render, so every Suspense retry builds a FRESH resource
 * that suspends again on its own async first emission. The panel spins forever.
 *
 * `useQueuedEmails` gets away with the same pattern only because its observable
 * emits `of([])` SYNCHRONOUSLY on the first render (its collection is initially
 * undefined), so it commits once and its memo is preserved thereafter. This panel
 * mounts only behind the `rejected > 0` gate — a live database with rejected rows
 * — so it ALWAYS takes the async `describe()` path and ALWAYS suspends first.
 *
 * The fix is to hold the resource OUTSIDE the component's render/commit
 * lifecycle: one per engine in a module-scoped WeakMap. Every Suspense retry
 * reads the SAME resource, whose first emission (once it lands) has already
 * cleared the suspender — so `read()` returns the value and the panel commits.
 * Keyed on the engine so a scope switch (the engine re-emits via `db$`) is
 * followed by the one live subscription, and the entry is released when the
 * engine is disposed and garbage-collected. There is nothing to tear down in an
 * effect: a single query subscription per engine is the correct lifetime, and
 * tying it to a never-committing render is exactly the bug.
 */
const resourceByEngine = new WeakMap<RxdbSyncEngine, ObservableResource<RejectedMutationsRead>>();

function rejectedResource(engine: RxdbSyncEngine): ObservableResource<RejectedMutationsRead> {
	let resource = resourceByEngine.get(engine);
	if (!resource) {
		resource = new ObservableResource(rejected$(engine));
		resourceByEngine.set(engine, resource);
	}
	return resource;
}

/**
 * Suspends until the first emission, then re-renders on every queue change — the
 * house data-flow (ObservableResource + Suspense), so there is no loading branch
 * to get wrong. The resource is cached per engine (see above) so it survives the
 * suspend-before-commit that would otherwise hang the panel.
 */
export function useRejectedMutations(): RejectedMutationsRead {
	const runtime = useQueryRuntime();
	const result = useObservableSuspense(rejectedResource(runtime.engine));
	if (result.readError) resourceByEngine.delete(runtime.engine);
	return result;
}
