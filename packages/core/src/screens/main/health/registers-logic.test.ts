import {
	clockCheck,
	closuresCheck,
	duplicatesCheck,
	gapsCheck,
	groupDuplicatesByTill,
	orderChecks,
	registerChecks,
	registerState,
	shortTill,
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
const kinds = (register: RegisterReport) => registerChecks(register).map((check) => check.kind);

describe('gapsCheck', () => {
	it('sums missing numbers, counts distinct tills and sorts by till then after', () => {
		const check = gapsCheck([
			{ till: 'b', after: 1, before: 3, missing: 1 },
			{ till: 'a', after: 10, before: 14, missing: 3 },
			{ till: 'a', after: 2, before: 4, missing: 1 },
		]);
		expect(check.failing).toBe(true);
		expect(check.missing).toBe(5);
		expect(check.tills).toBe(2);
		expect(check.rows.map((gap) => `${gap.till}:${gap.after}`)).toEqual(['a:2', 'a:10', 'b:1']);
	});

	it('passes with no gaps', () => {
		expect(gapsCheck([])).toEqual({ kind: 'gaps', failing: false, missing: 0, tills: 0, rows: [] });
	});
});

describe('groupDuplicatesByTill', () => {
	it('puts a till’s counters together, tills and counters ascending', () => {
		const groups = groupDuplicatesByTill([
			duplicate('b', 1, [21, 22]),
			duplicate('a', 3, [13, 14]),
			duplicate('a', 1, [11, 12]),
		]);
		expect(groups.map((group) => group.till)).toEqual(['a', 'b']);
		expect(groups[0].duplicates.map((row) => row.counter)).toEqual([1, 3]);
	});

	it('counts the tills that restarted, not the repeated counters', () => {
		const check = duplicatesCheck([
			duplicate('a', 1, [1, 2]),
			duplicate('a', 2, [3, 4]),
			duplicate('b', 1, [5, 6]),
		]);
		expect(check.failing).toBe(true);
		expect(check.groups).toHaveLength(2);
	});
});

describe('clock', () => {
	it('splits skew by direction', () => {
		const { ahead, behind } = splitSkew([skew(1, 'behind'), skew(2, 'ahead'), skew(3, 'behind')]);
		expect(ahead.map((entry) => entry.order_id)).toEqual([2]);
		expect(behind.map((entry) => entry.order_id)).toEqual([1, 3]);
	});

	it('fails only on a clock running ahead', () => {
		expect(clockCheck([skew(1, 'behind')]).failing).toBe(false);
		expect(clockCheck([skew(1, 'behind'), skew(2, 'ahead')]).failing).toBe(true);
	});
});

describe('closuresCheck', () => {
	it('is absent when the plugin sends none of the closure lists', () => {
		expect(closuresCheck(clean)).toBeNull();
	});

	it('passes when the lists are present and empty', () => {
		expect(closuresCheck({ ...clean, closure_gaps: [] })?.failing).toBe(false);
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
		expect(check?.missing).toBe(3);
		expect(check?.conflicts).toEqual([]);
		expect(
			closuresCheck({ ...clean, closure_total_mismatches: [{ id: 'c', number: 4, findings: {} }] })
				?.failing
		).toBe(true);
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
				duplicates: [duplicate('a', 1, [1, 2])],
				closure_gaps: [{ after: 1, before: 3, missing: 1 }],
			})
		).toEqual(['duplicates', 'clock', 'closures', 'gaps']);
	});

	it('orderChecks does not mutate its input', () => {
		const checks = [gapsCheck([]), clockCheck([skew(1, 'ahead')])];
		orderChecks(checks);
		expect(checks.map((check) => check.kind)).toEqual(['gaps', 'clock']);
	});
});

describe('registerState', () => {
	it('is clean when every check passes and nothing is worth a line', () => {
		expect(registerState(clean)).toEqual({ kind: 'clean' });
		expect(
			registerState({
				...clean,
				closure_gaps: [],
				closure_conflicts: [],
				closure_total_mismatches: [],
			})
		).toEqual({ kind: 'clean' });
	});

	it('keeps the per-check rows when late offline sales are worth a line', () => {
		const state = registerState({ ...clean, skew: [skew(1, 'behind')] });
		expect(state.kind).toBe('checks');
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

	it('shows no checks for a register without sales unless one fails', () => {
		const empty = { ...clean, orders: 0, first_counter: null, last_counter: null };
		expect(registerState({ ...empty, closure_gaps: [] })).toEqual({ kind: 'empty', checks: [] });
		const state = registerState({ ...empty, closure_gaps: [{ after: 1, before: 3, missing: 1 }] });
		expect(state.kind === 'empty' && state.checks.map((check) => check.kind)).toEqual(['closures']);
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

	it('shortens a till id to its first eight characters', () => {
		expect(shortTill('3c9a1f2e-0000-4000-8000-000000000000')).toBe('3c9a1f2e');
	});
});
