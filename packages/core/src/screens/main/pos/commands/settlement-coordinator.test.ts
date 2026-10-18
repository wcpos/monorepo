import { BehaviorSubject } from 'rxjs';

import { createSettlementCoordinator } from './settlement-coordinator';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { CartConfigInputs, OrderPayload } from './cart-config-for-order';

// prettier-ignore
const inputs: CartConfigInputs = {
	settings: { calcTaxes: false, pricesIncludeTax: false, taxRoundAtSubtotal: false,
		priceNumDecimals: 3, shippingTaxClass: '', taxClassSlugs: [],
		calcDiscountsSequentially: false, taxBasedOn: 'base' },
	rates: [], baseLocation: {},
};
// prettier-ignore
const order = (uuid = 'a', payload: OrderPayload = {}) => ({
	uuid, payload: { status: 'pos-open', total: '20', line_items: [{ total: '10' }], ...payload },
	getLatest() { return this; },
}) as CurrentOrderRecord;
// prettier-ignore
const ledger = (status: string, amount = '5') => [{ key: '_wcpos_payments', value: {
	schema: 1, payments: [{ id: 'leg', status, amount, refunded_amount: '0' }],
} }];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
async function emit<T>(subject: BehaviorSubject<T>, value: T) {
	subject.next(value);
	await flush();
}
const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((stop) => stop()));
function start(records = [order()], ready = true) {
	const inputs$ = new BehaviorSubject(inputs);
	const openOrders$ = new BehaviorSubject<CurrentOrderRecord[] | null>(records);
	const ratesReady$ = new BehaviorSubject({ ready, generation: 0 });
	const settle = jest.fn<
		Promise<void>,
		[string, CurrentOrderRecord, (payload: OrderPayload) => boolean]
	>(async () => {});
	const serverOwnsMoney = jest.fn(() => false);
	const orderSaveState = jest.fn<{ kind: string } | null, [string]>(() => null);
	const inCheckout = jest.fn(() => false);
	const observe = jest.fn();
	const deps = {
		inputs$,
		openOrders$,
		ratesReady$,
		settle,
		serverOwnsMoney,
		orderSaveState,
		inCheckout,
		now: () => 123,
		observe,
	};
	const coordinator = createSettlementCoordinator(deps);
	stops.push(coordinator.stop);
	return { ...deps, ...coordinator };
}

it('settles bind, new orders, config and order content changes, not its own money writes', async () => {
	const a = order();
	const h = start([order('b'), a]);
	await flush();
	expect(h.settle.mock.calls.map(([uuid]) => uuid)).toEqual(['a', 'b']);
	await emit(h.openOrders$, [a, order('b'), order('c')]);
	expect(h.settle).toHaveBeenCalledTimes(3);
	await emit(h.inputs$, { ...inputs, baseLocation: { country: 'NZ' } });
	expect(h.settle.mock.calls.map(([uuid]) => uuid)).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
	h.openOrders$.next([
		order('a', { total: '10', total_tax: '0', date_modified_gmt: 'later' }),
		order('b'),
		order('c'),
	]);
	await flush();
	expect(h.settle).toHaveBeenCalledTimes(6);
	await emit(h.openOrders$, [order('a', { billing: { country: 'AU' } }), order('b'), order('c')]);
	expect(h.settle).toHaveBeenCalledTimes(7);
});

// prettier-ignore
const payloadCases: [string, OrderPayload, boolean][] = [
	['pending leg', { meta_data: ledger('pending') }, true],
	['authorized leg', { meta_data: ledger('authorized') }, true],
	['completed ledger', { total: '0.004', meta_data: ledger('captured', '0.004') }, true],
	['awaiting customer', { meta_data: [{ key: '_wcpos_awaiting_customer', value: { method_id: 'invoice', attempt_id: 'one' } }] }, true],
	['server meta', { meta_data: [{ key: '_wcpos_money_owner', value: 'server' }] }, true],
	['coupon', { coupon_lines: [{ code: 'summer' }] }, true],
	['partial capture', { meta_data: ledger('captured') }, false],
	['provenance alone', { meta_data: [{ key: '_wcpos_sale_time', value: 'before-failed-leg' }] }, false],
	['quick discount', { coupon_lines: [{ code: 'discount', meta_data: [{ key: '_wcpos_quick_discount', value: { discount_type: 'percent', amount: '10' } }] }] }, false],
];
it.each(payloadCases)('gates %s and replays when the exclusion lifts', async (_, payload, skip) => {
	const h = start([order('a', payload)]);
	await flush();
	expect(h.settle).toHaveBeenCalledTimes(skip ? 0 : 1);
	if (skip) await emit(h.openOrders$, [order()]);
	expect(h.settle).toHaveBeenCalledTimes(1);
});

it.each(['rejected', 'conflicted', 'needs-revision', 'checkout', 'server memory', 'temporary'])(
	'defers %s and observes its release',
	async (kind) => {
		const record = order();
		const h = start([record], false);
		if (kind === 'checkout') h.inCheckout.mockReturnValue(true);
		else if (kind === 'server memory') h.serverOwnsMoney.mockReturnValue(true);
		else if (kind === 'temporary') Object.assign(record, { isNew: true });
		else h.orderSaveState.mockReturnValue({ kind });
		await emit(h.ratesReady$, { ready: true, generation: 0 });
		expect(h.settle).not.toHaveBeenCalled();
		h.inCheckout.mockReturnValue(false);
		h.serverOwnsMoney.mockReturnValue(false);
		h.orderSaveState.mockReturnValue(null);
		Object.assign(record, { isNew: false });
		await emit(h.openOrders$, [record]);
		expect(h.settle).toHaveBeenCalledTimes(1);
	}
);

it('coalesces rates gaps and serializes uuid order behind the existing mutation slot', async () => {
	const h = start([order('b'), order()], false);
	await flush();
	await emit(h.inputs$, { ...inputs, rates: [] });
	expect(h.settle).not.toHaveBeenCalled();
	await emit(h.ratesReady$, { ready: true, generation: 1 });
	expect(h.settle).toHaveBeenCalledTimes(2);
	let release!: () => void;
	const held = enqueueOrderMutation(
		'a',
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			})
	);
	await emit(h.inputs$, { ...inputs, baseLocation: { country: 'GB' } });
	h.ratesReady$.next({ ready: false, generation: 2 });
	release();
	await held;
	await flush();
	expect(h.settle).toHaveBeenCalledTimes(2);
	await emit(h.ratesReady$, { ready: true, generation: 2 });
	expect(h.settle).toHaveBeenCalledTimes(4);
	expect(h.settle.mock.calls.map(([uuid]) => uuid)).toEqual(['a', 'b', 'a', 'b']);
	h.settle.mockImplementationOnce(async (_uuid, record, allowed) => {
		h.ratesReady$.next({ ready: false, generation: 2 });
		expect(allowed(record.payload)).toBe(false);
	});
	await emit(h.inputs$, inputs);
	await emit(h.ratesReady$, { ready: true, generation: 2 });
	expect(h.settle).toHaveBeenCalledTimes(7);
});

it('retries a rejected settlement on the next unchanged emission', async () => {
	const record = order();
	const h = start([record], false);
	h.settle.mockRejectedValueOnce(new Error('write failed'));
	await emit(h.ratesReady$, { ready: true, generation: 0 });
	expect(h.observe).toHaveBeenCalledWith({
		type: 'settlement.failed',
		uuid: 'a',
		at: 123,
		error: expect.any(Error),
	});
	await emit(h.openOrders$, [record]);
	expect(h.settle).toHaveBeenCalledTimes(2);
	await expect(h.settle.mock.results[1].value).resolves.toBeUndefined();
	await emit(h.openOrders$, [record]);
	expect(h.settle).toHaveBeenCalledTimes(2);
});

it.each(['completed', 'cancelled'])(
	'skips an order that becomes %s before its slot',
	async (status) => {
		const record = order();
		let release!: () => void;
		const held = enqueueOrderMutation(
			'a',
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		const h = start([record]);
		await flush();
		expect(h.settle).not.toHaveBeenCalled();
		jest.spyOn(record, 'getLatest').mockReturnValue(order('a', { status }));
		release();
		await held;
		await flush();
		expect(h.settle).not.toHaveBeenCalled();
	}
);

it('clears per-order memory on rebind and stops every subscription and queued write', async () => {
	const h = start();
	await flush();
	h.openOrders$.next(null);
	await emit(h.openOrders$, [order()]);
	expect(h.settle).toHaveBeenCalledTimes(2);
	h.stop();
	h.inputs$.next({ ...inputs, baseLocation: { country: 'GB' } });
	await emit(h.openOrders$, [order('b')]);
	expect(h.settle).toHaveBeenCalledTimes(2);
	expect([h.inputs$, h.openOrders$, h.ratesReady$].every((subject) => !subject.observed)).toBe(
		true
	);
});
