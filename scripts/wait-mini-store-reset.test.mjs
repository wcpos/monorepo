import assert from 'node:assert/strict';
import test from 'node:test';

import { resetInstantNear, resetWaitMs } from './wait-mini-store-reset.mjs';

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

test('the wait window includes 75 minutes before reset and excludes 10 minutes after', () => {
	assert.equal(resetWaitMs(new Date('2026-10-05T00:01:59Z')), 0);
	assert.equal(resetWaitMs(new Date('2026-10-05T00:02:00Z')), (75 + 10) * 60_000);
	assert.equal(resetWaitMs(new Date('2026-10-05T01:20:00Z')), 7 * 60_000);
	assert.equal(resetWaitMs(new Date('2026-10-05T01:27:00Z')), 0);
});

test('the wait window follows CET in winter', () => {
	assert.equal(resetWaitMs(new Date('2026-11-05T01:30:00Z')), 57 * 60_000);
});

test('the wait uses the Madrid calendar day across the UTC date change', () => {
	assert.equal(resetWaitMs(new Date('2026-10-05T23:59:00Z')), 0);
	assert.equal(resetWaitMs(new Date('2026-10-06T00:05:00Z')), (72 + 10) * 60_000);
});
