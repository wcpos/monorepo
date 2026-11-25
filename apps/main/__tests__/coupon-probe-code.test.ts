import {
	mintProbeCouponCode,
	PROBE_COUPON_CODE_PATTERN,
	PROBE_COUPON_ORPHAN_AGE_MS,
	selectOrphanedProbeCoupons,
	sweepsProbeCoupons,
} from '../e2e/coupon-probe';

describe('probe coupon code shape', () => {
	it.each([0, 1, 35, 36, 1295])('every code minted for worker %i matches the pattern', (index) => {
		for (let i = 0; i < 10; i++) {
			expect(mintProbeCouponCode(index)).toMatch(PROBE_COUPON_CODE_PATTERN);
		}
	});

	it.each([
		'summer10',
		'loyalty5',
		'zxmas',
		'freeship',
		'ZX0MI3K2V1A9F3C2B1D0E4A',
		'zx0mi3k2v1a9f3c2b1d0e4',
		'zx0mi3k2v1a9f3c2b1d0e4a-x',
		'old-zx0mi3k2v1a9f3c2b1d0e4a',
		'zx0mi3k2v1a9f3c2b1d0e4g',
		'zx',
		'',
	])('%p is not a probe code', (code) => {
		expect(PROBE_COUPON_CODE_PATTERN.test(code)).toBe(false);
	});
});

describe('probe coupon orphan floor', () => {
	const now = Date.parse('2026-11-24T12:00:00Z');
	const created = (minutesAgo: number) =>
		new Date(now - minutesAgo * 60_000).toISOString().slice(0, 19);
	const description = 'wcpos-e2e coupon probe (safe to delete)';

	it('is 20 minutes', () => {
		expect(PROBE_COUPON_ORPHAN_AGE_MS).toBe(20 * 60 * 1000);
	});

	it('sweeps only a stamped, pattern-shaped probe older than the floor', () => {
		expect(
			selectOrphanedProbeCoupons(
				[
					{ id: 1, code: 'zx0mi3k2v1a9f3c2b1d0e4a', description, date_created_gmt: created(25) },
					{ id: 2, code: 'zx0mi3k2v1a9f3c2b1d0e4a', description, date_created_gmt: created(15) },
					{ id: 3, code: 'zxmas', description, date_created_gmt: created(25) },
					{
						id: 4,
						code: 'zx0mi3k2v1a9f3c2b1d0e4a',
						description: 'Christmas',
						date_created_gmt: created(25),
					},
				],
				now
			)
		).toEqual([1]);
	});
});

describe('sweepsProbeCoupons', () => {
	it('sweeps on shard index 0 of a CI run only', () => {
		expect(sweepsProbeCoupons(0, 'true')).toBe(true);
		expect(sweepsProbeCoupons(1, 'true')).toBe(false);
		expect(sweepsProbeCoupons(5, 'true')).toBe(false);
		expect(sweepsProbeCoupons(0, undefined)).toBe(false);
	});
});
