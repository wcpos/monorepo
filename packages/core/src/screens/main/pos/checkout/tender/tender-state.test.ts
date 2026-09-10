import {
	appliedMinor,
	changeMinor,
	evenSplitShareMinor,
	initialTenderState,
	initTenderState,
	MAX_TENDER_MINOR,
	quickTenderedAmounts,
	splitPlanLegs,
	tenderReducer,
} from './tender-state';

describe('tenderReducer', () => {
	it('replaces the pre-fill on the first digit, then shifts later digits in from the right', () => {
		const picked = tenderReducer(initialTenderState, {
			type: 'pick-method',
			readerId: null,
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
			type: 'set-split-plan',
			ways: 2,
			shareMinor: 2148,
		});
		const picked = tenderReducer(split, {
			type: 'pick-method',
			readerId: null,
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
		expect(split).toMatchObject({
			splitPlan: { ways: 2, shareMinor: 2148, taken: 0 },
			splitMenuOpen: false,
		});
		expect(picked).toMatchObject({
			view: 'amount',
			methodId: 'cash',
			entryMinor: 2148,
			entryDirty: false,
			splitPlan: { ways: 2, shareMinor: 2148, taken: 0 },
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

	it('advances a split plan after recording a tender and resets to the initial state', () => {
		const state = {
			...initialTenderState,
			view: 'amount' as const,
			methodId: 'cash',
			entryMinor: 2148,
			entryDirty: true,
			splitPlan: { ways: 2, shareMinor: 2148, taken: 0 },
		};

		expect(tenderReducer(state, { type: 'tender-recorded' })).toMatchObject({
			view: 'select',
			methodId: null,
			entryMinor: 0,
			entryDirty: false,
			splitPlan: { ways: 2, shareMinor: 2148, taken: 1 },
			customAmount: false,
		});
		expect(tenderReducer(state, { type: 'reset' })).toBe(initialTenderState);
	});
});

describe('initTenderState', () => {
	it('starts from scratch without a stored method', () => {
		expect(initTenderState({ methodId: null, balanceMinor: 1234 })).toBe(initialTenderState);
	});
	it('reopens the keypad for a stored method with the balance prefilled', () => {
		expect(initTenderState({ methodId: 'pos_cash', balanceMinor: 1234 })).toEqual({
			...initialTenderState,
			view: 'amount',
			methodId: 'pos_cash',
			entryMinor: 1234,
		});
	});
});

describe('splitPlanLegs fallback', () => {
	it('shows the planned share for a taken leg whose row is not captured yet', () => {
		expect(splitPlanLegs({ ways: 3, shareMinor: 1000, taken: 1 }, [], 2000)).toEqual([
			{ minor: 1000, state: 'done' },
			{ minor: 1000, state: 'now' },
			{ minor: 1000, state: 'todo' },
		]);
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

it('carries and changes the reader; starting clears entry but preserves the split plan', () => {
	const picked = tenderReducer(initialTenderState, {
		type: 'pick-method',
		methodId: 'terminal',
		prefillMinor: 500,
		readerId: 'a',
	});
	expect(picked.readerId).toBe('a');
	const changed = tenderReducer(picked, { type: 'pick-reader', readerId: 'b' });
	expect(changed.readerId).toBe('b');
	const started = tenderReducer(
		{ ...changed, splitPlan: { ways: 2, shareMinor: 500, taken: 0 } },
		{ type: 'tender-started' }
	);
	expect(started).toMatchObject({
		view: 'select',
		methodId: null,
		readerId: null,
		entryMinor: 0,
		splitPlan: { ways: 2, shareMinor: 500, taken: 0 },
	});
	for (const type of ['back', 'tender-recorded', 'reset'] as const) {
		expect(tenderReducer(changed, { type }).readerId).toBeNull();
	}
});

it.each(['select', 'amount'] as const)('sets, arms and clears a split in %s', (view) => {
	const state = {
		...initialTenderState,
		view,
		entryMinor: 999,
		entryDirty: true,
		splitMenuOpen: true,
	};
	const plan = tenderReducer(state, { type: 'set-split-plan', ways: 3, shareMinor: 333 });
	expect(plan).toMatchObject({
		splitPlan: { ways: 3, shareMinor: 333, taken: 0 },
		customAmount: false,
		splitMenuOpen: false,
		entryMinor: view === 'amount' ? 333 : 999,
		entryDirty: view !== 'amount',
	});
	const custom = tenderReducer(plan, { type: 'arm-custom-amount' });
	expect(custom).toMatchObject({
		splitPlan: null,
		customAmount: true,
		splitMenuOpen: false,
		entryMinor: view === 'amount' ? 0 : 999,
		entryDirty: view !== 'amount',
	});
	expect(tenderReducer(custom, { type: 'clear-split', balanceMinor: 1000 })).toMatchObject({
		splitPlan: null,
		customAmount: false,
		splitMenuOpen: false,
		entryMinor: view === 'amount' ? 1000 : 999,
		entryDirty: view !== 'amount',
	});
	expect(tenderReducer(custom, { type: 'tender-recorded' }).customAmount).toBe(false);
	for (const type of ['back', 'tender-started'] as const) {
		expect(tenderReducer(plan, { type }).splitPlan).toEqual(plan.splitPlan);
		expect(tenderReducer(custom, { type }).customAmount).toBe(true);
	}
	expect(
		tenderReducer(
			{ ...plan, splitPlan: { ways: 3, shareMinor: 333, taken: 2 } },
			{ type: 'tender-recorded' }
		).splitPlan
	).toBeNull();
});
it('builds plan legs from actual recorded amounts and leaves rounding to the last leg', () => {
	expect(splitPlanLegs({ ways: 2, shareMinor: 500, taken: 0 }, [], 1000)).toEqual([
		{ minor: 500, state: 'now' },
		{ minor: 500, state: 'todo' },
	]);
	expect(splitPlanLegs({ ways: 3, shareMinor: 333, taken: 1 }, [330], 670)).toEqual([
		{ minor: 330, state: 'done' },
		{ minor: 333, state: 'now' },
		{ minor: 337, state: 'todo' },
	]);
	expect(splitPlanLegs({ ways: 2, shareMinor: 500, taken: 2 }, [500, 501], 0)).toEqual([
		{ minor: 500, state: 'done' },
		{ minor: 501, state: 'done' },
	]);
	expect(splitPlanLegs({ ways: 2, shareMinor: 500, taken: 3 }, [400, 500, 501], 0)).toEqual([
		{ minor: 500, state: 'done' },
		{ minor: 501, state: 'done' },
	]);
});
it('keeps the chosen transport with the keypad and clears it when going back', () => {
	const chosen = tenderReducer(initialTenderState, {
		type: 'pick-transport',
		transport: 'tap_to_pay',
	});
	expect(chosen.transport).toBe('tap_to_pay');
	expect(tenderReducer(chosen, { type: 'back' }).transport).toBeNull();
});
