import assert from 'node:assert/strict';
import test from 'node:test';

import { resetInstantNear, resetWaitMs, SHARD_BUDGET_MS } from './wait-mini-store-reset.mjs';

test('the Madrid reset is at 01:17 UTC in CEST', () => {
	assert.equal(
		resetInstantNear(new Date('2026-10-05T12:00:00Z')).toISOString(),
		'2026-10-05T01:17:00.000Z'
	);
});

test('the Madrid reset is at 02:17 UTC in CET', () => {
	assert.equal(
		resetInstantNear(new Date('2026-11-05T12:00:00Z')).toISOString(),
		'2026-11-05T02:17:00.000Z'
	);
});

test('the wait window includes 85 minutes before reset and excludes 10 minutes after', () => {
	assert.equal(resetWaitMs(new Date('2026-10-04T23:51:59Z')), 0);
	assert.equal(resetWaitMs(new Date('2026-10-04T23:52:00Z')), (85 + 10) * 60_000);
	assert.equal(resetWaitMs(new Date('2026-10-05T01:20:00Z')), 7 * 60_000);
	assert.equal(resetWaitMs(new Date('2026-10-05T01:27:00Z')), 0);
});

test('the wait window follows CET in winter', () => {
	assert.equal(resetWaitMs(new Date('2026-11-05T01:30:00Z')), 57 * 60_000);
});

test('the wait uses the Madrid calendar day across the UTC date change', () => {
	assert.equal(resetWaitMs(new Date('2026-10-05T23:51:59Z')), 0);
	assert.equal(resetWaitMs(new Date('2026-10-05T23:59:00Z')), (78 + 10) * 60_000);
});

test('a shard rerun uses the 65-minute shard budget', () => {
	assert.equal(resetWaitMs(new Date('2026-10-05T00:11:59Z'), SHARD_BUDGET_MS), 0);
	assert.equal(resetWaitMs(new Date('2026-10-05T00:12:00Z'), SHARD_BUDGET_MS), (65 + 10) * 60_000);
});
