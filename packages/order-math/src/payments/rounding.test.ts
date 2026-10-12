import { roundedDue, roundToIncrement } from './rounding';

describe('roundToIncrement', () => {
	it.each([
		// minor, increment, nearest, up, down
		[1002, 5, 1000, 1005, 1000],
		[1003, 5, 1005, 1005, 1000],
		[1025, 10, 1030, 1030, 1020], // half-up: the midpoint goes up
		[1024, 10, 1020, 1030, 1020],
		[1000, 5, 1000, 1000, 1000], // already on the increment
		[2, 5, 0, 5, 0],
	])('%i to %i: nearest %i, up %i, down %i', (minor, increment, nearest, up, down) => {
		expect(roundToIncrement(minor, increment, 'nearest')).toBe(nearest);
		expect(roundToIncrement(minor, increment, 'up')).toBe(up);
		expect(roundToIncrement(minor, increment, 'down')).toBe(down);
	});

	it('rounds nothing for an increment of one minor unit or less', () => {
		expect(roundToIncrement(1003, 1, 'up')).toBe(1003);
		expect(roundToIncrement(1003, 0, 'nearest')).toBe(1003);
	});
});

describe('roundedDue', () => {
	it('is the identity without rounding', () => {
		expect(roundedDue(1003, null, 2)).toEqual({ dueMinor: 1003, roundingMinor: 0 });
	});

	it('reads the increment in the store currency and reports the signed difference', () => {
		expect(roundedDue(1003, { increment: '0.05', mode: 'nearest' }, 2)).toEqual({
			dueMinor: 1005,
			roundingMinor: 2,
		});
		expect(roundedDue(1002, { increment: '0.05', mode: 'nearest' }, 2)).toEqual({
			dueMinor: 1000,
			roundingMinor: -2,
		});
		expect(roundedDue(1002, { increment: '0.01', mode: 'up' }, 2)).toEqual({
			dueMinor: 1002,
			roundingMinor: 0,
		});
	});

	it('rounds a currency with no decimals (HUF to the 5)', () => {
		expect(roundedDue(1233, { increment: '5', mode: 'nearest' }, 0)).toEqual({
			dueMinor: 1235,
			roundingMinor: 2,
		});
		expect(roundedDue(1232, { increment: '5', mode: 'down' }, 0)).toEqual({
			dueMinor: 1230,
			roundingMinor: -2,
		});
	});
});
