import { describe, expect, it } from 'vitest';

import { mintRemoteId } from '@wcpos/sync-core';

import {
	parseRefundLaneQueryKey,
	refundHistoryQueryKey,
	refundParentQueryKey,
} from './refund-lane-descriptor';

describe('refund lane identity', () => {
	it('separates history from unbounded parent walks', () => {
		expect(refundHistoryQueryKey()).toBe('refunds:history:days=92');
		expect(parseRefundLaneQueryKey(refundHistoryQueryKey())).toEqual({ kind: 'history' });
		expect(refundParentQueryKey(mintRemoteId(42, 'test'))).toBe('refunds:parent:42');
		expect(parseRefundLaneQueryKey('refunds:parent:42')).toEqual({
			kind: 'parent',
			parentRemoteId: '42',
		});
	});
	it.each([
		'refunds:all',
		'refunds:history:days=91',
		'refunds:parent:0',
		'refunds:parent:01',
		'refunds:parent:NaN',
		'refunds:parent:9007199254740992',
	])('rejects noncanonical lane %s', (key) => {
		expect(parseRefundLaneQueryKey(key)).toBeNull();
	});
});
