import {
	bodyOffset,
	editOffset,
	LABEL_INSET,
	releaseOutcome,
	REMOVE_BAND,
	removeOffset,
	removePoint,
	stripInWindow,
	stripOffset,
	windowOffset,
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
});
