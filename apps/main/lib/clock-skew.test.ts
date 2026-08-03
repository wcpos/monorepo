import { evaluateClockSkew } from './clock-skew';

jest.resetModules();

const MIDNIGHT_MS = Date.parse('2026-01-01T00:00:00.000Z');

describe('evaluateClockSkew', () => {
	it.each([null, 'not-a-date'])('returns null for an unusable Date header (%p)', (dateHeader) => {
		expect(
			evaluateClockSkew({ dateHeader, requestStartedAtMs: MIDNIGHT_MS, responseAtMs: MIDNIGHT_MS })
		).toBeNull();
	});

	it('returns null when skew is at the default threshold', () => {
		expect(
			evaluateClockSkew({
				dateHeader: 'Thu, 01 Jan 2026 00:01:00 GMT',
				requestStartedAtMs: MIDNIGHT_MS,
				responseAtMs: MIDNIGHT_MS,
			})
		).toBeNull();
	});

	it('returns positive skew when the server clock is ahead', () => {
		expect(
			evaluateClockSkew({
				dateHeader: 'Thu, 01 Jan 2026 00:01:30 GMT',
				requestStartedAtMs: MIDNIGHT_MS,
				responseAtMs: MIDNIGHT_MS,
			})
		).toEqual({
			skewSeconds: 90,
			serverDate: '2026-01-01T00:01:30.000Z',
			deviceDate: '2026-01-01T00:00:00.000Z',
		});
	});

	it('returns negative skew when the server clock is behind', () => {
		expect(
			evaluateClockSkew({
				dateHeader: 'Wed, 31 Dec 2025 23:58:30 GMT',
				requestStartedAtMs: MIDNIGHT_MS,
				responseAtMs: MIDNIGHT_MS,
			})
		).toEqual({
			skewSeconds: -90,
			serverDate: '2025-12-31T23:58:30.000Z',
			deviceDate: '2026-01-01T00:00:00.000Z',
		});
	});

	it('computes skew against the request midpoint', () => {
		expect(
			evaluateClockSkew({
				dateHeader: 'Thu, 01 Jan 1970 00:00:15 GMT',
				requestStartedAtMs: 0,
				responseAtMs: 10_000,
				thresholdSeconds: 0,
			})
		).toEqual({
			skewSeconds: 10,
			serverDate: '1970-01-01T00:00:15.000Z',
			deviceDate: '1970-01-01T00:00:05.000Z',
		});
	});

	it('uses a custom threshold', () => {
		expect(
			evaluateClockSkew({
				dateHeader: 'Thu, 01 Jan 2026 00:01:30 GMT',
				requestStartedAtMs: MIDNIGHT_MS,
				responseAtMs: MIDNIGHT_MS,
				thresholdSeconds: 120,
			})
		).toBeNull();
	});
});
