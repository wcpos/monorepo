import { assertBulkSuccess } from '@wcpos/sync-core';

import type { LocalRefundDocument } from '../collections/refund-schema';

export type RefundChildrenCollection = {
	find(query: unknown): { exec(): Promise<{ toJSON(): LocalRefundDocument }[]> };
	bulkRemove(ids: string[]): Promise<unknown>;
};

/** Shared by server deletes, reset, delete acknowledgement and conflict discard. */
export async function removeRefundChildren(
	refunds: RefundChildrenCollection,
	parentIds: readonly (string | null)[]
) {
	const ids = parentIds.filter((id) => id !== null).map(Number);
	if (ids.length === 0) return;
	const children = await refunds.find({ selector: { 'payload.parent_id': { $in: ids } } }).exec();
	if (children.length > 0)
		assertBulkSuccess(
			await refunds.bulkRemove(children.map((doc) => doc.toJSON().uuid)),
			'refund children remove'
		);
}
