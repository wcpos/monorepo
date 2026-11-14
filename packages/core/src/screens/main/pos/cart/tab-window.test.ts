import { centredOffset, leadingOffset, rowOverflows, snapOffsets, tabOffsets } from './tab-window';

it.each([
	[0, 96, 0],
	[400, 120, 232],
	[700, 100, 344],
])('centres x=%s width=%s, clamped to the content edges', (tabX, tabWidth, expected) => {
	expect(centredOffset({ rowWidth: 456, contentWidth: 800, tabX, tabWidth })).toBe(expected);
});
it('never scrolls fitting content into empty space', () => {
	expect(centredOffset({ rowWidth: 500, contentWidth: 200, tabX: 100, tabWidth: 100 })).toBe(0);
});
it.each([
	[448, false],
	[449, true],
	[0, false],
])('reserves the unfolded cell, but not the tray (%s)', (contentWidth, expected) => {
	expect(rowOverflows({ stripWidth: 560, contentWidth })).toBe(expected);
});
it('waits for a positive strip layout', () => {
	expect(rowOverflows({ stripWidth: 0, contentWidth: 800 })).toBe(false);
});
it('sorts and deduplicates native snap stops after clamping', () => {
	expect(
		snapOffsets({
			rowWidth: 300,
			contentWidth: 600,
			tabs: [
				{ x: 500, width: 100 },
				{ x: 0, width: 100 },
				{ x: 100, width: 100 },
				{ x: 400, width: 100 },
				{ x: 200, width: 100 },
			],
		})
	).toEqual([0, 100, 300]);
	expect(snapOffsets({ rowWidth: 300, contentWidth: 0, tabs: [] })).toEqual([]);
});
it('phone: the tab before the active one leads while the active one fits whole beside it', () => {
	expect(
		leadingOffset({ rowWidth: 456, contentWidth: 800, tabX: 400, tabWidth: 100, previousX: 300 })
	).toBe(300);
	expect(leadingOffset({ rowWidth: 456, contentWidth: 800, tabX: 0, tabWidth: 100 })).toBe(0);
});
it('phone: a wide active tab leads itself', () => {
	expect(
		leadingOffset({ rowWidth: 456, contentWidth: 1100, tabX: 400, tabWidth: 400, previousX: 300 })
	).toBe(400);
});
it('phone: never past the end of the row', () => {
	expect(
		leadingOffset({ rowWidth: 456, contentWidth: 800, tabX: 700, tabWidth: 100, previousX: 600 })
	).toBe(344);
});
it('phone snap stops are tab starts, clamped and de-duplicated', () => {
	expect(
		snapOffsets({
			rowWidth: 456,
			contentWidth: 800,
			tabs: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: i * 100, width: 100 })),
			align: 'start',
		})
	).toEqual([0, 100, 200, 300, 344]);
});

it('derives offsets from mounted order and measured widths, not stale positions', () => {
	const widths = new Map([
		['a', 100],
		['b', 200],
		['c', 120],
	]);
	expect([...tabOffsets(['a', 'b', 'c'], widths)]).toEqual([
		['a', { x: 0, width: 100 }],
		['b', { x: 100, width: 200 }],
		['c', { x: 300, width: 120 }],
	]);
	expect([...tabOffsets(['b', 'c'], widths)]).toEqual([
		['b', { x: 0, width: 200 }],
		['c', { x: 200, width: 120 }],
	]);
});
it('waits for preceding widths rather than guessing an active tab offset', () => {
	expect([...tabOffsets(['a', 'b'], new Map([['b', 120]]))]).toEqual([]);
});
