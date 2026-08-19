import type { QueryTotalWooRequest } from './query-total-requests';

export type QueryTotalRequestStateStatus = 'in-flight' | 'failed' | 'idle';

export type QueryTotalRequestState = {
	queryKey: string;
	status: QueryTotalRequestStateStatus;
	ownerId: string | null;
	claimedUntilMs: number | null;
	attempt: number;
	retryAfterMs: number | null;
	updatedAtMs: number;
	request: QueryTotalWooRequest | null;
};

export function sameQueryTotalRequestMetadata(
	left: QueryTotalWooRequest | null,
	right: QueryTotalWooRequest | null
): boolean {
	if (left === null || right === null) return left === right;
	const leftParamKeys = Object.keys(left.params).sort();
	const rightParamKeys = Object.keys(right.params).sort();
	return (
		left.queryKey === right.queryKey &&
		left.method === right.method &&
		left.endpoint === right.endpoint &&
		left.totalHeader === right.totalHeader &&
		leftParamKeys.length === rightParamKeys.length &&
		leftParamKeys.every(
			(key, index) => key === rightParamKeys[index] && left.params[key] === right.params[key]
		)
	);
}

export function sameQueryTotalRequestState(
	left: QueryTotalRequestState,
	right: QueryTotalRequestState
): boolean {
	return (
		left.queryKey === right.queryKey &&
		left.status === right.status &&
		left.ownerId === right.ownerId &&
		left.claimedUntilMs === right.claimedUntilMs &&
		left.attempt === right.attempt &&
		left.retryAfterMs === right.retryAfterMs &&
		left.updatedAtMs === right.updatedAtMs &&
		sameQueryTotalRequestMetadata(left.request, right.request)
	);
}
