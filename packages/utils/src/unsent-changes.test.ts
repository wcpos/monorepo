import {
	classifyUnsentChanges,
	forgetUnsentChanges,
	readUnsentChanges,
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
