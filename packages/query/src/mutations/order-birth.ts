import { hasPendingLocalWork } from '@wcpos/sync-engine';

import { removeTemporaryOrder } from '../temporary-order';
import { findEngineResident, insertEngineResident, patchEngineResident } from './resident';

import type { EngineResident, QueryManager } from './resident';
import type { EngineRecord } from '../records/engine-record';

/**
 * The skeleton resident is inserted BEFORE its create is enqueued, so a resident
 * on its own is not proof that the server was ever told about the order. Three
 * signals say it was:
 *
 * - the enqueue marks the record dirty and appends to `local.pendingMutationIds`
 *   (write-intents' dirty-mark) — a create is queued but not yet pushed;
 * - the create ack stamps the server id into `remoteId` (the orders facet's
 *   `remoteIdField`, from the pushed document's `id`) — the server has it;
 * - the create ack stamps `sync.revision`: orders are born through
 *   `wcpos/v2/push/orders`, whose every 2xx answers `{ document, currentRevision }`
 *   (a `sha256:` revision).
 *
 * With none of them the resident is an orphan from a failed (or interrupted)
 * enqueue, and queueing updates against it would 404 forever.
 */
function hasQueuedOrAcknowledgedCreate(resident: EngineResident): boolean {
	const record = resident as unknown as {
		sync?: { revision?: unknown };
		remoteId?: unknown;
	};
	if (hasPendingLocalWork(resident)) return true;
	if (record.remoteId !== null && record.remoteId !== undefined) return true;
	return typeof record.sync?.revision === 'string' && record.sync.revision !== '';
}

// Carry the born record too: the caller must check stock against this same lookup.
export async function findBirthState(manager: QueryManager, uuid: string) {
	const resident = await findEngineResident(manager, 'orders', uuid);
	if (!resident) return 'none' as const;
	const order = resident as unknown as EngineRecord<'orders'>;
	return hasQueuedOrAcknowledgedCreate(resident) ? { born: order } : { orphan: order };
}

export async function birthOrder(
	manager: QueryManager,
	{
		recordId,
		payload: changes,
		orphan,
	}: {
		recordId: string;
		payload: Record<string, unknown>;
		orphan?: EngineRecord<'orders'> | EngineResident | null;
	}
): Promise<EngineRecord<'orders'>> {
	const resident = orphan
		? await patchEngineResident({ manager, collection: 'orders', recordId, changes })
		: await insertEngineResident({ manager, collection: 'orders', recordId, payload: changes });
	const payload = resident.toMutableJSON().payload as Record<string, unknown>;
	// A guest sale has no email, stored locally as ''. wc/v3 rejects '' with
	// rest_invalid_email (400), which dead-letters the CREATE and strands the
	// order (every later update 404s). Absent means "no email" — same strip as
	// use-push-document's pay path.
	const billing = payload.billing as Record<string, unknown> | undefined;
	if (billing?.email === '') delete billing.email;
	try {
		await manager.engine.write({
			collection: 'orders',
			operation: 'create',
			recordId,
			payload,
		});
	} catch (error) {
		// The resident is inserted before the create is enqueued. Left behind,
		// it looks to the next add like an order the server already knows about,
		// so that add queues an update which 404s forever. Only roll back the
		// resident inserted here — an orphan reused above keeps its lines for
		// the next retry.
		if (!orphan) {
			try {
				await resident.remove();
			} catch {
				// The create failure is the error worth surfacing.
			}
		}
		throw error;
	}
	const savedOrder = resident as unknown as EngineRecord<'orders'>;
	await removeTemporaryOrder(recordId);
	return savedOrder;
}
