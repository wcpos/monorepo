import { ARROW_WIDTH, PLUS_WIDTH, TAB_MIN, tabWindow, TRAY_WIDTH } from './tab-window';

// A 560 column: 512 for tabs once the + has its cell.
const WIDTH = 560;
const same = (count: number, width = TAB_MIN) => Array.from({ length: count }, () => width);

it('one cart: no tray, no arrows', () => {
	expect(tabWindow({ width: WIDTH, widths: [120], active: 0 })).toEqual({
		fits: true,
		start: 0,
		end: 1,
		tray: false,
		left: false,
		right: false,
	});
});

it('carts whose own widths fit are all shown with nothing else', () => {
	expect(tabWindow({ width: WIDTH, widths: [96, 140, 96, 110], active: 1 })).toMatchObject({
		fits: true,
		start: 0,
		end: 4,
		tray: false,
	});
	// Five at the minimum is 480, which still fits in 512; six does not.
	expect(tabWindow({ width: WIDTH, widths: same(5), active: 4 }).fits).toBe(true);
	expect(tabWindow({ width: WIDTH, widths: same(6), active: 0 }).fits).toBe(false);
});

it('overflow grows outwards from the open cart, right then left, by whole tabs', () => {
	// 512 - tray 56 - two arrows 88 = 368: three minimum-width tabs. e, then f, then d.
	expect(tabWindow({ width: WIDTH, widths: same(8), active: 4 })).toEqual({
		fits: false,
		start: 3,
		end: 6,
		tray: true,
		left: true,
		right: true,
	});
	// A wide neighbour that would not fit whole is left out, and the other side keeps growing.
	const widths = [96, 96, 96, 200, 96, 96, 96, 96];
	expect(tabWindow({ width: WIDTH, widths, active: 4 })).toMatchObject({ start: 4, end: 7 });
});

it('the first cart grows right only, with only the right arrow', () => {
	const window = tabWindow({ width: WIDTH, widths: same(8), active: 0 });
	// 512 - 56 - 44 = 412: four whole tabs.
	expect(window).toEqual({ fits: false, start: 0, end: 4, tray: true, left: false, right: true });
	expect(WIDTH - PLUS_WIDTH - TRAY_WIDTH - ARROW_WIDTH).toBeGreaterThanOrEqual(4 * TAB_MIN);
});

it('the last cart grows left only, with only the left arrow', () => {
	expect(tabWindow({ width: WIDTH, widths: same(8), active: 7 })).toMatchObject({
		start: 4,
		end: 8,
		left: true,
		right: false,
	});
});

it('an open cart near an edge drops the arrow on that side and refits without it', () => {
	const window = tabWindow({ width: WIDTH, widths: same(8), active: 1 });
	expect(window).toMatchObject({ start: 0, left: false, right: true });
	expect(window.end).toBe(4);
});

it('a phone row keeps the open cart alone between its arrows', () => {
	expect(tabWindow({ width: 390, widths: same(6, 120), active: 3 })).toMatchObject({
		start: 3,
		end: 4,
		left: true,
		right: true,
	});
});

it('always shows the open cart, whole, and reports the arrows from what is hidden', () => {
	for (let width = 200; width <= 1200; width += 13) {
		for (let count = 1; count <= 12; count += 1) {
			const widths = Array.from({ length: count }, (_, i) => TAB_MIN + ((i * 37) % 80));
			for (let active = 0; active < count; active += 1) {
				const window = tabWindow({ width, widths, active });
				expect(window.end).toBeGreaterThan(window.start);
				expect(window.start).toBeGreaterThanOrEqual(0);
				expect(window.end).toBeLessThanOrEqual(count);
				expect(active).toBeGreaterThanOrEqual(window.start);
				expect(active).toBeLessThan(window.end);
				if (!window.fits) {
					expect(window.left).toBe(window.start > 0);
					expect(window.right).toBe(window.end < count);
					const available =
						width -
						PLUS_WIDTH -
						TRAY_WIDTH -
						(window.left ? ARROW_WIDTH : 0) -
						(window.right ? ARROW_WIDTH : 0);
					const used = widths.slice(window.start, window.end).reduce((a, b) => a + b, 0);
					// Whole tabs: the window never exceeds its room, unless the open cart alone does.
					if (window.end - window.start > 1) expect(used).toBeLessThanOrEqual(available);
				}
			}
		}
	}
});
