import { describe, expect, it } from 'vitest';

import { mapCouponExpiryToPayload } from './couponWirePayload';

describe('mapCouponExpiryToPayload', () => {
	it('derives date_expires with a Z suffix from a plain _gmt string', () => {
		const mapped = mapCouponExpiryToPayload({
			code: 'dippy',
			date_expires_gmt: '2026-09-03T21:59:59',
		});
		expect(mapped.date_expires).toBe('2026-09-03T21:59:59Z');
		expect(mapped.date_expires_gmt).toBe('2026-09-03T21:59:59');
	});

	it('overwrites a stale site-local date_expires echoed by a full-document update', () => {
		const mapped = mapCouponExpiryToPayload({
			date_expires: '2026-01-01T00:00:00',
			date_expires_gmt: '2026-09-03T21:59:59',
		});
		expect(mapped.date_expires).toBe('2026-09-03T21:59:59Z');
	});

	it('clears with an empty string (the controller skips null params)', () => {
		expect(mapCouponExpiryToPayload({ date_expires_gmt: null }).date_expires).toBe('');
		expect(mapCouponExpiryToPayload({ date_expires_gmt: '' }).date_expires).toBe('');
	});

	it('forwards a string that already carries timezone information verbatim', () => {
		const mapped = mapCouponExpiryToPayload({ date_expires_gmt: '2026-09-03T21:59:59Z' });
		expect(mapped.date_expires).toBe('2026-09-03T21:59:59Z');
	});

	it('leaves payloads without the date_expires_gmt key untouched', () => {
		const payload = { code: 'dippy', date_expires: '2026-01-01T00:00:00' };
		expect(mapCouponExpiryToPayload(payload)).toBe(payload);
	});

	it('does not mutate the input payload', () => {
		const payload = { date_expires_gmt: '2026-09-03T21:59:59' };
		mapCouponExpiryToPayload(payload);
		expect(payload).toEqual({ date_expires_gmt: '2026-09-03T21:59:59' });
	});
});
