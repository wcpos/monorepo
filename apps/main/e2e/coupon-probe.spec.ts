import {
	PROBE_COUPON_CODE_LEAD,
	PROBE_COUPON_DESCRIPTION_LEAD,
	PROBE_COUPON_ORPHAN_AGE_MS,
	selectOrphanedProbeCoupons,
} from './coupon-probe';
import { expect, test } from './test';

/**
 * Pure-logic tests for the orphan coupon selector. No browser, network or store — they run
 * standalone under every project, like order-cleanup.spec.ts.
 */
test.describe('coupon-probe orphan selection', () => {
	const now = Date.parse('2026-11-02T22:00:00Z');
	const old = new Date(now - PROBE_COUPON_ORPHAN_AGE_MS - 60_000).toISOString().slice(0, 19);
	const fresh = new Date(now - 60_000).toISOString().slice(0, 19);
	const probe = (id: number, created: string, extra: Record<string, unknown> = {}) => ({
		id,
		code: `${PROBE_COUPON_CODE_LEAD}7mvzuoonj7430cb8c`,
		description: `${PROBE_COUPON_DESCRIPTION_LEAD} checkout probe (safe to delete)`,
		date_created_gmt: created,
		...extra,
	});

	test('sweeps only stamped probe coupons older than the orphan age', () => {
		expect(
			selectOrphanedProbeCoupons(
				[
					probe(1, old),
					probe(2, fresh),
					probe(3, old, { description: '' }),
					probe(4, old, { code: 'summer10' }),
					probe(5, old, { id: 0 }),
					'junk',
					null,
				],
				now
			)
		).toEqual([1]);
	});

	test('a merchant coupon never qualifies, whatever its age', () => {
		expect(
			selectOrphanedProbeCoupons(
				[{ id: 9, code: 'loyalty5', description: '', date_created_gmt: '2026-08-19T00:12:26' }],
				now
			)
		).toEqual([]);
	});

	test('anything but a list selects nothing', () => {
		expect(selectOrphanedProbeCoupons(null, now)).toEqual([]);
		expect(selectOrphanedProbeCoupons({ id: 1 }, now)).toEqual([]);
	});
});
