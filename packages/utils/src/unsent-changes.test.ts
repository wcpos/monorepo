import {
	awaitLegacyUnsentReport,
	classifyUnsentChanges,
	forgetUnsentChanges,
	legacyUnsentOrderUuids,
	legacyUnsentReportUncountable,
	markLegacyDrainPending,
	readUnsentChanges,
	rememberLegacyUnsentChanges,
	rememberUnsentChanges,
} from './unsent-changes';

describe('classifyUnsentChanges', () => {
	it('reads zero as "nothing to lose"', () => {
		expect(classifyUnsentChanges(0)).toEqual({ status: 'none' });
	});

	it('reads a positive count as a number the confirm can state', () => {
		expect(classifyUnsentChanges(3)).toEqual({ status: 'some', count: 3 });
	});

	it('never reports an unusable count as "none"', () => {
		// The whole point of the three-valued reading: a reset that cannot count
		// must warn that it MAY destroy unsent sales, not imply that it will not.
		expect(classifyUnsentChanges(null)).toEqual({ status: 'unknown' });
		expect(classifyUnsentChanges(undefined)).toEqual({ status: 'unknown' });
		expect(classifyUnsentChanges(Number.NaN)).toEqual({ status: 'unknown' });
		expect(classifyUnsentChanges(-1)).toEqual({ status: 'unknown' });
	});

	it('floors a fractional count rather than rendering "1.5 changes"', () => {
		expect(classifyUnsentChanges(1.5)).toEqual({ status: 'some', count: 1 });
	});
});

describe('the remembered reading', () => {
	beforeEach(() => {
		forgetUnsentChanges();
	});

	it('is unknown until something records a count', () => {
		expect(readUnsentChanges()).toEqual({ status: 'unknown' });
	});

	it('survives for the crash screen to read back', () => {
		rememberUnsentChanges(2);
		expect(readUnsentChanges()).toEqual({ status: 'some', count: 2 });
	});

	it('downgrades to unknown when a later read fails, rather than keeping a stale number', () => {
		rememberUnsentChanges(2);
		rememberUnsentChanges(null);
		expect(readUnsentChanges()).toEqual({ status: 'unknown' });
	});

	it('records an empty queue as "none", which is a real answer', () => {
		rememberUnsentChanges(0);
		expect(readUnsentChanges()).toEqual({ status: 'none' });
	});

	it('is forgotten after a wipe — there is nothing left to lose', () => {
		rememberUnsentChanges(5);
		forgetUnsentChanges();
		expect(readUnsentChanges()).toEqual({ status: 'unknown' });
	});

	it('is shared through globalThis so a duplicated module copy still sees it', () => {
		rememberUnsentChanges(4);
		expect(
			(globalThis as unknown as Record<string, { count: number | null }>).__wcposUnsentChanges.count
		).toBe(4);
	});
});

describe('a kept previous-generation database', () => {
	beforeEach(() => forgetUnsentChanges());

	it('adds its unsent rows to the count a wipe warns about', () => {
		rememberLegacyUnsentChanges('pos_v5_a', 3);
		expect(classifyUnsentChanges(0)).toEqual({ status: 'some', count: 3 });
		expect(classifyUnsentChanges(2)).toEqual({ status: 'some', count: 5 });
		rememberUnsentChanges(1);
		expect(readUnsentChanges()).toEqual({ status: 'some', count: 4 });
		// An unknown active count stays unknown: the legacy rows do not make it a number.
		expect(classifyUnsentChanges(null)).toEqual({ status: 'unknown' });
	});

	it('drops out once drained, and is forgotten after a wipe', () => {
		rememberLegacyUnsentChanges('pos_v5_a', 3);
		rememberLegacyUnsentChanges('pos_v5_a', 0);
		expect(classifyUnsentChanges(0)).toEqual({ status: 'none' });
		rememberLegacyUnsentChanges('pos_v5_b', 2);
		forgetUnsentChanges();
		expect(classifyUnsentChanges(0)).toEqual({ status: 'none' });
	});

	it('a database not yet reported (or not countable) is never "nothing to lose"', () => {
		markLegacyDrainPending('pos_v5_a');
		expect(classifyUnsentChanges(0)).toEqual({ status: 'unknown' });
		expect(classifyUnsentChanges(2)).toEqual({ status: 'some', count: 2 });
		rememberLegacyUnsentChanges('pos_v5_a', null);
		expect(classifyUnsentChanges(0)).toEqual({ status: 'unknown' });
		rememberLegacyUnsentChanges('pos_v5_a', 0);
		expect(classifyUnsentChanges(0)).toEqual({ status: 'none' });
	});

	it('remembers WHICH orders a kept database holds, per database', () => {
		rememberLegacyUnsentChanges('pos_v5_a', 2, ['order-1', 'order-2']);
		rememberLegacyUnsentChanges('pos_v5_b', 1, ['order-3']);
		expect([...legacyUnsentOrderUuids()].sort()).toEqual(['order-1', 'order-2', 'order-3']);
		rememberLegacyUnsentChanges('pos_v5_a', 0);
		expect([...legacyUnsentOrderUuids()]).toEqual(['order-3']);
	});

	it('a reader can wait for the drain to report, bounded', async () => {
		await expect(awaitLegacyUnsentReport('pos_v5_a', 1_000)).resolves.toBe('reported');
		markLegacyDrainPending('pos_v5_a');
		const reported = awaitLegacyUnsentReport('pos_v5_a', 60_000);
		rememberLegacyUnsentChanges('pos_v5_a', 1, ['order-1']);
		await expect(reported).resolves.toBe('reported');

		jest.useFakeTimers();
		try {
			markLegacyDrainPending('pos_v5_b');
			const waited = awaitLegacyUnsentReport('pos_v5_b', 5_000);
			await jest.advanceTimersByTimeAsync(4_999);
			let settled: string | null = null;
			void waited.then((result) => {
				settled = result;
			});
			await Promise.resolve();
			expect(settled).toBeNull();
			await jest.advanceTimersByTimeAsync(1);
			await expect(waited).resolves.toBe('timed-out');
		} finally {
			jest.useRealTimers();
		}
	});

	it("a wait keyed to one scope's database never blocks on another's mark", async () => {
		markLegacyDrainPending('pos_v5_b');
		await expect(awaitLegacyUnsentReport('pos_v5_a', 60_000)).resolves.toBe('reported');
		markLegacyDrainPending('pos_v5_a');
		const waited = awaitLegacyUnsentReport('pos_v5_a', 60_000);
		rememberLegacyUnsentChanges('pos_v5_a', 0);
		// pos_v5_b is still pending; pos_v5_a's own report released the wait.
		await expect(waited).resolves.toBe('reported');
	});

	it('an uncountable report is unknown for that database only, and ends with a countable one', () => {
		markLegacyDrainPending('pos_v5_a');
		// Pending is not yet a report.
		expect(legacyUnsentReportUncountable('pos_v5_a')).toBe(false);
		rememberLegacyUnsentChanges('pos_v5_a', null);
		expect(legacyUnsentReportUncountable('pos_v5_a')).toBe(true);
		expect(legacyUnsentReportUncountable('pos_v5_b')).toBe(false);
		rememberLegacyUnsentChanges('pos_v5_a', 0);
		expect(legacyUnsentReportUncountable('pos_v5_a')).toBe(false);
	});
});
