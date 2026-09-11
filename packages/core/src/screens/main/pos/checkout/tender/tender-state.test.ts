import {
	activePlan,
	appliedMinor,
	changeMinor,
	evenSplitShareMinor,
	initialTenderState,
	initTenderState,
	MAX_TENDER_MINOR,
	planLegs,
	quickTenderedAmounts,
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
		{ ...changed, plan: { kind: 'even', ways: 2, from: 0 } },
		{ type: 'tender-started' }
	);
	// Starting a leg keeps the method and reader for the next one; only the entry clears.
	expect(started).toMatchObject({
		view: 'amount',
		methodId: 'terminal',
		readerId: 'b',
		entryMinor: 0,
		entryDirty: false,
		plan: { kind: 'even', ways: 2, from: 0 },
	});
	for (const type of ['back', 'reset'] as const) {
		expect(tenderReducer(changed, { type }).readerId).toBeNull();
	}
	// A recorded leg keeps the method and reader for the next leg.
	expect(
		tenderReducer(changed, { type: 'tender-recorded', rowsSinceFrom: [], balanceMinor: 1000 })
			.readerId
	).toBe(changed.readerId);
});

it('keeps the chosen transport with the keypad and clears it when going back', () => {
	const chosen = tenderReducer(initialTenderState, {
		type: 'pick-transport',
		transport: 'tap_to_pay',
	});
	expect(chosen.transport).toBe('tap_to_pay');
	expect(tenderReducer(chosen, { type: 'back' }).transport).toBeNull();
});

it('opens tabs, toggles unpaid lines, sets, clears and arms plans', () => {
	const state = { ...initialTenderState, view: 'amount' as const, linesPaidBy: { 1: ['Cash'] } };
	const open = tenderReducer(state, { type: 'open-split' });
	expect(open.splitView).toBe(true);
	expect(tenderReducer(open, { type: 'set-tab', tab: 'legacy' })).toMatchObject({
		tab: 'legacy',
		splitView: false,
	});
	const tab = tenderReducer(open, { type: 'set-split-tab', tab: 'item' });
	expect(tab.splitTab).toBe('item');
	expect(tenderReducer(tab, { type: 'toggle-split-line', lineId: 1 })).toBe(tab);
	const picked = tenderReducer(tab, { type: 'toggle-split-line', lineId: 2 });
	expect(picked.pickedLineIds).toEqual([2]);
	expect(tenderReducer(picked, { type: 'toggle-split-line', lineId: 2 }).pickedLineIds).toEqual([]);
	const set = tenderReducer(picked, {
		type: 'set-plan',
		plan: { kind: 'even', ways: 3, from: 1 },
		balanceMinor: 1000,
	});
	expect(set).toMatchObject({
		splitView: false,
		pickedLineIds: [],
		entryMinor: 333,
		entryDirty: false,
	});
	expect(tenderReducer(set, { type: 'clear-plan', balanceMinor: 1000 })).toMatchObject({
		plan: null,
		entryMinor: 1000,
	});
	expect(tenderReducer(set, { type: 'arm-custom' })).toMatchObject({
		plan: null,
		splitView: false,
		entryMinor: 0,
		entryDirty: false,
	});
	expect(tenderReducer(open, { type: 'close-split' }).splitView).toBe(false);
});

it('derives even shares again after a short leg, with the rounding on the last', () => {
	const plan = { kind: 'even' as const, ways: 3, from: 0 };
	expect(planLegs(plan, [], 1000).legs.map((l) => l.minor)).toEqual([333, 333, 334]);
	expect(planLegs(plan, [{ minor: 100, title: 'Cash' }], 900)).toMatchObject({
		thisPaymentMinor: 450,
		label: { n: 2, ways: 3 },
		legs: [
			{ minor: 100, state: 'done', title: 'Cash' },
			{ minor: 450, state: 'now' },
			{ minor: 450, state: 'todo' },
		],
	});
	expect(activePlan(plan, 3, 1)).toBeNull();
	expect(activePlan(plan, 0, 0)).toBeNull();
});

it('derives a fixed first payment and then the entire rest', () => {
	const plan = { kind: 'fixed' as const, firstMinor: 250, title: '25 %', from: 0 };
	expect(planLegs(plan, [], 1000)).toMatchObject({
		thisPaymentMinor: 250,
		label: { n: 1, ways: 2, title: '25 %' },
	});
	expect(planLegs(plan, [], 100).thisPaymentMinor).toBe(100);
	expect(planLegs(plan, [{ minor: 100, title: 'Card' }], 900)).toMatchObject({
		thisPaymentMinor: 900,
		label: { n: 2, ways: 2, title: null },
	});
	expect(activePlan(plan, 2, 10)).toBeNull();
});

it('loops item groups, preserves their paying methods, and only marks covered groups', () => {
	const plan = { kind: 'items' as const, lineIds: [1, 2], firstMinor: 1000, ways: 3, from: 0 };
	const rows = [{ minor: 100, title: 'Card' }];
	expect(planLegs(plan, rows, 1500).legs.map((l) => [l.minor, l.state])).toEqual([
		[100, 'done'],
		[450, 'now'],
		[450, 'todo'],
		[600, 'rest'],
	]);
	const state = { ...initialTenderState, plan };
	const record = (amounts: number[]) =>
		tenderReducer(state, {
			type: 'tender-recorded',
			balanceMinor: 1500 - amounts.reduce((sum, a) => sum + a, 0),
			rowsSinceFrom: amounts.map((amountMinor) => ({
				amountMinor,
				title: amountMinor === 100 ? 'Card' : 'SumUp',
			})),
		});
	expect(record([100, 450]).linesPaidBy).toEqual({});
	const done = record([100, 450, 450]);
	expect(done.plan).toEqual(plan);
	expect(done.linesPaidBy).toEqual({ 1: ['Card', 'SumUp'], 2: ['Card', 'SumUp'] });
	const legs = planLegs(
		plan,
		[...rows, { minor: 450, title: 'SumUp' }, { minor: 450, title: 'SumUp' }],
		600
	);
	expect(legs).toMatchObject({ thisPaymentMinor: 600, label: { rest: true } });
	expect(legs.legs.at(-1)).toMatchObject({ minor: 600, state: 'now' });
	expect(activePlan(plan, 3, 600)).toBe(plan);
	const next = tenderReducer(done, {
		type: 'set-plan',
		plan: { ...plan, from: 3, lineIds: [3], firstMinor: 600, ways: 1 },
		balanceMinor: 600,
	});
	expect(next.linesPaidBy).toEqual(done.linesPaidBy);
	expect(planLegs(plan, [...rows, ...rows, ...rows], 1300).thisPaymentMinor).toBe(700);
});
