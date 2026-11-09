import {
	type MetaDataEntry,
	type PaymentRow,
	readLedger,
	readPaidUnits,
	withLedger,
} from '@wcpos/order-math';
import type { PayloadChanges } from '@wcpos/query/mutations';

import {
	getCheckoutModeSnapshot,
	pickUnits,
	resetCheckoutMode,
	setAllocations,
	setPickedUnits,
	setTenderPlan,
} from '../checkout-mode';
import { restoredPlan, splitCommands, type SplitDeps } from './split-module';

import type { TenderPlan } from './tender-state';

const mockWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	...jest.requireActual('@wcpos/utils/logger'),
	getLogger: () => ({
		warn: (...args: unknown[]) => mockWarn(...args),
		info: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}),
}));

/** A ledger row as `_wcpos_payments` stores it. */
function payment(over: Partial<PaymentRow> = {}): PaymentRow {
	return {
		id: 'payment-1',
		source: 'app',
		order_id: 42,
		method_id: 'pos_cash',
		provider: null,
		kind: 'cash',
		capture_mode: 'manual',
		transport: null,
		recorded_offline: false,
		amount: '50.00',
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
const titleOf = (id: string) => ({ pos_cash: 'Cash', pos_card: 'Card' })[id] ?? id;

/** The order record: the payload the store holds, read at write time. */
let payload: { total: string; meta_data: MetaDataEntry[] };
const order = { uuid: 'order-1', getLatest: () => ({ payload }) } as unknown as SplitDeps['order'];
/** The resolver write door: the changes resolve against the payload as it is when the write runs. */
const write = jest.fn(async (changes: PayloadChanges) => {
	const resolved = changes(payload) as { meta_data?: MetaDataEntry[] };
	if (resolved.meta_data) payload = { ...payload, meta_data: resolved.meta_data };
});
const dispatch = jest.fn();
let stamps: SplitDeps['stamps'];

function commands(state: Partial<SplitDeps['state']> = {}) {
	return splitCommands({
		order,
		write,
		dispatch,
		state: { plan: null, entryDirty: false, ...state },
		dp: 2,
		titleOf,
		stamps,
		logContext: { orderId: 42, orderUUID: 'order-1' },
	});
}
const even: TenderPlan = { kind: 'even', ways: 2, from: 0 };
const store = () => getCheckoutModeSnapshot();

beforeEach(() => {
	resetCheckoutMode();
	jest.clearAllMocks();
	payload = { total: '92.95', meta_data: [] };
	stamps = { current: Promise.resolve() };
});

describe('the plan, the chip and the picks', () => {
	it('a pick replaces a stored plan; zero units unpicks the line', () => {
		setTenderPlan('order-1', even);
		const split = commands({ plan: even });
		split.pick(1, 2);
		expect(store().pickedUnits.get('order-1')).toEqual({ 1: 2 });
		expect(store().tenderPlans.has('order-1')).toBe(false);
		split.pick(1, 0);
		expect(store().pickedUnits.get('order-1')).toEqual({});
		// The reducer's plan follows the picks at the render that sees them, not here.
		expect(dispatch).not.toHaveBeenCalled();
	});

	it('changed picks replace an active plan and are the entry again; the chip and the picks stay', () => {
		commands({ plan: even }).picksChanged({ 1: 2 }, 9295);
		expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
			{ type: 'clear-plan', balanceMinor: 9295, keepSplit: true, keepPicks: true },
			{ type: 'picks-changed' },
		]);
		dispatch.mockClear();
		// Picks cleared, or no plan: only the entry follows.
		commands({ plan: even }).picksChanged({}, 9295);
		commands().picksChanged({ 1: 2 }, 9295);
		expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
			{ type: 'picks-changed' },
			{ type: 'picks-changed' },
		]);
	});

	it('a plan turns the chip on, spends the picks and is stored for a remount', () => {
		setPickedUnits('order-1', { 1: 1 });
		commands().setPlan(even, 9295);
		expect(dispatch).toHaveBeenCalledWith({ type: 'set-plan', plan: even, balanceMinor: 9295 });
		expect(store().splitOn.has('order-1')).toBe(true);
		expect(store().pickedUnits.has('order-1')).toBe(false);
		expect(store().tenderPlans.get('order-1')).toEqual(even);
	});

	it('clear drops the plan; Change split keeps the chip, a pick keeps the picks too', () => {
		const split = commands({ plan: even });
		split.on();
		split.setPlan(even, 9295);
		pickUnits('order-1', 1, 1);
		split.clear({ balanceMinor: 9295, keepSplit: true, keepPicks: true });
		expect(store().pickedUnits.get('order-1')).toEqual({ 1: 1 });
		expect(store().splitOn.has('order-1')).toBe(true);
		split.clear({ balanceMinor: 9295, keepSplit: true });
		expect(store().pickedUnits.has('order-1')).toBe(false);
		expect(store().splitOn.has('order-1')).toBe(true);
		split.setPlan(even, 9295);
		split.clear({ balanceMinor: 9295 });
		expect(dispatch).toHaveBeenLastCalledWith({ type: 'clear-plan', balanceMinor: 9295 });
		expect(store().splitOn.has('order-1')).toBe(false);
		expect(store().tenderPlans.has('order-1')).toBe(false);
	});

	it.each([
		['back', true],
		['arm-custom', false],
		['reset', false],
	] as const)(
		'leaving the keypad (%s) ends the chip and the picks; the plan stays: %s',
		(type, kept) => {
			const split = commands({ plan: even });
			split.setPlan(even, 9295);
			pickUnits('order-1', 1, 1);
			setTenderPlan('order-1', even);
			split.leave({ type });
			expect(dispatch).toHaveBeenLastCalledWith({ type });
			expect(store().splitOn.has('order-1')).toBe(false);
			expect(store().pickedUnits.has('order-1')).toBe(false);
			expect(store().tenderPlans.has('order-1')).toBe(kept);
		}
	);

	it('a terminal leg that began spends the picks and clears the entry', () => {
		pickUnits('order-1', 1, 1);
		commands().legStarted();
		expect(dispatch).toHaveBeenCalledWith({ type: 'tender-started' });
		expect(store().pickedUnits.has('order-1')).toBe(false);
	});

	it('a remount restores the stored plan and its chip while money is owed', () => {
		setTenderPlan('order-1', even);
		expect(restoredPlan('order-1', 0)).toEqual(even);
		expect(store().splitOn.has('order-1')).toBe(false);
		expect(restoredPlan('order-1', 9295)).toEqual(even);
		expect(store().splitOn.has('order-1')).toBe(true);
	});
});

describe('a press', () => {
	const view = (legUnits: Record<string, number> | null, minors: number[] = []) => ({
		legUnits,
		rowsSinceFrom: minors.map((minor) => ({ minor, title: 'Cash' })),
	});
	const facts = { meta: [], wholeOrder: false, balanceMinor: 6295, amountMinor: 6295 };

	it('freezes THIS payment’s units under its row id, beside the payments already frozen', () => {
		setAllocations('order-1', { a: { 1: 1 } });
		commands()
			.press({ ...facts, view: view({ 2: 2 }) })
			.legPressed('minted');
		expect(store().allocations.get('order-1')).toEqual({ a: { 1: 1 }, minted: { 2: 2 } });
		// A leg with no units (a gateway, a plain amount) freezes nothing.
		commands()
			.press({ ...facts, view: view(null) })
			.legPressed('other');
		expect(store().allocations.get('order-1')).toEqual({ a: { 1: 1 }, minted: { 2: 2 } });
	});

	it('journals every share of the stored plan, the last leg included (roadmap#422)', async () => {
		const leg = commands({ plan: even }).press({ ...facts, view: view(null, [3000, 3000]) });
		const meta = await leg.completionMeta(undefined);
		expect(meta).toHaveLength(1);
		expect(meta?.[0].key).toBe('_wcpos_split');
		expect(JSON.parse(meta?.[0].value as string)).toEqual({
			kind: 'even',
			ways: 3,
			shares: ['30.00', '30.00', '62.95'],
		});
		// A method that runs the whole order journals no plan.
		const whole = commands({ plan: even }).press({ ...facts, wholeOrder: true, view: view(null) });
		expect(await whole.completionMeta(undefined)).toBeUndefined();
	});

	it('clears a split an abandoned attempt left when the sale completes without a plan', async () => {
		const meta = [{ key: '_wcpos_split', value: '{"kind":"even"}' }];
		const leg = commands().press({ ...facts, meta, view: view(null) });
		expect(await leg.completionMeta(undefined)).toEqual([{ key: '_wcpos_split', value: null }]);
	});

	// Moved from use-tender-flow.test.tsx.
	it('clears stale paid units left by a refused attempt when the sale completes without picks', async () => {
		payload.meta_data = [{ key: '_wcpos_paid_units', value: '{"dead":{"l1":1}}' }];
		const extraMeta = await commands()
			.press({ ...facts, view: view(null) })
			.completionMeta(undefined);
		expect(extraMeta).toEqual(expect.arrayContaining([{ key: '_wcpos_paid_units', value: null }]));
	});

	it('journals the completing leg’s own units under its minted id, and only live payments’ units (Greptile on #3400)', async () => {
		payload.meta_data = withLedger(
			[{ key: '_wcpos_paid_units', value: '{"a":{"l1":1},"dead":{"l2":2}}' }],
			[payment({ id: 'a', amount: '30.00' })]
		);
		const extraMeta = await commands()
			.press({ ...facts, view: view({ 2: 2 }) })
			.completionMeta('minted');
		expect(readPaidUnits(extraMeta)).toEqual({ a: { l1: 1 }, minted: { 2: 2 } });
	});

	it('composes its meta only after a stamp in flight has landed', async () => {
		let land!: () => void;
		write.mockImplementationOnce(async (changes: PayloadChanges) => {
			await new Promise<void>((resolve) => (land = resolve));
			payload = { ...payload, ...(changes(payload) as typeof payload) };
		});
		setAllocations('order-1', { a: { 1: 1 } });
		payload.meta_data = withLedger([], [payment({ id: 'a', amount: '30.00' })]);
		const split = commands();
		split.legRecorded(payment({ id: 'a', amount: '30.00' }));
		let composed: MetaDataEntry[] | undefined;
		const pending = split
			.press({ ...facts, view: view(null) })
			.completionMeta(undefined)
			.then((meta) => (composed = meta));
		await Promise.resolve();
		await Promise.resolve();
		expect(composed).toBeUndefined();
		land();
		await pending;
		expect(readPaidUnits(payload.meta_data)).toEqual({ a: { 1: 1 } });
		expect(readPaidUnits(composed)).toEqual({ a: { 1: 1 } });
	});
});

describe('a leg landed', () => {
	it('a partial payment journals its picked units on the order, once (#3421)', async () => {
		const row = payment();
		setAllocations('order-1', { [row.id]: { line: 1 } });
		pickUnits('order-1', 'line', 1);
		payload.meta_data = withLedger([], [row]);
		const split = commands({ plan: even });
		split.legRecorded(row);
		await stamps.current;
		expect(readPaidUnits(payload.meta_data)).toEqual({ [row.id]: { line: 1 } });
		expect(readLedger(payload.meta_data)).toEqual([row]);
		// THIS payment's picks are spent; the plan stays stored while money is owed.
		expect(store().pickedUnits.has('order-1')).toBe(false);
		expect(store().tenderPlans.get('order-1')).toEqual(even);
		expect(dispatch).toHaveBeenCalledWith({
			type: 'tender-recorded',
			balanceMinor: 4295,
			rowsSinceFrom: [{ minor: 5000, title: 'Cash' }],
		});
		// Recorded again (a replay): the stamp resolves to no change.
		split.legRecorded(row);
		await stamps.current;
		expect(write).toHaveBeenCalledTimes(2);
		expect(write.mock.calls[1][0](payload)).toEqual({});
	});

	it('a leg not yet in the stored ledger counts toward the balance and is journaled', async () => {
		const row = payment({ amount: '30.00' });
		setAllocations('order-1', { [row.id]: { line: 1 } });
		commands().legRecorded(row);
		await stamps.current;
		expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ balanceMinor: 6295 }));
		expect(readPaidUnits(payload.meta_data)).toEqual({ [row.id]: { line: 1 } });
	});

	it('the completing leg stamps nothing, ends the chip and the stored plan', async () => {
		const row = payment({ amount: '92.95' });
		setAllocations('order-1', { [row.id]: { line: 1 } });
		payload.meta_data = withLedger([], [row]);
		const split = commands({ plan: even });
		split.setPlan(even, 9295);
		split.legRecorded(row);
		await stamps.current;
		expect(write).not.toHaveBeenCalled();
		expect(store().splitOn.has('order-1')).toBe(false);
		expect(store().tenderPlans.has('order-1')).toBe(false);
	});

	it('a failed stamp is a warning, never a failed payment', async () => {
		const row = payment();
		setAllocations('order-1', { [row.id]: { line: 1 } });
		write.mockRejectedValueOnce(new Error('local write failed'));
		commands().legRecorded(row);
		await expect(stamps.current).resolves.toBeUndefined();
		expect(mockWarn).toHaveBeenCalledWith(
			'Failed to journal paid units',
			expect.objectContaining({
				context: expect.objectContaining({ orderUUID: 'order-1', error: 'local write failed' }),
			})
		);
	});

	it('stamps run one after another and read the order at write time (Greptile on #3421)', async () => {
		const first = payment({ id: 'a', amount: '10.00' });
		const second = payment({ id: 'b', amount: '10.00' });
		setAllocations('order-1', { a: { 1: 1 } });
		const split = commands();
		split.legRecorded(first);
		setAllocations('order-1', { a: { 1: 1 }, b: { 2: 1 } });
		payload.meta_data = withLedger([], [first]);
		split.legRecorded(second);
		await stamps.current;
		// The first stamp resolved against the order as it was when it ran; the second adds to it.
		expect(readPaidUnits(payload.meta_data)).toEqual({ a: { 1: 1 }, b: { 2: 1 } });
	});
});

describe('a payment voided', () => {
	it('frees its units and re-plans an untouched entry over what is left', async () => {
		const kept = payment({ id: 'a', amount: '23.00', method_id: 'pos_card' });
		const cancelled = payment({ id: 'b', amount: '15.00' });
		payload.meta_data = withLedger(
			[{ id: 17, key: '_wcpos_paid_units', value: '{"a":{"l1":1},"b":{"l2":1}}' }],
			[kept, cancelled]
		);
		setAllocations('order-1', { a: { l1: 1 }, b: { l2: 1 } });
		await commands().legVoided('b');
		expect(store().allocations.get('order-1')).toEqual({ a: { l1: 1 } });
		expect(readPaidUnits(payload.meta_data)).toEqual({ a: { l1: 1 } });
		expect(dispatch).toHaveBeenCalledWith({
			type: 'tender-recorded',
			balanceMinor: 6995,
			rowsSinceFrom: [],
		});
	});

	it('leaves an amount the cashier typed alone (CodeRabbit on #3405)', async () => {
		payload.meta_data = withLedger([], [payment({ id: 'a', amount: '10.00' })]);
		await commands({ entryDirty: true }).legVoided('a');
		expect(dispatch).not.toHaveBeenCalled();
	});

	// Moved from use-tender-flow.test.tsx.
	it('cancelling the last allocated leg clears saved paid units', async () => {
		const row = payment();
		payload.meta_data = withLedger(
			[{ id: 17, key: '_wcpos_paid_units', value: '{"payment-1":{"line":1}}' }],
			[row]
		);
		const before = payload;
		await commands().legVoided(row.id);

		expect(write).toHaveBeenCalledTimes(1);
		expect((write.mock.calls[0][0](before) as typeof payload).meta_data).toContainEqual({
			id: 17,
			key: '_wcpos_paid_units',
			value: null,
		});
	});
});
