import { fitPageSize } from './fit-page-size';

describe('fitPageSize', () => {
	it('uses the minimum before layout is available', () => {
		expect(fitPageSize({ viewMode: 'grid', width: 0, height: 1500, gridColumns: 4 })).toBe(10);
		expect(fitPageSize({ viewMode: 'table', width: 1000, height: 0, gridColumns: 4 })).toBe(10);
	});

	it('fits grid rows plus one buffer row', () => {
		expect(fitPageSize({ viewMode: 'grid', width: 1000, height: 1500, gridColumns: 4 })).toBe(24);
	});

	it('caps a wide grid at one server page', () => {
		expect(fitPageSize({ viewMode: 'grid', width: 1600, height: 1800, gridColumns: 8 })).toBe(50);
	});

	it('fits table rows plus two buffer rows', () => {
		expect(fitPageSize({ viewMode: 'table', width: 1000, height: 800, gridColumns: 4 })).toBe(17);
	});

	it('uses the minimum for a grid until the columns setting resolves', () => {
		expect(
			fitPageSize({ viewMode: 'grid', width: 1000, height: 1500, gridColumns: undefined })
		).toBe(10);
		expect(fitPageSize({ viewMode: 'grid', width: 1000, height: 1500, gridColumns: 0 })).toBe(10);
		// The table view does not depend on columns.
		expect(
			fitPageSize({ viewMode: 'table', width: 1000, height: 800, gridColumns: undefined })
		).toBe(17);
	});

	it('floors a tiny panel at the old page size', () => {
		expect(fitPageSize({ viewMode: 'grid', width: 100, height: 100, gridColumns: 2 })).toBe(10);
		expect(fitPageSize({ viewMode: 'table', width: 100, height: 100, gridColumns: 2 })).toBe(10);
	});
});
