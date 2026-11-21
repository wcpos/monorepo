import {
	bodyOffset,
	byKey,
	CLOSE_MIN,
	closeMinWidth,
	editOffset,
	LABEL_INSET,
	releaseOutcome,
	REMOVE_BAND,
	removeOffset,
	removePoint,
	secondClick,
	stripInWindow,
	stripOffset,
	windowOffset,
	windowOpacity,
} from './line-strip.geometry';

// A register column and a phone, with the shipped strip (Edit 88 + Remove 96).
const REGISTER = { rowWidth: 440, stripWidth: 184 };
const PHONE = { rowWidth: 390, stripWidth: 184 };

describe('removePoint', () => {
	it('sits at 60 % of a register column, a clear band past the open strip', () => {
		expect(removePoint(440, 184)).toBe(264);
		expect(removePoint(440, 184) - 184).toBeGreaterThanOrEqual(REMOVE_BAND);
	});
	it('never comes closer than the band to the open strip, however narrow the row', () => {
		// A phone: 60 % would be 234, inside the band.
		expect(removePoint(390, 184)).toBe(184 + REMOVE_BAND);
		// Before the row has been measured there is still a point past the strip.
		expect(removePoint(0, 184)).toBe(184 + REMOVE_BAND);
	});
});

describe('releaseOutcome', () => {
	it('lets go past the line: the line leaves', () => {
		expect(releaseOutcome({ ...REGISTER, revealed: 264, velocityX: 0 })).toBe('remove');
		expect(releaseOutcome({ ...PHONE, revealed: 240, velocityX: 0 })).toBe('remove');
	});
	it('lets go short of the line: open past half the strip, home before it', () => {
		expect(releaseOutcome({ ...REGISTER, revealed: 263, velocityX: 0 })).toBe('open');
		expect(releaseOutcome({ ...REGISTER, revealed: 93, velocityX: 0 })).toBe('open');
		expect(releaseOutcome({ ...REGISTER, revealed: 92, velocityX: 0 })).toBe('home');
		expect(releaseOutcome({ ...REGISTER, revealed: 0, velocityX: 0 })).toBe('home');
	});
	it('a fast flick past the open strip removes without reaching the line', () => {
		expect(releaseOutcome({ ...REGISTER, revealed: 200, velocityX: -900 })).toBe('remove');
		// Not past the strip: a flick only opens it.
		expect(releaseOutcome({ ...REGISTER, revealed: 150, velocityX: -900 })).toBe('open');
		// Too slow, or the wrong way.
		expect(releaseOutcome({ ...REGISTER, revealed: 200, velocityX: -500 })).toBe('open');
		expect(releaseOutcome({ ...REGISTER, revealed: 200, velocityX: 900 })).toBe('open');
	});
});

describe('the strip under the pull', () => {
	it('Edit stays put until the pull passes the open strip, then rides with the row edge', () => {
		expect(editOffset(100, 184, 88, 0)).toBe(0);
		expect(editOffset(184, 184, 88, 0)).toBe(0);
		expect(editOffset(232, 184, 88, 0)).toBe(-48);
	});
	it('swallowed, Edit slides its own width further, under the row', () => {
		expect(editOffset(280, 184, 88, 1)).toBe(-(280 - 184) - 88);
		expect(editOffset(280, 184, 88, 0.5)).toBe(-(280 - 184) - 44);
	});
	it('Remove stays the block at the far right until the line, then rides beside the row edge', () => {
		expect(removeOffset(280, 96, 0)).toBe(0);
		expect(removeOffset(280, 96, 1)).toBe(-(280 - 96 - LABEL_INSET));
		// Never right of its rest, even when the row is barely past the block.
		expect(removeOffset(100, 96, 1)).toBe(0);
	});
});

describe('the strip over the row', () => {
	const STRIP_WIDTH = 200;
	const EDIT_WIDTH = 90;
	const ROW_WIDTH = 600;
	const PULLS = [0, 16, 100, 200, 260, removePoint(ROW_WIDTH, STRIP_WIDTH)];
	it('the body holds still up to the open rest, then moves with the pull past it', () => {
		expect(bodyOffset(0, STRIP_WIDTH)).toBe(0);
		expect(bodyOffset(100, STRIP_WIDTH)).toBe(0);
		expect(bodyOffset(200, STRIP_WIDTH)).toBe(0);
		expect(bodyOffset(260, STRIP_WIDTH)).toBe(-60);
		// A resting body is 0, never -0.
		expect(Object.is(bodyOffset(100, STRIP_WIDTH), 0)).toBe(true);
	});
	it('the strip slides in from the trailing edge and stops at the open rest', () => {
		expect(stripOffset(0, STRIP_WIDTH)).toBe(200);
		expect(stripOffset(16, STRIP_WIDTH)).toBe(184);
		expect(stripOffset(200, STRIP_WIDTH)).toBe(0);
		expect(stripOffset(260, STRIP_WIDTH)).toBe(0);
	});
	it("Edit's leading edge is always the window's leading edge, until Remove swallows it", () => {
		for (const r of PULLS) {
			const editLeft =
				ROW_WIDTH -
				STRIP_WIDTH +
				stripOffset(r, STRIP_WIDTH) +
				editOffset(r, STRIP_WIDTH, EDIT_WIDTH, 0);
			expect(editLeft).toBe(ROW_WIDTH - r);
		}
	});
	it('the body always reaches under the window: no gap', () => {
		for (const r of PULLS) {
			expect(ROW_WIDTH + bodyOffset(r, STRIP_WIDTH)).toBeGreaterThanOrEqual(ROW_WIDTH - r);
		}
	});
});

describe('the window moves, never resizes', () => {
	const ROW_WIDTH = 400;
	const STRIP_WIDTH = 200;
	it('the row-wide window slides in from the trailing edge and stops at the leading edge', () => {
		expect(windowOffset(0, ROW_WIDTH)).toBe(400);
		expect(windowOffset(200, ROW_WIDTH)).toBe(200);
		expect(windowOffset(400, ROW_WIDTH)).toBe(0);
		expect(windowOffset(500, ROW_WIDTH)).toBe(0);
		// A window at the leading edge is 0, never -0.
		expect(Object.is(windowOffset(400, ROW_WIDTH), 0)).toBe(true);
	});
	it('shows the same picture as the window that was as wide as the pull', () => {
		for (const r of [0, 16, 100, 200, 260, 399, 400]) {
			const left = windowOffset(r, ROW_WIDTH);
			// The row clips the window at its own right edge.
			const visible = [left, Math.min(ROW_WIDTH, left + ROW_WIDTH)];
			expect(visible).toEqual([ROW_WIDTH - Math.min(r, ROW_WIDTH), ROW_WIDTH]);
			const stripRight = left + ROW_WIDTH + stripInWindow(r, STRIP_WIDTH, ROW_WIDTH);
			expect(stripRight).toBe(ROW_WIDTH + stripOffset(r, STRIP_WIDTH));
		}
	});
	it('the window is hidden only while its row is unmeasured', () => {
		expect(windowOpacity(0)).toBe(0);
		expect(windowOpacity(ROW_WIDTH)).toBe(1);
	});
});

describe('the strip with a Close tile (fine pointer, 2026-11-21 board)', () => {
	// Edit · Remove is 159 at a 482 row in every locale below; Close is the Total column's 72, or its
	// word plus the Button's padding where that is wider (de "Schließen" 98, nl "Sluiten" 78).
	const EDIT_REMOVE = 159;
	const CLOSE = { en: 72, de: 98, nl: 78 };
	for (const [locale, close] of Object.entries(CLOSE)) {
		for (const rowWidth of [390, 482]) {
			it(`${locale} at a ${rowWidth} row: the band between open and remove stays at least ${REMOVE_BAND} px`, () => {
				const stripWidth = EDIT_REMOVE + close;
				const line = removePoint(rowWidth, stripWidth);
				expect(line - stripWidth).toBeGreaterThanOrEqual(REMOVE_BAND);
				// The line is still inside the row: a long swipe can reach it.
				expect(line).toBeLessThan(rowWidth);
				expect(releaseOutcome({ rowWidth, stripWidth, revealed: line, velocityX: 0 })).toBe(
					'remove'
				);
				expect(releaseOutcome({ rowWidth, stripWidth, revealed: line - 1, velocityX: 0 })).toBe(
					'open'
				);
				// A fast flick past the open strip still removes.
				expect(
					releaseOutcome({ rowWidth, stripWidth, revealed: stripWidth + 1, velocityX: -900 })
				).toBe('remove');
			});
		}
	}
	it('Remove rests one Close tile in from the edge and, past the line, rides the row edge as before', () => {
		// en at 482: Edit 70 · Remove 89 · Close 72 (strip 231); the row 280 out, Remove fully over Edit.
		const trailing = 89 + 72;
		expect(removeOffset(280, trailing, 0)).toBe(0);
		// Its leading edge lands LABEL_INSET in from the row's trailing edge (482 - 280).
		const restLeft = 482 - trailing;
		expect(restLeft + removeOffset(280, trailing, 1)).toBe(482 - 280 + LABEL_INSET);
		// Pressed open (the row at the open strip), Remove covers Edit's place, LABEL_INSET in.
		expect(restLeft + removeOffset(231, trailing, 1)).toBe(482 - 231 + LABEL_INSET);
	});
	it('a touch drag from 85 % to 10 % of a coarse row crosses the line', () => {
		// The e2e check (cart-touch-scroll.spec.ts): the phone's 412 row with the touch strip.
		const rowWidth = 412;
		expect(rowWidth * 0.75).toBeGreaterThanOrEqual(removePoint(rowWidth, EDIT_REMOVE));
		// A 150 px drag only opens it.
		expect(releaseOutcome({ rowWidth, stripWidth: EDIT_REMOVE, revealed: 150, velocityX: 0 })).toBe(
			'open'
		);
	});
});

describe("Close's width", () => {
	it("covers the total's footprint, never under the Total column's floor", () => {
		expect(closeMinWidth(72, 482, 159)).toBe(72);
		// A $1,240.00 total widens its cell, and Close with it.
		expect(closeMinWidth(76, 482, 159)).toBe(76);
		expect(closeMinWidth(0, 482, 159)).toBe(CLOSE_MIN);
	});
	it('a wide fallback target (Total hidden) still leaves Edit and Remove in the row', () => {
		// The last visible cell is the Name: its footprint is most of the row.
		expect(closeMinWidth(400, 482, 159)).toBe(482 - 159);
		expect(482 - closeMinWidth(400, 482, 159)).toBeGreaterThanOrEqual(159);
	});
});

describe('the clicks behind a press', () => {
	const web = (detail: number) => ({ nativeEvent: { detail } });
	it('reads Enter or Space (a pointerless click) and a double click’s second click', () => {
		expect([0, 1, 2, 3].map((n) => byKey(web(n)))).toEqual([true, false, false, false]);
		expect([0, 1, 2, 3].map((n) => secondClick(web(n)))).toEqual([false, false, true, true]);
	});
	it('native presses carry no count: never the keyboard, never a second click', () => {
		const native = { nativeEvent: { locationX: 4, pageX: 10 } };
		expect(byKey(native)).toBe(false);
		expect(secondClick(native)).toBe(false);
	});
});
