import { niceCeil, xTickValues, yTickValues } from './trend-scale';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

const HOUR_MS = 60 * 60 * 1000;
const point = (hour: number, y = 1) => ({ x: hour * HOUR_MS, y });

describe('niceCeil', () => {
	it('snaps to the nearest 1/2/5 step above the value', () => {
		expect(niceCeil(0.7)).toBe(1);
		expect(niceCeil(1.4)).toBe(2);
		expect(niceCeil(3)).toBe(5);
		expect(niceCeil(13.997)).toBe(20);
		expect(niceCeil(1252)).toBe(2000);
		expect(niceCeil(5000)).toBe(5000);
	});

	it('never returns a zero or negative domain', () => {
		expect(niceCeil(0)).toBe(1);
		expect(niceCeil(-5)).toBe(1);
		expect(niceCeil(Number.NaN)).toBe(1);
	});
});

describe('xTickValues', () => {
	it('uses every point when there are few', () => {
		const points = [point(1), point(2), point(3)];
		expect(xTickValues(points)).toEqual([HOUR_MS, 2 * HOUR_MS, 3 * HOUR_MS]);
	});

	it('spreads at most maxTicks across a long series, ends included', () => {
		const points = Array.from({ length: 24 }, (_, i) => point(i));
		const ticks = xTickValues(points, 4);
		expect(ticks).toHaveLength(4);
		expect(ticks[0]).toBe(points[0].x);
		expect(ticks.at(-1)).toBe(points[23].x);
		// Ticks come from real buckets, so every one is an exact hour boundary.
		for (const tick of ticks) expect(tick % HOUR_MS).toBe(0);
	});

	it('returns one endpoint when maxTicks is one', () => {
		const points = [point(1), point(2)];
		expect(xTickValues(points, 1)).toEqual([points[0].x]);
	});

	it('returns nothing for an empty series', () => {
		expect(xTickValues([])).toEqual([]);
	});
});

describe('yTickValues', () => {
	it('brackets a zero-based domain with a midpoint', () => {
		expect(yTickValues(2000)).toEqual([0, 1000, 2000]);
	});
});
