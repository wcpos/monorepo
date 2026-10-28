import { centredOffset, rowOverflows, snapOffsets } from './tab-window';

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
	[512, false],
	[513, true],
	[0, false],
])('tests overflow without reserving a tray (%s)', (contentWidth, expected) => {
	expect(rowOverflows({ stripWidth: 560, plusWidth: 48, contentWidth })).toBe(expected);
});
it('waits for a positive strip layout', () => {
	expect(rowOverflows({ stripWidth: 0, plusWidth: 48, contentWidth: 800 })).toBe(false);
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
