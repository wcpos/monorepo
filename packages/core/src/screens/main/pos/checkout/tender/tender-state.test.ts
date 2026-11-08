import {
	activePlan,
	appliedMinor,
	changeMinor,
	evenSplitShareMinor,
	heroForPicked,
	initialTenderState,
	initTenderState,
	MAX_TENDER_MINOR,
	paidUnitsByLine,
	percentOfMinor,
	planLegs,
	quickTenderedAmounts,
	tenderReducer,
	unitsMinor,
} from './tender-state';

import type { TenderAction, TenderState } from './tender-state';

describe('split V1 money rules', () => {
	it.each([
		[2000, 4, 1, 500],
		[2000, 4, 4, 2000],
		[1000, 3, 1, 333],
		[1000, 3, 2, 666],
		[1000, 3, 3, 1000],
		[1000, 3, -1, 0],
		[1000, 3, 4, 1000],
		[1000, 0, 1, 0],
		[1000, -1, 1, 0],
	])('prices %i minor / %i quantity × %i units as %i', (total, quantity, units, want) => {
		expect(unitsMinor(total, quantity, units)).toBe(want);
	});
	it.each([
		[18250, 25, 4563],
		[18250, -1, 0],
		[18250, 120, 18250],
		[0, 25, 0],
	])('rounds and clamps %i minor × %i percent to %i', (balance, percent, want) => {
		expect(percentOfMinor(balance, percent)).toBe(want);
	});
	it.each([
		[true, 3202],
		[false, 3200],
	])('carries rounding only on the last picks (%s)', (all, want) => {
		expect(heroForPicked(3200, 3202, all)).toBe(want);
	});
	it('plans a first amount followed by three equal shares, then replans short legs', () => {
		const plan = { kind: 'fixed' as const, firstMinor: 2000, thenWays: 3, title: null, from: 0 };
		const figures = planLegs(plan, [], 18250);
		expect(figures.legs.map(({ minor }) => minor)).toEqual([2000, 5417, 5417, 5416]);
		expect(figures.label.ways).toBe(4);
		expect(
			planLegs(plan, [{ minor: 2000, title: 'Cash' }], 16250).legs.map(({ minor }) => minor)
		).toEqual([2000, 5417, 5417, 5416]);
		expect(planLegs(plan, [{ minor: 1000, title: 'Cash' }], 17250).thisPaymentMinor).toBe(5750);
		expect(activePlan(plan, 3, 5416)).toBe(plan);
		expect(activePlan(plan, 4, 1)).toBeNull();
	});
	it('sums only live allocations and deduplicates methods in ledger order', () => {
		expect(
			paidUnitsByLine(
				{
					second: { lemonade: 2 },
					gone: { lemonade: 4 },
					first: { lemonade: 1 },
					card: { burger: 1, lemonade: 1 },
				},
				[
					{ id: 'first', title: 'Cash' },
					{ id: 'second', title: 'Cash' },
					{ id: 'unallocated', title: 'Other' },
				]
			)
		).toEqual({ lemonade: { units: 3, methods: ['Cash'] } });
		expect(
			paidUnitsByLine({ b: { lemonade: 1 }, a: { lemonade: 2 } }, [
				{ id: 'a', title: 'Card' },
				{ id: 'b', title: 'Cash' },
			])
		).toEqual({ lemonade: { units: 3, methods: ['Card', 'Cash'] } });
	});
});

describe('split V1 entry', () => {
	const fresh = {
		picked: {},
		extraMinor: null,
		entryMode: 'money',
		pickerOpen: false,
		doneOpen: false,
	};
	const state: TenderState = {
		...initialTenderState,
		view: 'amount',
		entryMinor: 500,
		picked: { lemonade: 1 },
	};
	it('starts empty and picks, replaces and removes units without changing other lines', () => {
		expect(initialTenderState).toMatchObject(fresh);
		const picked = tenderReducer(state, { type: 'pick-units', lineId: 42, units: 2 });
		expect(picked.picked).toEqual({ lemonade: 1, 42: 2 });
		expect(tenderReducer(picked, { type: 'pick-units', lineId: 42, units: 3 }).picked[42]).toBe(3);
		for (const units of [0, -1]) {
			expect(tenderReducer(picked, { type: 'pick-units', lineId: 42, units }).picked).toEqual({
				lemonade: 1,
			});
		}
		expect(state.picked).toEqual({ lemonade: 1 });
	});
	it('arms only in amount view and edits the extra without changing the picked subtotal', () => {
		for (const view of ['select', 'cancel'] as const) {
			const other = { ...state, view };
			expect(tenderReducer(other, { type: 'arm-extra' })).toBe(other);
		}
		const armed = tenderReducer({ ...state, entryDirty: true }, { type: 'arm-extra' });
		expect(armed).toMatchObject({ extraMinor: 0, entryMinor: 0, entryDirty: false });
		const first = tenderReducer({ ...armed, entryMinor: 500 }, { type: 'key', key: '5' });
		const second = tenderReducer(first, { type: 'key', key: '0' });
		expect(second).toMatchObject({ extraMinor: 50, entryMinor: 500, entryDirty: true });
		expect(tenderReducer(second, { type: 'key', key: 'backspace' })).toMatchObject({
			extraMinor: 5,
			entryMinor: 500,
		});
		expect(tenderReducer(second, { type: 'key', key: 'clear' })).toMatchObject({
			extraMinor: 0,
			entryMinor: 500,
		});
		const capped = tenderReducer(second, { type: 'set-entry', minor: MAX_TENDER_MINOR + 1 });
		expect(capped).toMatchObject({ extraMinor: MAX_TENDER_MINOR, entryMinor: 500 });
		expect(tenderReducer(capped, { type: 'key', key: '9' })).toBe(capped);
		expect(tenderReducer(second, { type: 'set-entry', minor: -1 })).toMatchObject({
			extraMinor: 0,
			entryMinor: 500,
		});
	});
	it('switches entry modes and toggles the disclosures', () => {
		const percent = tenderReducer(
			{ ...state, entryDirty: true },
			{ type: 'set-entry-mode', mode: 'percent' }
		);
		expect(percent).toMatchObject({ entryMode: 'percent', entryMinor: 0, entryDirty: false });
		expect(tenderReducer(percent, { type: 'set-entry-mode', mode: 'money' }).entryMode).toBe(
			'money'
		);
		for (const type of ['toggle-picker', 'toggle-done'] as const) {
			const key = type === 'toggle-picker' ? 'pickerOpen' : 'doneOpen';
			const open = tenderReducer(state, { type });
			expect(open[key]).toBe(true);
			expect(tenderReducer(open, { type })[key]).toBe(false);
		}
	});
	it.each<TenderAction>([
		{ type: 'tender-started' },
		{ type: 'set-plan', plan: { kind: 'even', ways: 2, from: 0 }, balanceMinor: 1000 },
		{ type: 'clear-plan', balanceMinor: 1000 },
		{ type: 'arm-custom' },
		{ type: 'back' },
		{ type: 'reset' },
		{ type: 'tender-recorded', rowsSinceFrom: [], balanceMinor: 1000 },
	])('clears the new entry state on $type', (action) => {
		const next = tenderReducer(
			{ ...state, extraMinor: 100, entryMode: 'percent', pickerOpen: true, doneOpen: true },
			action
		);
		expect(next).toMatchObject({
			...fresh,
			...(action.type === 'tender-recorded' ? { pickerOpen: true, doneOpen: true } : {}),
		});
	});
});

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

it('turns Split on, sets, clears and arms plans', () => {
	const state = { ...initialTenderState, view: 'amount' as const, linesPaidBy: { 1: ['Cash'] } };
	const on = tenderReducer(state, { type: 'split-on' });
	expect(on.splitOn).toBe(true);
	expect(tenderReducer(on, { type: 'set-tab', tab: 'legacy' })).toMatchObject({
		tab: 'legacy',
		splitOn: true,
	});
	const picked = tenderReducer(on, { type: 'pick-units', lineId: 2, units: 1 });
	const set = tenderReducer(picked, {
		type: 'set-plan',
		plan: { kind: 'even', ways: 3, from: 1 },
		balanceMinor: 1000,
	});
	expect(set).toMatchObject({ splitOn: true, picked: {}, entryMinor: 333, entryDirty: false });
	// The Split chip off: the plan and the picks go, nothing taken is touched.
	expect(tenderReducer(set, { type: 'clear-plan', balanceMinor: 1000 })).toMatchObject({
		plan: null,
		splitOn: false,
		entryMinor: 1000,
		linesPaidBy: { 1: ['Cash'] },
	});
	// Change split keeps Split on, so the even row comes back over what is left.
	expect(
		tenderReducer(set, { type: 'clear-plan', balanceMinor: 1000, keepSplit: true })
	).toMatchObject({ plan: null, splitOn: true, entryMinor: 1000 });
	expect(tenderReducer(set, { type: 'arm-custom' })).toMatchObject({
		plan: null,
		splitOn: false,
		entryMinor: 0,
		entryDirty: false,
	});
	for (const type of ['back', 'reset'] as const)
		expect(tenderReducer(set, { type }).splitOn).toBe(false);
});

it('keeps Split on across payments until the balance is paid', () => {
	const on = tenderReducer(initialTenderState, { type: 'split-on' });
	const recorded = (balanceMinor: number) =>
		tenderReducer(on, { type: 'tender-recorded', rowsSinceFrom: [], balanceMinor });
	expect(recorded(500).splitOn).toBe(true);
	expect(recorded(0).splitOn).toBe(false);
});

it('opens and closes the share choice, which a new payment or a plan closes', () => {
	const picked = tenderReducer(
		{ ...initialTenderState, view: 'amount' },
		{ type: 'pick-units', lineId: 'a', units: 2 }
	);
	const open = tenderReducer(picked, { type: 'toggle-share' });
	expect(open.shareOpen).toBe(true);
	expect(tenderReducer(open, { type: 'toggle-share' }).shareOpen).toBe(false);
	expect(tenderReducer(open, { type: 'tender-started' }).shareOpen).toBe(false);
	expect(
		tenderReducer(open, {
			type: 'set-plan',
			plan: { kind: 'items', lineIds: ['a'], units: { a: 2 }, firstMinor: 900, ways: 3, from: 0 },
			balanceMinor: 1000,
		})
	).toMatchObject({ shareOpen: false, picked: {}, entryMinor: 300 });
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
