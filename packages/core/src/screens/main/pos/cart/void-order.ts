import { awaitWriteOutcome, type useQueryRuntime, WriteOutcomeError } from '@wcpos/query';
import { WOO_REST_CANNOT_DELETE } from '@wcpos/sync-core';

import { requestServerDelete } from '../../hooks/mutations/request-server-delete';
import {
	findEngineResident,
	insertEngineResident,
	patchAndEnqueueEngineResident,
	patchEngineResident,
} from '../../hooks/mutations/use-local-mutation';

type QueryManager = ReturnType<typeof useQueryRuntime>;

/**
 * One bounded second watch after `awaitWriteOutcome`'s helper timeout: a slow
 * shop or a drain queued behind earlier work can answer after 15s, and a late
 * `woocommerce_rest_cannot_delete` must still convert the void to a status
 * change. Beyond this window the offline-class accepted gap applies (#864).
 */
export const LATE_OUTCOME_TIMEOUT_MS = 120_000;

export interface VoidOrderInput {
	recordId: string;
	/** Captured by the caller before any await (buttons ledger 8). */
	registerId: string | undefined;
	/** Read by the late watch: an Undo in the meantime cancels a late conversion. */
	undone: () => boolean;
}

export type VoidOrderResult =
	| {
			kind: 'removed';
			/** False when the store has not answered yet (offline, or the first watch ran out). */
			confirmed: boolean;
			/**
			 * Set only when the first watch was non-terminal: resolves `kept-pending` if a late
			 * refusal converted the void, `null` otherwise; rejects if that conversion failed.
			 */
			late: Promise<'kept-pending' | null> | null;
	  }
	| { kind: 'kept-pending' };

const isCannotDelete = (error: unknown) =>
	error instanceof WriteOutcomeError && error.reason === WOO_REST_CANNOT_DELETE;

/**
 * The one writer for voiding an order: the sanctioned delete, then the store's answer. A store
 * that refuses the delete keeps the order, so the fallback is an atomic patch-and-enqueue to
 * status `pending`. Throws when the delete or the fallback could not be enqueued; never toasts.
 */
export async function voidOrder(
	manager: QueryManager,
	input: VoidOrderInput
): Promise<VoidOrderResult> {
	const { recordId, registerId } = input;
	// The refused delete leaves the order resident (removal only happens at delete-ACK), so the
	// fallback is an atomic patch-and-enqueue to status 'pending' — the shared rollback path
	// unwinds the resident if the enqueue fails, and the failure surfaces instead of a success.
	const convertToPending = async () => {
		await patchAndEnqueueEngineResident({
			manager,
			collection: 'orders',
			recordId,
			changes: { status: 'pending' },
			registerId,
		});
	};

	const receipt = await requestServerDelete(manager.engine, { collection: 'orders', recordId });

	// Only a truly offline engine skips the outcome watch (the accepted gap): the write drain
	// still pushes while 'degraded', so a degraded refusal must convert exactly like an online one.
	if (receipt.annihilated || manager.engine.status().connectivity === 'offline') {
		return { kind: 'removed', confirmed: receipt.annihilated === true, late: null };
	}

	try {
		await awaitWriteOutcome(manager.engine, receipt.mutationId);
		return { kind: 'removed', confirmed: true, late: null };
	} catch (error) {
		if (isCannotDelete(error)) {
			await convertToPending();
			return { kind: 'kept-pending' };
		}
		// A terminal-but-different outcome (conflict, other rejection) is owned by the engine's
		// conflict/dead-letter surfaces — the void stands and nothing more is watched.
		if (error instanceof WriteOutcomeError)
			return { kind: 'removed', confirmed: false, late: null };
		// Non-terminal rejection (helper timeout / drain kick failure): the push may still land.
		// One bounded second watch so a late refusal still converts — unless the cashier undid it.
		const late = awaitWriteOutcome(manager.engine, receipt.mutationId, {
			timeoutMs: LATE_OUTCOME_TIMEOUT_MS,
		}).then(
			() => null,
			async (lateError) => {
				if (!isCannotDelete(lateError) || input.undone()) return null;
				await convertToPending();
				return 'kept-pending' as const;
			}
		);
		return { kind: 'removed', confirmed: false, late };
	}
}

/**
 * Undo of a void: put the order back as it was. A resident the store kept (refused or still
 * queued delete) is patched and re-sent as an update; one already removed is re-inserted as a
 * new local order and sent as a create.
 */
export async function restoreVoidedOrder(
	manager: QueryManager,
	recordId: string,
	orderPayload: Record<string, unknown>
): Promise<void> {
	const existing = await findEngineResident(manager, 'orders', recordId);
	if (existing) {
		const restored = await patchEngineResident({
			manager,
			collection: 'orders',
			recordId,
			changes: orderPayload,
		});
		// Plain snapshot, not `.get('payload')` — that returns an RxDB Proxy, which cannot cross
		// postMessage into the storage worker.
		const { payload } = restored.toMutableJSON() as { payload: Record<string, unknown> };
		await manager.engine.write({ collection: 'orders', operation: 'update', recordId, payload });
		return;
	}
	const resident = await insertEngineResident({
		manager,
		collection: 'orders',
		recordId,
		payload: { ...orderPayload, id: 0 },
	});
	// Plain snapshot, not `.get('payload')` — see above.
	const { payload } = resident.toMutableJSON() as { payload: Record<string, unknown> };
	await manager.engine.write({ collection: 'orders', operation: 'create', recordId, payload });
}
