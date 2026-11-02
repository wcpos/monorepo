import { describe, expect, it } from 'vitest';

import {
	parseRefundBrowserSchedulerDescriptor,
	refundBrowserQueryKey,
} from './refund-browser-scheduler-descriptor';

describe('refund browser descriptor', () => {
	it('the key encodes and parses round-trip', () => {
		const queryKey = refundBrowserQueryKey({ after: 100, before: 200, limit: 101 });
		expect(queryKey).toBe('refunds:browser:after=100:before=200:limit=200');
		expect(parseRefundBrowserSchedulerDescriptor(queryKey)).toEqual({
			queryKey,
			afterSeconds: 100,
			beforeSeconds: 200,
			limit: 200,
			complete: false,
		});
	});
	it('limit=all yields complete: true and the per-pass budget', () => {
		expect(
			parseRefundBrowserSchedulerDescriptor('refunds:browser:after=100:before=200:limit=all')
		).toEqual({
			queryKey: 'refunds:browser:after=100:before=200:limit=all',
			afterSeconds: 100,
			beforeSeconds: 200,
			limit: 10000,
			complete: true,
		});
	});
	it.each([
		'refunds:history:days=30',
		'refunds:browser:after=200:before=100:limit=all',
		'refunds:browser:after=100:before=200:limit=0',
		'refunds:browser:after=9007199254740992:before=9007199254740993:limit=all',
	])('an invalid key is refused: %s', (key) => {
		expect(parseRefundBrowserSchedulerDescriptor(key)).toBeNull();
	});
	it('does not silently widen malformed public dimensions', () => {
		expect(() => refundBrowserQueryKey({ after: NaN, before: 2 })).toThrow();
	});
});
