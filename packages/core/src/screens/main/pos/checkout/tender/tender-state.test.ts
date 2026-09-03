import {
	appliedMinor,
	changeMinor,
	evenSplitShareMinor,
	initialTenderState,
	MAX_TENDER_MINOR,
	quickTenderedAmounts,
	tenderReducer,
} from './tender-state';

describe('tenderReducer', () => {
	it('replaces the pre-fill on the first digit, then shifts later digits in from the right', () => {
		const picked = tenderReducer(initialTenderState, {
			type: 'pick-method',
			methodId: 'cash',
			prefillMinor: 4295,
		});

		const firstDigit = tenderReducer(picked, { type: 'key', key: '5' });
		const secondDigit = tenderReducer(firstDigit, { type: 'key', key: '0' });

		expect(firstDigit).toMatchObject({ entryMinor: 5, entryDirty: true });
		expect(secondDigit).toMatchObject({ entryMinor: 50, entryDirty: true });
	});

	it('returns the same state when another digit would exceed the tender cap', () => {
		const atCap = tenderReducer(
			{ ...initialTenderState, view: 'amount' },
			{ type: 'set-entry', minor: MAX_TENDER_MINOR }
		);

		expect(tenderReducer(atCap, { type: 'key', key: '9' })).toBe(atCap);
	});

	it('backspaces and clears keypad entries', () => {
		const state = {
			...initialTenderState,
			view: 'amount' as const,
			methodId: 'cash',
			entryMinor: 4295,
		};

		expect(tenderReducer(state, { type: 'key', key: 'backspace' })).toMatchObject({
			entryMinor: 429,
			entryDirty: true,
		});
		expect(tenderReducer(state, { type: 'key', key: 'clear' })).toMatchObject({
			entryMinor: 0,
			entryDirty: true,
		});
	});

	it('ignores keypad input outside the amount view', () => {
		expect(tenderReducer(initialTenderState, { type: 'key', key: '5' })).toBe(initialTenderState);
	});

	it('clamps quick-entry amounts and marks them dirty', () => {
		expect(tenderReducer(initialTenderState, { type: 'set-entry', minor: -1 })).toMatchObject({
			entryMinor: 0,
			entryDirty: true,
		});
		expect(
			tenderReducer(initialTenderState, {
				type: 'set-entry',
				minor: MAX_TENDER_MINOR + 1,
			})
		).toMatchObject({ entryMinor: MAX_TENDER_MINOR, entryDirty: true });
	});

	it('moves between tabs, tender selection, split menu, and cancellation', () => {
		const split = tenderReducer(tenderReducer(initialTenderState, { type: 'open-split-menu' }), {
			type: 'set-split-share',
			minor: 2148,
		});
		const picked = tenderReducer(split, {
			type: 'pick-method',
			methodId: 'cash',
			prefillMinor: 2148,
		});
		const cancel = tenderReducer(tenderReducer(picked, { type: 'open-split-menu' }), {
			type: 'request-cancel',
		});

		expect(tenderReducer(initialTenderState, { type: 'set-tab', tab: 'legacy' })).toEqual({
			...initialTenderState,
			tab: 'legacy',
		});
		expect(split).toMatchObject({ splitShareMinor: 2148, splitMenuOpen: false });
		expect(picked).toMatchObject({
			view: 'amount',
			methodId: 'cash',
			entryMinor: 2148,
			entryDirty: false,
			splitShareMinor: null,
			splitMenuOpen: false,
		});
		expect(cancel).toMatchObject({
			view: 'cancel',
			methodId: 'cash',
			entryMinor: 2148,
			splitMenuOpen: false,
		});
		expect(tenderReducer(cancel, { type: 'back' })).toMatchObject({
			view: 'select',
			methodId: null,
			entryMinor: 0,
			entryDirty: false,
		});
	});

	it('clears a split share after recording a tender and resets to the initial state', () => {
		const state = {
			...initialTenderState,
			view: 'amount' as const,
			methodId: 'cash',
			entryMinor: 2148,
			entryDirty: true,
			splitShareMinor: 2148,
		};

		expect(tenderReducer(state, { type: 'tender-recorded' })).toMatchObject({
			view: 'select',
			methodId: null,
			entryMinor: 0,
			entryDirty: false,
			splitShareMinor: null,
		});
		expect(tenderReducer(state, { type: 'reset' })).toBe(initialTenderState);
	});
});

describe('tender money helpers', () => {
	it('caps a cash overtender at the balance and returns the excess as change', () => {
		const applied = appliedMinor(5000, 4295);

		expect(applied).toBe(4295);
		expect(changeMinor(5000, applied, true)).toBe(705);
	});

	it('applies a card partial without change', () => {
		const applied = appliedMinor(2000, 4295);

		expect(applied).toBe(2000);
		expect(changeMinor(2000, applied, false)).toBe(0);
	});

	it('dedupes and sorts rounded quick amounts without duplicating a whole step', () => {
		expect(quickTenderedAmounts(4295, [500, 1000, 5000])).toEqual([4295, 4500, 5000]);
		expect(quickTenderedAmounts(5000, [500, 1000, 5000])).toEqual([5000]);
	});

	it('offers no quick amounts for a zero balance', () => {
		expect(quickTenderedAmounts(0, [500, 1000, 5000])).toEqual([]);
	});

	it('rounds even split shares half-up in minor units', () => {
		expect(evenSplitShareMinor(4295, 2)).toBe(2148);
		expect(evenSplitShareMinor(0, 3)).toBe(0);
		expect(evenSplitShareMinor(4295, 1)).toBe(4295);
	});
});
