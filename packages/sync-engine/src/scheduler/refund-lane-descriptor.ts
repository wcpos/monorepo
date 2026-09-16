import { HISTORY_DAYS, mintRemoteId, type RemoteId } from '@wcpos/sync-core';

export type RefundLaneDescriptor =
	{ kind: 'history' } | { kind: 'parent'; parentRemoteId: RemoteId };
export const refundHistoryQueryKey = (): string => `refunds:history:days=${HISTORY_DAYS}`;
export const refundParentQueryKey = (parentRemoteId: RemoteId): string =>
	`refunds:parent:${parentRemoteId}`;

export function parseRefundLaneQueryKey(key: string): RefundLaneDescriptor | null {
	if (key === refundHistoryQueryKey()) return { kind: 'history' };
	const match = /^refunds:parent:([1-9]\d*)$/.exec(key);
	if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
	return { kind: 'parent', parentRemoteId: mintRemoteId(Number(match[1]), 'refund parent') };
}
