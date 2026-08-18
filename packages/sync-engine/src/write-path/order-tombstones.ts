import type { OrderDocument, RemoteId } from '@wcpos/sync-core';

/**
 * Resolve an order pull tombstone — which speaks Woo order ids (the server `deletes`
 * channel / `order-tombstone` stream line) — to the STORED primary keys to remove.
 * Orders are keyed by their server uuid (P0-1), so a Woo id can no longer address a row
 * directly (the old `woo-order:<id>` key is gone); match the retained `remoteId` field
 * instead. A born-local row with no `remoteId` is never matched by an upstream Woo-id
 * delete.
 */
export function orderStorageIdsForWooDeletes(
	docs: Pick<OrderDocument, 'uuid' | 'remoteId'>[],
	remoteIds: RemoteId[]
): string[] {
	const wanted = new Set(remoteIds);
	return docs
		.filter((doc) => doc.remoteId !== null && wanted.has(doc.remoteId))
		.map((doc) => doc.uuid);
}
