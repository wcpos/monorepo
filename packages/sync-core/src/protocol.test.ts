import { describe, expect, it } from 'vitest';

import {
	checkpointInstantMs,
	customerDocumentId,
	normalizeCheckpoint,
	orderDocumentId,
	productDocumentId,
} from './protocol';

describe('protocol helpers', () => {
	it('normalizes an empty checkpoint to the beginning of time', () => {
		expect(normalizeCheckpoint(null)).toEqual({
			updatedAtGmt: '1970-01-01T00:00:00.000Z',
			orderId: 0,
			revision: '',
			sequence: 0,
		});
	});

	it('uses Woo order IDs as stable local document IDs', () => {
		expect(orderDocumentId(123)).toBe('woo-order:123');
	});
});

describe('checkpointInstantMs', () => {
	// Regression: 1.9.x bug fa7b51add — WooCommerce serializes `date_modified_gmt`
	// with an inconsistent (often absent) timezone designator: bare, `Z`, or
	// `+00:00`. A raw string compare of the checkpoint's `updatedAtGmt` treats the
	// SAME instant in two of those forms as "advanced", which defeats the custom
	// pull's stall guard and can spin an infinite pull loop. All `*_gmt` values are
	// UTC by contract, so every form of one instant must collapse to one number.
	const bare = checkpointInstantMs('2026-05-20T10:05:00');

	it('treats a designator-less GMT datetime as UTC (not host-local time)', () => {
		// The crux of the bug: Date.parse of a designator-less datetime is LOCAL time.
		expect(bare).toBe(Date.UTC(2026, 4, 20, 10, 5, 0));
	});

	it('collapses bare / Z / +00:00 / millisecond forms of one instant to one number', () => {
		expect(checkpointInstantMs('2026-05-20T10:05:00Z')).toBe(bare);
		expect(checkpointInstantMs('2026-05-20T10:05:00+00:00')).toBe(bare);
		expect(checkpointInstantMs('2026-05-20T10:05:00.000Z')).toBe(bare);
		expect(checkpointInstantMs('2026-05-20T10:05:00.000')).toBe(bare);
	});

	it('accepts the MySQL space-separated GMT form as the same instant', () => {
		expect(checkpointInstantMs('2026-05-20 10:05:00')).toBe(bare);
	});

	it('honours a real timezone offset when one is present', () => {
		// +02:00 is two hours ahead of UTC, so the instant is two hours EARLIER.
		expect(checkpointInstantMs('2026-05-20T10:05:00+02:00')).toBe(bare - 2 * 60 * 60 * 1000);
	});

	it('maps empty, whitespace, invalid, and nullish input to epoch 0', () => {
		expect(checkpointInstantMs('')).toBe(0);
		expect(checkpointInstantMs('   ')).toBe(0);
		expect(checkpointInstantMs('not-a-date')).toBe(0);
		expect(checkpointInstantMs(null)).toBe(0);
		expect(checkpointInstantMs(undefined)).toBe(0);
		expect(checkpointInstantMs('1970-01-01T00:00:00.000Z')).toBe(0);
	});
});

describe('productDocumentId', () => {
	it('uses a stable Woo product document prefix', () => {
		expect(productDocumentId(321)).toBe('woo-product:321');
	});
});

describe('customerDocumentId', () => {
	it('uses a stable Woo customer document prefix (the Woo-id-space coverage key)', () => {
		expect(customerDocumentId(7)).toBe('woo-customer:7');
	});
});
