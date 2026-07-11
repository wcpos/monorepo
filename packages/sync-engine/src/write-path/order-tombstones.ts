import type { OrderDocument } from '@woo-rxdb-lab/shared';

/**
 * Resolve an order pull tombstone — which speaks Woo order ids (the server `deletes`
 * channel / `order-tombstone` stream line) — to the STORED primary keys to remove.
 * Orders are keyed by their server uuid (P0-1), so a Woo id can no longer address a row
 * directly (the old `woo-order:<id>` key is gone); match the retained `wooOrderId` field
 * instead. A born-local row with no `wooOrderId` is never matched by an upstream Woo-id
 * delete. Mirrors productStorageIdsForWooDeletes.
 */
export function orderStorageIdsForWooDeletes(
  docs: Pick<OrderDocument, 'id' | 'wooOrderId'>[],
  wooOrderIds: number[],
): string[] {
  const wanted = new Set(wooOrderIds);
  return docs
    .filter((doc) => doc.wooOrderId !== null && wanted.has(doc.wooOrderId))
    .map((doc) => doc.id);
}
