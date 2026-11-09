import type { PaymentMethodDescriptor, PaymentRow } from '@wcpos/order-math';

import { type TenderFacts, type TenderFigures, tenderFigures } from './tender-figures';
import { initialTenderState } from './tender-state';

type Method = NonNullable<TenderFacts['method']>;
const cash: Method = {
	capture: { mode: 'manual', provider: null, hardware: null, webview_available: false },
	capabilities: {
		amount: { partial: true },
		change: true,
		refunds: { via: 'manual', partial: true },
		tips: 'none',
		offline: 'record',
		void: false,
	},
	defaults: { order_status: 'completed', rounding: null, open_drawer: true },
} as Pick<PaymentMethodDescriptor, 'capture' | 'capabilities' | 'defaults'>;
const card: Method = { ...cash, capabilities: { ...cash.capabilities, change: false } };
const roundedCash: Method = {
	...cash,
	defaults: { ...cash.defaults, rounding: { increment: '0.05', mode: 'nearest' } },
};
const wholeOrderGateway: Method = {
	...card,
	capture: { ...cash.capture, mode: 'gateway' },
	capabilities: { ...card.capabilities, amount: { partial: false } },
};

const row = (id: string, amount: string, status: PaymentRow['status'] = 'captured') =>
	({ id, method_id: 'pos_cash', amount, status }) as PaymentRow;

const facts = (
	over: Partial<Omit<TenderFacts, 'state'>> = {},
	state: Partial<TenderFacts['state']> = {}
): TenderFacts => ({
	dp: 2,
	balanceMinor: 9295,
	rows: [],
	titleOf: (id) => (id === 'pos_cash' ? 'Cash' : id),
	method: cash,
	lines: [],
	picked: {},
	paidUnits: {},
	...over,
	state: { ...initialTenderState, view: 'amount', ...state },
});

describe('tenderFigures', () => {
	it.each<[string, TenderFacts, Partial<TenderFigures>]>([
		[
			'cash typed under the balance is a part payment',
			facts({}, { entryMinor: 2000, entryDirty: true }),
			{
				entryAppliedMinor: 2000,
				entryChangeMinor: 0,
				afterThisPaymentMinor: 7295,
				shownMinor: 2000,
				typed: true,
				restMinor: 7295,
				quickAmountsMinor: [2000, 5000],
			},
		],
		[
			'cash tendered over the balance hands back change',
			facts({}, { entryMinor: 10000, entryDirty: true }),
			{ entryAppliedMinor: 9295, entryChangeMinor: 705, afterThisPaymentMinor: 0, noChange: false },
		],
		[
			'a method that gives no change refuses an over-tender',
			facts({ method: card }, { entryMinor: 10000, entryDirty: true }),
			{ entryAppliedMinor: 9295, entryChangeMinor: 0, noChange: true, quickAmountsMinor: [] },
		],
		[
			'an untouched prefill under cash rounding is the rounded due',
			facts({ balanceMinor: 1003, method: roundedCash }, { entryMinor: 1003 }),
			{
				roundedDueMinor: 1005,
				roundingMinor: 2,
				entryMinor: 1005,
				entryAppliedMinor: 1005,
				dueMinor: 1005,
				exactMinor: 1005,
				afterThisPaymentMinor: 0,
			},
		],
		[
			'a partial cash entry is not rounded, but Exact still offers the rounded due',
			facts({ balanceMinor: 1003, method: roundedCash }, { entryMinor: 500, entryDirty: true }),
			{ roundingMinor: 0, entryAppliedMinor: 500, dueMinor: 1003, exactMinor: 1005 },
		],
		[
			'a gateway that runs the whole order applies the balance and drops the plan',
			facts(
				{ method: wholeOrderGateway },
				{ entryMinor: 100, entryDirty: true, plan: { kind: 'even', ways: 2, from: 0 } }
			),
			{ fixedAmount: true, plan: null, legs: [], entryAppliedMinor: 9295, shownMinor: 9295 },
		],
		[
			'a no-change method takes what was typed past the planned share, capped at the balance',
			facts(
				{ balanceMinor: 2000, method: card },
				{ entryMinor: 1500, entryDirty: true, plan: { kind: 'even', ways: 2, from: 0 } }
			),
			{ thisPaymentMinor: 1000, entryAppliedMinor: 1500, exactMinor: 1000 },
		],
		[
			'cash past the planned share is change, not a bigger leg',
			facts(
				{ balanceMinor: 2000 },
				{ entryMinor: 1500, entryDirty: true, plan: { kind: 'even', ways: 2, from: 0 } }
			),
			{ thisPaymentMinor: 1000, entryAppliedMinor: 1000, entryChangeMinor: 500 },
		],
		[
			'percent entry is a share of the balance',
			facts({ balanceMinor: 18250 }, { entryMode: 'percent', entryMinor: 25 }),
			{ percentMinor: 4563, entryAppliedMinor: 4563, shownMinor: 4563, noChange: false },
		],
		[
			'picks are priced past the paid units, the last unit carrying the remainder cents',
			facts(
				{
					balanceMinor: 1001,
					lines: [{ id: 'l1', quantity: 3, totalMinor: 1001 }],
					picked: { l1: 2 },
					paidUnits: { l1: { units: 1 } },
				},
				{ entryMinor: 0 }
			),
			{
				pickedMinor: 668,
				allUnpaidPicked: false,
				entryMinor: 668,
				unpaidUnits: { l1: 2 },
				shareMinor: 668,
			},
		],
		[
			'picks plus an amount are shared together',
			facts(
				{ lines: [{ id: 'l1', quantity: 4, totalMinor: 2000 }], picked: { l1: 4 } },
				{ extraMinor: 300 }
			),
			{ pickedMinor: 2000, allUnpaidPicked: false, entryMinor: 2300, shareMinor: 2300 },
		],
	])('%s', (_name, input, expected) => {
		expect(tenderFigures(input)).toMatchObject(expected);
	});

	it('picking every unpaid unit makes the balance the entry, stray cents included', () => {
		const figures = tenderFigures(
			facts({ balanceMinor: 1001, lines: [{ id: 'l1', quantity: 3, totalMinor: 1001 }] }, {})
		);
		expect(figures.allUnpaidPicked).toBe(false);
		const all = tenderFigures({
			...facts({ balanceMinor: 1002, lines: [{ id: 'l1', quantity: 3, totalMinor: 1001 }] }),
			picked: { l1: 3 },
		});
		expect(all).toMatchObject({ pickedMinor: 1001, allUnpaidPicked: true, entryMinor: 1002 });
	});

	// Payments are numbered across the bill (ruled 2026-11-08): the rows counted before the plan
	// plus the plan's own ways, the formula the hook's label and the commit journal both use.
	it.each<[string, TenderFacts, Partial<TenderFigures>]>([
		[
			'an even plan',
			facts({ balanceMinor: 900 }, { plan: { kind: 'even', ways: 3, from: 0 } }),
			{ n: 1, ways: 3, toCome: 2, thisPaymentMinor: 300 },
		],
		[
			'a fixed first payment then three ways, after two taken and a failed one',
			facts(
				{
					balanceMinor: 14450,
					rows: [row('x', '23.00', 'failed'), row('a', '23.00'), row('b', '15.00')],
				},
				{ plan: { kind: 'fixed', firstMinor: 2000, title: null, thenWays: 3, from: 3 } }
			),
			{ n: 3, ways: 6, toCome: 3, thisPaymentMinor: 2000 },
		],
		[
			"the fixed plan's second leg",
			facts(
				{ balanceMinor: 12450, rows: [row('a', '23.00'), row('b', '15.00'), row('c', '20.00')] },
				{ plan: { kind: 'fixed', firstMinor: 2000, title: null, thenWays: 3, from: 2 } }
			),
			{ n: 4, ways: 6, toCome: 2, thisPaymentMinor: 4150 },
		],
		[
			'an items group shared two ways',
			facts(
				{ balanceMinor: 5000 },
				{ plan: { kind: 'items', units: { l1: 1 }, firstMinor: 1000, ways: 2, from: 0 } }
			),
			{ n: 1, ways: 2, shared: true, groupDone: false, thisPaymentMinor: 500 },
		],
		[
			'an items group already paid',
			facts(
				{ balanceMinor: 4000, rows: [row('a', '10.00')] },
				{ plan: { kind: 'items', units: { l1: 1 }, firstMinor: 1000, ways: 1, from: 0 } }
			),
			{ n: 2, ways: 2, shared: false, groupDone: true },
		],
	])('numbers %s', (_name, input, expected) => {
		expect(tenderFigures(input)).toMatchObject(expected);
	});

	// The one place the pane's own formula differed: with no method open (the select view, as
	// after Back from Cancel payment) the pane counted the empty entry as this payment, so the
	// strip read "0.00, then the balance". This payment is the planned share, as the hook's
	// quick amounts and after-this-payment figure always had it.
	it('in the select view, this payment is the planned share and nothing is left after it', () => {
		const input = facts(
			{ balanceMinor: 5000, rows: [row('a', '42.95')], method: null },
			{ view: 'select', entryMinor: 0 }
		);
		const figures = tenderFigures(input);
		expect(figures).toMatchObject({ nowMinor: 5000, afterThisPaymentMinor: 0, shownMinor: 5000 });
		const oldPaneLeft = input.balanceMinor + figures.roundingMinor - figures.entryAppliedMinor;
		expect(oldPaneLeft).toBe(5000);
	});
});
