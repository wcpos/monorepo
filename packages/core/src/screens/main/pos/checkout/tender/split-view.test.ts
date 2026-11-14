import { paidUnitsMeta, type PaymentRow } from '@wcpos/order-math';

import { rowsSince, type SplitFacts, type SplitView, splitView } from './split-view';

/** A ledger row as `_wcpos_payments` stores it. */
function payment(id: string, amount: string, over: Partial<PaymentRow> = {}): PaymentRow {
	return {
		id,
		source: 'app',
		order_id: 42,
		method_id: 'pos_cash',
		provider: null,
		kind: 'cash',
		capture_mode: 'manual',
		transport: null,
		recorded_offline: false,
		amount,
		currency: 'EUR',
		tendered: null,
		change: null,
		tip: null,
		status: 'captured',
		failure_reason: null,
		refunded_amount: '0.00',
		refunds: [],
		provider_refs: {},
		receipt: {},
		cashier_id: 7,
		store_id: 9,
		created_at_gmt: '2026-09-03T10:00:00.000Z',
		captured_at_gmt: '2026-09-03T10:00:00.000Z',
		updated_at_gmt: '2026-09-03T10:00:00.000Z',
		...over,
	};
}
const card = (id: string, amount: string, over: Partial<PaymentRow> = {}) =>
	payment(id, amount, { method_id: 'pos_card', kind: 'card', ...over });
const titleOf = (id: string) => ({ pos_cash: 'Cash', pos_card: 'Card' })[id] ?? id;

// Scarf 22.00 (one), Socks 6.00 + 0.60 tax (two), a line removed offline, a line known by its POS UUID.
const lineItems = [
	{ id: 1, product_id: 11, name: 'Scarf', quantity: 1, total: '22.00', total_tax: '0.00' },
	{ id: 2, product_id: 12, name: 'Socks', quantity: 2, total: '6.00', total_tax: '0.60' },
	{ id: 3, product_id: null, name: 'Gone', quantity: 1, total: '5.00' },
	{
		id: 4,
		product_id: 14,
		name: 'Belt',
		quantity: 3,
		total: '10.01',
		meta_data: [{ key: '_woocommerce_pos_uuid', value: 'belt-uuid' }],
	},
] as SplitFacts['payload']['line_items'];

const facts = (over: Partial<SplitFacts> = {}, store: Partial<SplitFacts['store']> = {}) =>
	({
		payload: { meta_data: [], line_items: lineItems },
		rows: [],
		dp: 2,
		titleOf,
		plan: null,
		...over,
		store: { allocations: null, picked: {}, splitOn: false, ...store },
	}) satisfies SplitFacts;

describe('splitView', () => {
	it('lists the bill lines a split picks: tax inside, POS UUID first, tombstones gone', () => {
		expect(splitView(facts()).lines).toEqual([
			{ id: 1, name: 'Scarf', quantity: 1, totalMinor: 2200 },
			{ id: 2, name: 'Socks', quantity: 2, totalMinor: 660 },
			{ id: 'belt-uuid', name: 'Belt', quantity: 3, totalMinor: 1001 },
		]);
	});

	it.each<[string, SplitFacts, Partial<SplitView>]>([
		[
			'nothing paid: every unit unpaid',
			facts(),
			{ allocations: {}, paidUnits: {}, unpaidUnits: { 1: 1, 2: 2, 'belt-uuid': 3 } },
		],
		[
			"the order's journaled units count on a reopened sale, with the paying method",
			facts({
				payload: { meta_data: [paidUnitsMeta({ a: { 2: 1 } })], line_items: lineItems },
				rows: [card('a', '3.30')],
			}),
			{
				allocations: { a: { 2: 1 } },
				paidUnits: { 2: { units: 1, methods: ['Card'] } },
				unpaidUnits: { 1: 1, 2: 1, 'belt-uuid': 3 },
			},
		],
		[
			"this till's allocation of a payment wins over the journaled one",
			facts(
				{
					payload: { meta_data: [paidUnitsMeta({ a: { 2: 2 } })], line_items: lineItems },
					rows: [card('a', '3.30'), payment('b', '22.00')],
				},
				{ allocations: { a: { 2: 1 }, b: { 1: 1 } } }
			),
			{
				allocations: { a: { 2: 1 }, b: { 1: 1 } },
				paidUnits: { 1: { units: 1, methods: ['Cash'] }, 2: { units: 1, methods: ['Card'] } },
				unpaidUnits: { 1: 0, 2: 1, 'belt-uuid': 3 },
			},
		],
		[
			'a cancelled payment keeps its allocation but pays for nothing; a pending one holds its units',
			facts(
				{
					rows: [
						card('void', '3.30', { status: 'voided' }),
						card('held', '6.60', { status: 'pending' }),
					],
				},
				{ allocations: { void: { 2: 1 }, held: { 2: 2, 'belt-uuid': 1 } } }
			),
			{
				paidUnits: {
					2: { units: 2, methods: ['Card'] },
					'belt-uuid': { units: 1, methods: ['Card'] },
				},
				unpaidUnits: { 1: 1, 2: 0, 'belt-uuid': 2 },
			},
		],
		[
			'a paid count past the quantity never reads as negative unpaid units',
			facts({ rows: [payment('a', '22.00')] }, { allocations: { a: { 1: 2 } } }),
			{ unpaidUnits: { 1: 0, 2: 2, 'belt-uuid': 3 } },
		],
	])('%s', (_name, input, expected) => {
		expect(splitView(input)).toMatchObject(expected);
	});

	it('hands the store picks and the Split chip through as they are', () => {
		const picked = { 1: 1 };
		const view = splitView(facts({}, { picked, splitOn: true }));
		expect(view.picked).toBe(picked);
		expect(view.splitOn).toBe(true);
	});

	const items = { kind: 'items', units: { 2: 2 }, firstMinor: 660, ways: 2, from: 1 } as const;
	it.each<[string, SplitFacts, SplitView['legUnits']]>([
		['no picks and no plan: none', facts(), null],
		['the picks are this payment', facts({ plan: items }, { picked: { 1: 1 } }), { 1: 1 }],
		["an item group's first leg carries the group's units", facts({ plan: items }), { 2: 2 }],
		[
			'a later leg of the group carries none: the units count once',
			facts(
				{ plan: items, rows: [payment('x', '5.00'), card('a', '3.30')] },
				{ allocations: { a: { 2: 2 } } }
			),
			null,
		],
		[
			'a cancelled first leg leaves the units to the next',
			facts(
				{ plan: items, rows: [payment('x', '5.00'), card('a', '3.30', { status: 'voided' })] },
				{ allocations: { a: { 2: 2 } } }
			),
			{ 2: 2 },
		],
		[
			'an allocated payment before the plan is not the group',
			facts({ plan: items, rows: [payment('x', '5.00')] }, { allocations: { x: { 1: 1 } } }),
			{ 2: 2 },
		],
	])('this leg’s units: %s', (_name, input, expected) => {
		expect(splitView(input).legUnits).toEqual(expected);
	});
});

describe('rowsSince', () => {
	const rows = [
		payment('before', '10.00'),
		card('failed', '23.00', { status: 'failed' }),
		card('a', '23.00'),
		card('hold', '15.00', { status: 'authorized', recorded_offline: true }),
		payment('b', '15.50'),
	];
	it.each<[string, Parameters<typeof rowsSince>[0], ReturnType<typeof rowsSince>]>([
		['no plan takes no legs', null, []],
		[
			'from the plan on, only the money derive() counts (no failure, no hold)',
			{ from: 1 },
			[
				{ minor: 2300, title: 'Card' },
				{ minor: 1550, title: 'Cash' },
			],
		],
		['a plan made after every row has taken none', { from: rows.length }, []],
	])('%s', (_name, plan, expected) => {
		expect(rowsSince(plan, rows, 2, titleOf)).toEqual(expected);
	});

	it('is the legs the split view hands the figures', () => {
		const plan = { kind: 'even', ways: 3, from: 1 } as const;
		expect(splitView(facts({ rows, plan })).rowsSinceFrom).toEqual(
			rowsSince(plan, rows, 2, titleOf)
		);
	});
});
