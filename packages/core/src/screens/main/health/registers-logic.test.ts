import {
	clockCheck,
	closuresCheck,
	closuresSupported,
	duplicateSales,
	duplicatesCheck,
	gapsCheck,
	isExactDuplicateCount,
	isLeadingClosureGap,
	isUnstampedTill,
	orderChecks,
	orderNumberList,
	registerChecks,
	registerState,
	shortId,
	splitSkew,
	sumMissing,
	unknownSessionSales,
} from './registers-logic';

import type { RegisterReport, RegisterSkew } from './registers-logic';

const clean: RegisterReport = {
	id: 'reg-1',
	name: 'Front counter',
	orders: 5,
	first_counter: 1,
	last_counter: 5,
	gaps: [],
	duplicates: [],
	skew: [],
};
function skew(order_id: number, direction: RegisterSkew['direction']): RegisterSkew {
	return {
		order_id,
		order_number: String(1000 + order_id),
		sale_time: '2026-09-11T00:42:00+02:00',
		received_gmt: '2026-09-10T22:42:00Z',
		skew_seconds: direction === 'ahead' ? 900 : -900,
		direction,
	};
}
function duplicate(till: string, counter: number, orders: number[]) {
	return { till, counter, order_ids: orders, order_numbers: orders.map(String) };
}
/** A clock check as a current plugin sends it: per-direction totals beside the sample. */
function counted(sample: RegisterSkew[]) {
	const { ahead, behind } = splitSkew(sample);
	return clockCheck(sample, { ahead: ahead.length, behind: behind.length });
}
const kinds = (register: RegisterReport) => registerChecks(register).map((check) => check.kind);

describe('gapsCheck', () => {
	it('sums missing numbers, counts distinct tills and sorts by till then after', () => {
		const check = gapsCheck(
			[
				{ till: 'b', after: 1, before: 3, missing: 1 },
				{ till: 'a', after: 10, before: 14, missing: 3 },
				{ till: 'a', after: 2, before: 4, missing: 1 },
			],
			'reg-1'
		);
		expect(check.failing).toBe(true);
		expect(check.notable).toBe(true);
		expect(check.missing).toBe(5);
		expect(check.tills).toBe(2);
		expect(check.unstamped).toBe(false);
		expect(check.rows.map((gap) => `${gap.till}:${gap.after}`)).toEqual(['a:2', 'a:10', 'b:1']);
	});

	it('passes with no gaps', () => {
		expect(gapsCheck([], 'reg-1')).toEqual({
			kind: 'gaps',
			failing: false,
			notable: false,
			missing: 0,
			tills: 0,
			unstamped: false,
			rows: [],
		});
	});

	it('does not count sales without a till stamp as a till', () => {
		const unstampedOnly = gapsCheck([{ till: 'reg-1', after: 1, before: 3, missing: 1 }], 'reg-1');
		expect(unstampedOnly).toMatchObject({ tills: 0, unstamped: true, missing: 1 });
		const mixed = gapsCheck(
			[
				{ till: 'reg-1', after: 1, before: 3, missing: 1 },
				{ till: 'a', after: 4, before: 7, missing: 2 },
			],
			'reg-1'
		);
		expect(mixed).toMatchObject({ tills: 1, unstamped: true, missing: 3 });
	});
});

describe('duplicatesCheck', () => {
	it('sorts rows by till then counter, so a till’s rows are adjacent', () => {
		const check = duplicatesCheck(
			[duplicate('b', 1, [21, 22]), duplicate('a', 3, [13, 14]), duplicate('a', 1, [11, 12])],
			'reg-1'
		);
		expect(check.rows.map((row) => `${row.till}:${row.counter}`)).toEqual(['a:1', 'a:3', 'b:1']);
	});

	it('counts the tills that restarted, not the repeated counters', () => {
		const check = duplicatesCheck(
			[duplicate('a', 1, [1, 2]), duplicate('a', 2, [3, 4]), duplicate('b', 1, [5, 6])],
			'reg-1'
		);
		expect(check.failing).toBe(true);
		expect(check.notable).toBe(true);
		expect(check.tills).toBe(2);
		expect(check.unstamped).toBe(false);
		expect(check.rows).toHaveLength(3);
	});

	it('passes, not notable, with no duplicates', () => {
		expect(duplicatesCheck([], 'reg-1')).toEqual({
			kind: 'duplicates',
			failing: false,
			notable: false,
			tills: 0,
			unstamped: false,
			rows: [],
		});
	});

	it('does not count sales without a till stamp as a till that restarted', () => {
		expect(duplicatesCheck([duplicate('reg-1', 1, [1, 2])], 'reg-1')).toMatchObject({
			failing: true,
			tills: 0,
			unstamped: true,
		});
		expect(
			duplicatesCheck([duplicate('reg-1', 1, [1, 2]), duplicate('a', 1, [3, 4])], 'reg-1')
		).toMatchObject({ tills: 1, unstamped: true });
	});

	it('counts sales from the server total when sent, else from the capped sample', () => {
		const ids = Array.from({ length: 20 }, (_, i) => i + 1);
		expect(duplicateSales({ ...duplicate('a', 1, ids), orders: 25 })).toBe(25);
		expect(duplicateSales(duplicate('a', 1, [1, 2]))).toBe(2);
	});

	it('calls the count exact only when the server sent it', () => {
		expect(isExactDuplicateCount({ ...duplicate('a', 1, [1, 2]), orders: 2 })).toBe(true);
		expect(isExactDuplicateCount(duplicate('a', 1, [1, 2]))).toBe(false);
	});
});

describe('clock', () => {
	it('splits skew by direction', () => {
		const { ahead, behind } = splitSkew([skew(1, 'behind'), skew(2, 'ahead'), skew(3, 'behind')]);
		expect(ahead.map((entry) => entry.order_id)).toEqual([2]);
		expect(behind.map((entry) => entry.order_id)).toEqual([1, 3]);
	});

	it('fails only on a clock running ahead', () => {
		expect(counted([skew(1, 'behind')]).failing).toBe(false);
		expect(counted([skew(1, 'behind'), skew(2, 'ahead')]).failing).toBe(true);
	});

	it('is notable when it fails or when sales arrived late, and not otherwise', () => {
		expect(counted([]).notable).toBe(false);
		expect(counted([skew(1, 'behind')]).notable).toBe(true);
		expect(counted([skew(1, 'ahead')]).notable).toBe(true);
	});

	it('takes its counts from skew_counts when sent, else from the sample', () => {
		const sample = [skew(1, 'ahead'), skew(2, 'behind')];
		expect(clockCheck(sample, { ahead: 31, behind: 12 })).toMatchObject({
			aheadCount: 31,
			behindCount: 12,
			counted: true,
		});
		expect(clockCheck(sample)).toMatchObject({ aheadCount: 1, behindCount: 1, counted: false });
	});

	describe('without skew_counts (an older plugin samples both directions together)', () => {
		it('is a neutral, notable sample when it holds only behind rows', () => {
			expect(clockCheck([skew(1, 'behind')])).toMatchObject({
				sampled: true,
				failing: false,
				notable: true,
			});
		});

		it('fails on an ahead row in the sample, counting the sample as a lower bound', () => {
			expect(clockCheck([skew(1, 'behind'), skew(2, 'ahead')])).toMatchObject({
				sampled: true,
				failing: true,
				notable: true,
				aheadCount: 1,
			});
		});

		it('passes, not notable, when there is no skew at all', () => {
			expect(clockCheck([])).toMatchObject({
				counted: false,
				sampled: false,
				failing: false,
				notable: false,
			});
		});
	});

	it('is never sampled when skew_counts is sent', () => {
		expect(counted([skew(1, 'behind')]).sampled).toBe(false);
	});
});

describe('closuresCheck', () => {
	it('is absent when the plugin sends none of the closure lists', () => {
		expect(closuresCheck(clean)).toBeNull();
	});

	it('passes, not notable, when the lists are present and empty', () => {
		expect(closuresCheck({ ...clean, closure_gaps: [] })).toMatchObject({
			failing: false,
			notable: false,
		});
	});

	it('fails on any non-empty list and sums skipped closure numbers', () => {
		const check = closuresCheck({
			...clean,
			closure_gaps: [
				{ after: 2, before: 5, missing: 2 },
				{ after: 0, before: 2, missing: 1 },
			],
		});
		expect(check?.failing).toBe(true);
		expect(check?.notable).toBe(true);
		expect(check?.missing).toBe(3);
		expect(check?.conflicts).toEqual([]);
		expect(
			closuresCheck({ ...clean, closure_total_mismatches: [{ id: 'c', number: 4, findings: {} }] })
				?.failing
		).toBe(true);
	});

	it('sorts closure gaps ascending, putting the leading gap the server appends last first', () => {
		const check = closuresCheck({
			...clean,
			closure_gaps: [
				{ after: 9, before: 11, missing: 1 },
				{ after: 2, before: 5, missing: 2 },
				{ after: 0, before: 2, missing: 1 },
			],
		});
		expect(check?.gaps.map((gap) => gap.after)).toEqual([0, 2, 9]);
	});

	it('marks the gap before the first closure on record as the leading gap', () => {
		expect(isLeadingClosureGap({ after: 0, before: 4, missing: 3 })).toBe(true);
		expect(isLeadingClosureGap({ after: 2, before: 4, missing: 1 })).toBe(false);
	});
});

describe('check order', () => {
	it('lists gaps, duplicates, clock, closures when all pass', () => {
		expect(kinds({ ...clean, closure_conflicts: [] })).toEqual([
			'gaps',
			'duplicates',
			'clock',
			'closures',
		]);
	});

	it('moves failing checks above passing ones and keeps the order within each band', () => {
		expect(
			kinds({
				...clean,
				skew: [skew(1, 'ahead')],
				skew_counts: { ahead: 1, behind: 0 },
				duplicates: [duplicate('a', 1, [1, 2])],
				closure_gaps: [{ after: 1, before: 3, missing: 1 }],
			})
		).toEqual(['duplicates', 'clock', 'closures', 'gaps']);
	});

	it('orderChecks does not mutate its input', () => {
		const checks = [gapsCheck([], 'reg-1'), counted([skew(1, 'ahead')])];
		orderChecks(checks);
		expect(checks.map((check) => check.kind)).toEqual(['gaps', 'clock']);
	});
});

describe('registerState', () => {
	it('is clean when nothing is notable, saying whether the closures were checked', () => {
		// An older plugin sent no closure lists: the clean row must not claim the closure audit.
		expect(registerState(clean)).toEqual({ kind: 'clean', closuresChecked: false });
		expect(
			registerState({
				...clean,
				closure_gaps: [],
				closure_conflicts: [],
				closure_total_mismatches: [],
			})
		).toEqual({ kind: 'clean', closuresChecked: true });
		expect(registerState({ ...clean, closure_conflicts: [] })).toEqual({
			kind: 'clean',
			closuresChecked: true,
		});
	});

	it('keeps the per-check rows when late offline sales are notable', () => {
		const state = registerState({
			...clean,
			skew: [skew(1, 'behind')],
			skew_counts: { ahead: 0, behind: 1 },
		});
		expect(state.kind).toBe('checks');
	});

	it('is not clean when an older plugin sent only a skew sample', () => {
		expect(registerState({ ...clean, skew: [skew(1, 'behind')] }).kind).toBe('checks');
	});

	it('lists every check, failing first, when one fails', () => {
		const state = registerState({
			...clean,
			gaps: [{ till: 'a', after: 1, before: 3, missing: 1 }],
		});
		expect(state.kind === 'checks' && state.checks.map((check) => check.kind)).toEqual([
			'gaps',
			'duplicates',
			'clock',
		]);
	});

	it('lists only failing checks for a register without sales, which may be none', () => {
		const empty = { ...clean, orders: 0, first_counter: null, last_counter: null };
		expect(registerState({ ...empty, closure_gaps: [] })).toEqual({ kind: 'checks', checks: [] });
		const state = registerState({ ...empty, closure_gaps: [{ after: 1, before: 3, missing: 1 }] });
		expect(state.kind === 'checks' && state.checks.map((check) => check.kind)).toEqual([
			'closures',
		]);
	});
});

describe('closuresSupported', () => {
	it('is true when any register carries any closure list, even an empty one', () => {
		expect(closuresSupported([clean, { ...clean, id: 'reg-2', closure_conflicts: [] }])).toBe(true);
	});

	it('is false when no register carries a closure list, or there are no registers', () => {
		expect(closuresSupported([clean, { ...clean, id: 'reg-2' }])).toBe(false);
		expect(closuresSupported([])).toBe(false);
	});
});

describe('helpers', () => {
	it('sums missing and unknown-session sales', () => {
		expect(sumMissing([{ missing: 2 }, { missing: 3 }])).toBe(5);
		expect(
			unknownSessionSales([
				{ session_id: 's1', orders: 2, order_ids: [1, 2] },
				{ session_id: 's2', orders: 1, order_ids: [3] },
			])
		).toBe(3);
	});

	it('shortens an id to its first eight characters', () => {
		expect(shortId('3c9a1f2e-0000-4000-8000-000000000000')).toBe('3c9a1f2e');
	});

	it('treats a till equal to the register id as a sale without a till stamp', () => {
		expect(isUnstampedTill('reg-1', 'reg-1')).toBe(true);
		expect(isUnstampedTill('3c9a1f2e-0000', 'reg-1')).toBe(false);
	});

	it('threads the register id into the till counts', () => {
		const [gaps] = registerChecks({
			...clean,
			gaps: [{ till: 'reg-1', after: 1, before: 3, missing: 1 }],
		});
		expect(gaps).toMatchObject({ kind: 'gaps', tills: 0, unstamped: true });
	});

	it('leaves deleted orders out of an order list', () => {
		expect(orderNumberList(['1001', '', '1003'])).toBe('1001, 1003');
		expect(orderNumberList(['', ''])).toBe('');
	});
});
