import {
	editOffset,
	LABEL_INSET,
	releaseOutcome,
	REMOVE_BAND,
	removeOffset,
	removePoint,
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
