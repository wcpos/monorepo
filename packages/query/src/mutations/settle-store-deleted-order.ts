import { OPEN_CART_ORDER_STATUS } from '@wcpos/sync-engine';

import {
	findEngineResident,
	type QueryManager,
	rebirthOrderResident,
	recreateRebornOrder,
	residentPayload,
} from './resident';

/**
 * Settle a dead letter the store answered with 404 `woo_rxdb_sync_record_not_found`: an open
 * cart is reborn on its uuid and re-created, anything else is discarded (the engine removes
 * the resident). The named command the POS layout's settler calls — it holds the resident
 * reads and the write plane the ADR 0033 seam keeps out of the screens.
 */

export type StoreDeletedOrderSettlement =
	| { kind: 'recreated'; number?: string; alreadyReborn: boolean }
	| { kind: 'removed'; number?: string }
	| { kind: 'absent' }
	| { kind: 'abandoned' };

export async function settleStoreDeletedOrder(
	manager: QueryManager,
	input: { recordId: string; mutationId: string; abandoned: () => boolean }
): Promise<StoreDeletedOrderSettlement> {
	const { recordId, mutationId, abandoned } = input;
	const resident = await findEngineResident(manager, 'orders', recordId);
	const { number, status } = (resident ? residentPayload(resident) : {}) as {
		number?: string;
		status?: string;
	};
	const recreate = resident && status === OPEN_CART_ORDER_STATUS;
	const alreadyReborn = resident?.toJSON().remoteId === null;
	// A switch or cleanup between the awaits abandons the settle: the row stays
	// rejected for its own scope's effect instance.
	if (abandoned()) return { kind: 'abandoned' };
	const reborn = recreate ? await rebirthOrderResident(manager, recordId) : null;
	if (abandoned()) return { kind: 'abandoned' };
	await manager.engine.resolveConflict(mutationId, 'discard');
	if (abandoned()) return { kind: 'abandoned' };
	if (reborn) {
		// The create is built from the resident as it stands AFTER the discard (an edit
		// made meanwhile is on it); the query package owns the write.
		await recreateRebornOrder(manager, recordId);
	}
	if (recreate) return { kind: 'recreated', number, alreadyReborn };
	return resident ? { kind: 'removed', number } : { kind: 'absent' };
}
