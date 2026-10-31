/** @jest-environment jsdom */
import { setImmediate } from 'node:timers';

import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';

import { type CouponContext, withAwaitingCustomer } from '@wcpos/order-math';

import { createSettlementCoordinator, needsTaxRepair } from './settlement-coordinator';
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
const emptyContext: CouponContext = {
	coupons: new Map(),
	productCategories: new Map(),
	categoryParents: new Map(),
};
const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((stop) => stop()));
function start(records = [order()], ready = true) {
	const inputs$ = new BehaviorSubject(inputs);
	const openOrders$ = new BehaviorSubject<CurrentOrderRecord[] | null>(records);
	const ratesReady$ = new BehaviorSubject({ ready, generation: 0 });
	const settle = jest.fn<
		Promise<unknown>,
		[string, CurrentOrderRecord, (payload: OrderPayload) => boolean]
	>(async () => {});
	const serverOwnsMoney = jest.fn<boolean, [string]>(() => false);
	const orderSaveState = jest.fn<{ kind: string } | null, [string]>(() => null);
	const inCheckout = jest.fn(() => false);
	const references$ = new BehaviorSubject({ ready: false, generation: '0:0' });
	const readCoupons = jest.fn<Promise<CouponContext>, [OrderPayload]>(async () => emptyContext);
	const observe = jest.fn();
	const reconnected$ = new Subject<void>();
	const deps = {
		inputs$,
		reconnected$,
		openOrders$,
		ratesReady$,
		settle,
		repairTaxExempt: jest.fn<Promise<unknown>, [CurrentOrderRecord, boolean, () => boolean]>(
			async () => {}
		),
		references$,
		readCoupons,
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

it('#1472 settles bind, new orders, config and order content changes, not its own money writes', async () => {
	const a = order();
	const h = start([order('b'), a]);
	await flush();
	expect(h.settle.mock.calls.map(([uuid]) => uuid)).toEqual(['a', 'b']);
	await emit(h.openOrders$, [a, order('b'), order('c')]);
	expect(h.settle).toHaveBeenCalledTimes(3);
	await emit(h.inputs$, { ...inputs, baseLocation: { country: 'NZ' } });
	expect(h.settle.mock.calls.map(([uuid]) => uuid)).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
	h.openOrders$.next([
		order('a', { id: 123, total: '10', total_tax: '0', date_modified_gmt: 'later' }),
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
	['awaiting customer', { meta_data: withAwaitingCustomer([], { method_id: 'invoice', destination: null, attempt_id: 'one', sent_at_gmt: '', cashier_id: 0 }) }, true],
	['server hint', { meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }] }, true],
	['epoch-era stamp', { meta_data: [{ key: '_wcpos_money_owner', value: 'server' }] }, false],
	['partial capture', { meta_data: ledger('captured') }, false],
	['provenance alone', { meta_data: [{ key: '_wcpos_sale_time', value: 'before-failed-leg' }] }, false],
	['quick discount', { coupon_lines: [{ code: 'discount', meta_data: [{ key: '_wcpos_quick_discount', value: { discount_type: 'percent', amount: '10' } }] }] }, false],
];
it.each(
	payloadCases.flatMap(([name, payload, skip]): typeof payloadCases => [
		[name, payload, skip],
		[`coupon: ${name}`, { ...payload, coupon_lines: [{ code: 'summer' }] }, skip],
	])
)('gates %s and replays when the exclusion lifts', async (_, payload, skip) => {
	const h = start([order('a', payload)]);
	await emit(h.references$, { ready: true, generation: '0:0' });
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

// A boundary close refused offline resolves its journal and is tried again when the till
// reconnects; connectivity is not part of the fingerprint, so nothing else would bring it back.
it('retries a boundary that could not close offline when the till reconnects, and only that one', async () => {
	const h = start([order('a'), order('b')]);
	h.settle.mockImplementation(async (uuid) => (uuid === 'a' ? { kind: 'offline' } : undefined));
	await flush();
	expect(h.settle.mock.calls.map(([uuid]) => uuid)).toEqual(['a', 'b']);
	h.settle.mockImplementation(async () => undefined);
	h.reconnected$.next();
	await flush();
	expect(h.settle.mock.calls.map(([uuid]) => uuid)).toEqual(['a', 'b', 'a']);
	h.reconnected$.next();
	await flush();
	expect(h.settle).toHaveBeenCalledTimes(3);
});

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

const couponOrder = (payload: OrderPayload = {}) =>
	order('a', { coupon_lines: [{ code: 'summer' }], ...payload });

it('#963 continuation survives switching tabs and #952 owns demand until the last coupon cart leaves', async () => {
	const a = couponOrder();
	const h = start([a]);
	await flush();
	expect(h.references$.observed).toBe(true);
	expect(h.readCoupons).not.toHaveBeenCalled();
	expect(h.settle).not.toHaveBeenCalled();
	await emit(h.openOrders$, [order('other-tab'), a]);
	await emit(h.references$, { ready: true, generation: '0:0' });
	expect(h.settle.mock.calls.filter(([uuid]) => uuid === 'a')).toHaveLength(1);
	await emit(h.openOrders$, [a]);
	expect(h.readCoupons).toHaveBeenCalledTimes(1);
	await emit(h.openOrders$, []);
	expect(h.references$.observed).toBe(false);
});

it.each(['failed', 'cancelled', 'captured'])(
	'retains a coupon replay through a live leg ending %s with balance',
	async (status) => {
		const a = couponOrder();
		const h = start([a]);
		const pending = new Subject<CouponContext>();
		h.readCoupons.mockReturnValueOnce(firstValueFrom(pending));
		await emit(h.references$, { ready: true, generation: '0:0' });
		a.payload.meta_data = ledger('pending');
		await emit(h.openOrders$, [a]);
		pending.next(emptyContext);
		await flush();
		expect(h.settle).not.toHaveBeenCalled();
		a.payload.meta_data = ledger(status);
		a.payload.status = status === 'captured' ? 'pos-partial' : 'pos-open';
		await emit(h.openOrders$, [a]);
		expect(h.settle).toHaveBeenCalledTimes(1);
	}
);

it.each(['content', 'stop', 'rebind', 'generation'])(
	'invalidates an in-flight coupon context on %s',
	async (change) => {
		const a = couponOrder();
		a.payload.meta_data = [];
		const h = start([a]);
		const pending = new Subject<CouponContext>();
		h.readCoupons.mockReturnValueOnce(firstValueFrom(pending));
		h.settle.mockImplementation(async (_uuid, record, allowed) => {
			expect(allowed(record.payload)).toBe(true);
			expect(allowed({ ...record.payload, id: 99 })).toBe(false);
		});
		await emit(h.references$, { ready: true, generation: '0:0' });
		// Context reads never hold the slot; a newer key can finish before the old read.
		await enqueueOrderMutation('a', async () => {
			if (change === 'content') a.payload.line_items = [{ total: '30' }];
		});
		if (change === 'content') await emit(h.openOrders$, [a]);
		else if (change === 'stop') h.stop();
		else if (change === 'rebind') h.openOrders$.next(null);
		else h.references$.next({ ready: false, generation: '1:0' });
		expect(pending.observed).toBe(true);
		pending.next(emptyContext);
		await flush();
		expect(h.settle).toHaveBeenCalledTimes(change === 'content' ? 1 : 0);
		if (change === 'generation') {
			await emit(h.references$, { ready: true, generation: '1:0' });
			expect(h.settle).toHaveBeenCalledTimes(1);
		} else if (change !== 'content') expect(h.references$.observed).toBe(false);
	}
);

it('does not aggregate a cart that gains a coupon while its slot is queued', async () => {
	const a = order();
	let release!: () => void;
	const held = enqueueOrderMutation(
		'a',
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			})
	);
	const h = start([a]);
	await flush();
	a.payload.coupon_lines = [{ code: 'summer' }];
	h.openOrders$.next([a]);
	release();
	await held;
	await flush();
	expect(h.settle).not.toHaveBeenCalled();
	await emit(h.references$, { ready: true, generation: '0:0' });
	expect(h.settle).toHaveBeenCalledTimes(1);
});

// Re-homed from the removed UI settlement hook. These are coordinator contracts,
// not its former moneyWriteChain, render memo or foreground/background flight keys.
it('#952 settles a quick-discount-only cart on bind without declaring reference demand', async () => {
	const a = order('a', {
		coupon_lines: [
			{
				code: 'discount',
				meta_data: [
					{ key: '_wcpos_quick_discount', value: { discount_type: 'percent', amount: '10' } },
				],
			},
		],
	});
	const h = start([a]);
	await flush();
	expect(h.references$.observed).toBe(false);
	expect(h.readCoupons).toHaveBeenCalledWith(a.payload);
	expect(h.settle).toHaveBeenCalledWith(
		'a',
		a,
		expect.any(Function),
		emptyContext,
		expect.objectContaining({ dispatchToken: expect.any(Object) })
	);
});

it.each([undefined, [], [{ code: null }]])(
	'#952 declares no demand for absent/removed coupon lines: %j',
	async (coupon_lines) => {
		const h = start([order('a', { coupon_lines })]);
		await flush();
		expect(h.references$.observed).toBe(false);
		expect(h.readCoupons).not.toHaveBeenCalled();
		expect(h.settle).toHaveBeenCalledTimes(1);
		await emit(h.openOrders$, [couponOrder()]);
		expect(h.references$.observed).toBe(true);
		expect(h.readCoupons).not.toHaveBeenCalled();
	}
);

it.each(['memory', 'payload'] as const)(
	'#1472 keeps queued order A ownership after a tab switch (%s)',
	async (owner) => {
		const a = order();
		let release!: () => void;
		const held = enqueueOrderMutation(
			'a',
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		const h = start([a]);
		await flush();
		if (owner === 'memory') h.serverOwnsMoney.mockImplementation((uuid) => uuid === 'a');
		else a.payload.meta_data = [{ key: '_wcpos_money_owner_hint', value: 'server' }];
		h.openOrders$.next([a, order('b')]);
		release();
		await held;
		await flush();
		expect(h.settle.mock.calls.map(([uuid]) => uuid)).toEqual(['b']);
	}
);

it.each(['hint', 'memory', 'status', 'id', 'line_items', 'fee_lines', 'shipping_lines'] as const)(
	'#963 rejects stale coupon work when %s changes during the context read',
	async (change) => {
		const a = couponOrder();
		a.payload.meta_data = [];
		const h = start([a]);
		const pending = new Subject<CouponContext>();
		h.readCoupons.mockReturnValueOnce(firstValueFrom(pending));
		await emit(h.references$, { ready: true, generation: '0:0' });
		if (change === 'hint')
			a.payload.meta_data = [{ key: '_wcpos_money_owner_hint', value: 'server' }];
		else if (change === 'memory') h.serverOwnsMoney.mockReturnValue(true);
		else if (change === 'status') a.payload.status = 'completed';
		else if (change === 'id') a.payload.id = 4711;
		else if (change === 'fee_lines') a.payload.fee_lines = [{ name: 'Handling', total: '3' }];
		else if (change === 'shipping_lines')
			a.payload.shipping_lines = [{ method_id: 'flat_rate', total: '4' }];
		else a.payload.line_items = [{ total: '30' }];
		pending.next(emptyContext);
		await flush();
		expect(h.settle).not.toHaveBeenCalled();
	}
);

it('#963 ignores unrelated revision stamps and same-order re-emissions during replay', async () => {
	const a = couponOrder();
	const h = start([a]);
	const pending = new Subject<CouponContext>();
	h.readCoupons.mockReturnValueOnce(firstValueFrom(pending));
	await emit(h.references$, { ready: true, generation: '0:0' });
	a.payload.date_modified_gmt = '2099-01-01T00:00:00';
	await emit(h.openOrders$, [a]);
	pending.next(emptyContext);
	await flush();
	expect(h.readCoupons).toHaveBeenCalledTimes(1);
	expect(h.settle).toHaveBeenCalledTimes(1);
	expect(h.settle.mock.calls[0][1].payload.date_modified_gmt).toBe('2099-01-01T00:00:00');
});

it('#963 uses current tax settings and supersedes an older in-flight config replay', async () => {
	const h = start([couponOrder()]);
	const pending = new Subject<CouponContext>();
	h.readCoupons.mockReturnValueOnce(firstValueFrom(pending));
	await emit(h.references$, { ready: true, generation: '0:0' });
	const updated = {
		...inputs,
		settings: { ...inputs.settings, priceNumDecimals: 2, pricesIncludeTax: true },
	};
	await emit(h.inputs$, updated);
	expect(h.settle).toHaveBeenCalledTimes(1);
	pending.next(emptyContext);
	await flush();
	expect(h.settle).toHaveBeenCalledTimes(1);
});

it('#952 a quick discount mixed with a catalog coupon still waits for reference demand', async () => {
	const a = couponOrder();
	a.payload.coupon_lines!.push({
		code: 'discount',
		meta_data: [
			{ key: '_wcpos_quick_discount', value: { discount_type: 'percent', amount: '10' } },
		],
	});
	const h = start([a]);
	await flush();
	expect(h.references$.observed).toBe(true);
	expect(h.settle).not.toHaveBeenCalled();
	await emit(h.references$, { ready: true, generation: '0:0' });
	expect(h.settle).toHaveBeenCalledWith(
		'a',
		a,
		expect.any(Function),
		emptyContext,
		expect.objectContaining({ dispatchToken: expect.any(Object) })
	);
});

it('#952/#963 server ownership stops coupon reads and subsequent settlement passes', async () => {
	const a = couponOrder();
	const h = start([a]);
	await flush();
	h.serverOwnsMoney.mockReturnValue(true);
	await emit(h.references$, { ready: true, generation: '0:0' });
	expect(h.readCoupons).not.toHaveBeenCalled();
	expect(h.settle).not.toHaveBeenCalled();
	h.serverOwnsMoney.mockReturnValue(false);
	await emit(h.openOrders$, [a]);
	expect(h.settle).toHaveBeenCalledTimes(1);
	h.serverOwnsMoney.mockReturnValue(true);
	await emit(h.inputs$, { ...inputs, baseLocation: { country: 'NZ' } });
	expect(h.readCoupons).toHaveBeenCalledTimes(1);
	expect(h.settle).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
	're-drains a stock refusal after an in-flight catalog event (still short=%s)',
	async (stillShort) => {
		const h = start([couponOrder()], false);
		let release!: () => void;
		const refusal = { deny: { reasonKey: 'pos_products.out_of_stock' } };
		h.settle.mockImplementationOnce(async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return refusal;
		});
		h.settle.mockImplementation(async () => {
			if (stillShort) return refusal;
		});
		await emit(h.references$, { ready: true, generation: '0' });
		await emit(h.ratesReady$, { ready: true, generation: 0 });
		expect(h.settle).toHaveBeenCalledTimes(1);
		// A stock write emits the same inputs while replay is awaiting its guards.
		await emit(h.inputs$, h.inputs$.value);
		expect(h.settle).toHaveBeenCalledTimes(1);
		release();
		await flush();
		expect(h.settle).toHaveBeenCalledTimes(2);
		await flush();
		expect(h.settle).toHaveBeenCalledTimes(2);
	}
);

it.each([false, true])(
	're-drains a final stock supersession only for new inputs (%s)',
	async (emitted) => {
		const h = start([couponOrder()], false);
		let release!: () => void;
		const superseded = { superseded: true, reason: 'pos_products.out_of_stock' };
		h.settle.mockImplementationOnce(async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return superseded;
		});
		h.settle.mockResolvedValue(superseded);
		await emit(h.references$, { ready: true, generation: '0' });
		await emit(h.ratesReady$, { ready: true, generation: 0 });
		if (emitted) await emit(h.inputs$, h.inputs$.value);
		release();
		await flush();
		expect(h.settle).toHaveBeenCalledTimes(emitted ? 2 : 1);
		await emit(h.inputs$, h.inputs$.value);
		expect(h.settle).toHaveBeenCalledTimes(emitted ? 3 : 2);
		await flush();
		expect(h.settle).toHaveBeenCalledTimes(emitted ? 3 : 2);
	}
);

it('re-drains catalog-generation supersession after an in-flight emission', async () => {
	const h = start([couponOrder()], false);
	h.settle.mockImplementationOnce(async () => {
		await emit(h.inputs$, h.inputs$.value);
		return { superseded: true, reason: 'catalog_changed' };
	});
	await emit(h.references$, { ready: true, generation: '0' });
	await emit(h.ratesReady$, { ready: true, generation: 0 });
	await flush();
	expect(h.settle).toHaveBeenCalledTimes(2);
});

it.each(['register_changed', 'session_changed'])(
	're-drains %s after an in-flight emission',
	async (reason) => {
		const h = start([couponOrder()], false);
		h.settle.mockImplementationOnce(async () => {
			await emit(h.inputs$, h.inputs$.value);
			return { superseded: true, reason };
		});
		await emit(h.references$, { ready: true, generation: '0' });
		await emit(h.ratesReady$, { ready: true, generation: 0 });
		await flush();
		expect(h.settle).toHaveBeenCalledTimes(2);
	}
);

const exemptMeta = (value = 'yes') => [{ key: 'is_vat_exempt', value }];
it.each([
	['no', 'yes', true],
	['yes', 'no', false],
] as const)('repairs a flag flip %s → %s before settlement', async (before, after, exempt) => {
	const h = start([order('a', { meta_data: exemptMeta(before), line_items: [] })]);
	await flush();
	h.settle.mockClear();
	const changed = order('a', { meta_data: exemptMeta(after), line_items: [] });
	await emit(h.openOrders$, [changed]);
	expect(h.repairTaxExempt).toHaveBeenCalledTimes(1);
	expect(h.repairTaxExempt).toHaveBeenCalledWith(changed, exempt, expect.any(Function));
	expect(h.settle).toHaveBeenCalledTimes(1);
	await emit(h.openOrders$, [changed]);
	expect(h.repairTaxExempt).toHaveBeenCalledTimes(1);
	expect(h.settle).toHaveBeenCalledTimes(1);
});
it.each(['1', '0.00'])('first sight repairs only taxed exempt lines (%s)', async (tax) => {
	const record = order('a', {
		meta_data: exemptMeta(),
		line_items: [{ total_tax: tax, taxes: [{ total: tax }] }],
	});
	const h = start([record]);
	await flush();
	if (tax === '1') {
		expect(h.repairTaxExempt).toHaveBeenCalledWith(record, true, expect.any(Function));
		expect(h.settle).toHaveBeenCalledTimes(1);
	} else {
		expect(h.repairTaxExempt).not.toHaveBeenCalled();
		expect(h.settle).toHaveBeenCalledTimes(1);
	}
});
it('remembers a refused repair until the payload changes', async () => {
	const record = order('a', { meta_data: exemptMeta(), line_items: [{ total_tax: '1' }] });
	const h = start([record], false);
	h.repairTaxExempt.mockResolvedValue({ deny: { reasonKey: 'pos_cart.tax_exempt_locked' } });
	await emit(h.ratesReady$, { ready: true, generation: 0 });
	expect(h.settle).toHaveBeenCalledTimes(1);
	await emit(h.openOrders$, [record]);
	expect(h.repairTaxExempt).toHaveBeenCalledTimes(1);
	await emit(h.openOrders$, [order('a', { ...record.payload, line_items: [{ total_tax: '2' }] })]);
	expect(h.repairTaxExempt).toHaveBeenCalledTimes(2);
	expect(h.observe).not.toHaveBeenCalled();
});
it.each([[], null])('forgets repair state when orders are removed (%s)', async (removed) => {
	const record = order('a', { meta_data: exemptMeta(), line_items: [{ total_tax: '1' }] });
	const h = start([record]);
	await flush();
	await emit(h.openOrders$, removed);
	await emit(h.openOrders$, [record]);
	expect(h.repairTaxExempt).toHaveBeenCalledTimes(2);
});
it('reports a thrown repair without retrying the same fingerprint', async () => {
	const record = order('a', { meta_data: exemptMeta(), line_items: [{ total_tax: '1' }] });
	const h = start([record], false);
	const error = new Error('repair failed');
	h.repairTaxExempt.mockRejectedValueOnce(error);
	await emit(h.ratesReady$, { ready: true, generation: 0 });
	expect(h.observe).toHaveBeenCalledWith({ type: 'settlement.failed', uuid: 'a', at: 123, error });
	await emit(h.openOrders$, [record]);
	expect(h.repairTaxExempt).toHaveBeenCalledTimes(1);
	await emit(h.inputs$, { ...inputs, baseLocation: { country: 'GB' } });
	expect(h.repairTaxExempt).toHaveBeenCalledTimes(2);
});
it.each<[string, OrderPayload, boolean]>([
	['absent taxes', { line_items: [{ total: '10' }] }, false],
	['absent tax total', { line_items: [{ total_tax: '0', taxes: [{ id: 1 }] }] }, false],
	['tax array', { line_items: [{ total_tax: '0', taxes: [{ total: '1' }] }] }, true],
	['line tombstone', { line_items: [{ product_id: null, total_tax: '1' }] }, false],
	['fixed fee', { fee_lines: [{ name: 'Fee', total_tax: '1' }] }, true],
	['fee tombstone', { fee_lines: [{ name: null, total_tax: '1' }] }, false],
	[
		'percent fee',
		{
			fee_lines: [
				{
					name: 'Fee',
					total_tax: '1',
					meta_data: [{ key: '_woocommerce_pos_data', value: JSON.stringify({ percent: true }) }],
				},
			],
		},
		false,
	],
	['shipping', { shipping_lines: [{ total_tax: '1' }] }, false],
])('tax repair predicate: %s', (_, payload, expected) => {
	expect(needsTaxRepair({ ...payload, meta_data: exemptMeta() }, undefined)).toBe(expected);
});

it.each(['refused', 'thrown'])(
	'retains an un-exempt trigger after a %s repair in checkout',
	async (outcome) => {
		const record = order('a', {
			meta_data: exemptMeta(),
			line_items: [{ total: '10', total_tax: '0', taxes: [] }],
		});
		const h = start([record]);
		await flush();
		h.settle.mockClear();
		h.inCheckout.mockReturnValue(true);
		if (outcome === 'refused')
			h.repairTaxExempt.mockResolvedValue({ deny: { reasonKey: 'pos_cart.tax_exempt_locked' } });
		else h.repairTaxExempt.mockRejectedValue(new Error('repair failed'));
		record.payload.meta_data = exemptMeta('no');
		await emit(h.openOrders$, [record]);
		expect(h.repairTaxExempt).toHaveBeenCalledTimes(1);
		expect(h.settle).not.toHaveBeenCalled();
		await emit(h.openOrders$, [record]);
		expect(h.repairTaxExempt).toHaveBeenCalledTimes(1);
		h.inCheckout.mockReturnValue(false);
		h.repairTaxExempt.mockResolvedValue(undefined);
		await emit(h.openOrders$, [record]);
		expect(h.repairTaxExempt).toHaveBeenCalledTimes(2);
		expect(h.repairTaxExempt).toHaveBeenLastCalledWith(record, false, expect.any(Function));
		expect(h.settle).toHaveBeenCalledTimes(1);
	}
);

it.each(['stop', 'rebind'] as const)('invalidates an awaiting repair after %s', async (kind) => {
	const record = order('a', { meta_data: exemptMeta(), line_items: [{ total_tax: '1' }] });
	const h = start([], false);
	let release!: () => void;
	const validity: boolean[] = [];
	h.repairTaxExempt.mockImplementationOnce(async (_record, _exempt, valid) => {
		validity.push(valid?.());
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		validity.push(valid?.());
	});
	h.openOrders$.next([record]);
	await emit(h.ratesReady$, { ready: true, generation: 0 });
	if (kind === 'stop') h.stop();
	else h.openOrders$.next(null);
	release();
	await flush();
	expect(validity).toEqual([true, false]);
});

it('defers coupon repair without blocking the next order in the drain', async () => {
	const a = order('a', {
		meta_data: exemptMeta(),
		coupon_lines: [{ code: 'ten' }],
		line_items: [{ total_tax: '1' }],
	});
	const h = start([a, order('b')]);
	await flush();
	expect(h.repairTaxExempt).not.toHaveBeenCalled();
	expect(h.settle.mock.calls.map(([uuid]) => uuid)).toEqual(['b']);
	expect(h.references$.observed).toBe(true);
	await emit(h.references$, { ready: true, generation: '0:0' });
	expect(h.repairTaxExempt).toHaveBeenCalledWith(a, true, expect.any(Function));
});

it.each([
	{ subtotal_tax: '0.50', taxes: [{ id: 1, subtotal: '0', total: '0' }] },
	{ subtotal_tax: '0', taxes: [{ id: 1, subtotal: '0.50', total: '0' }] },
])('repairs exempt lines with only subtotal taxes: %j', async (taxes) => {
	const record = order('a', {
		meta_data: exemptMeta(),
		line_items: [{ subtotal: '5', total: '0', total_tax: '0', ...taxes }],
	});
	const h = start([record]);
	await flush();
	expect(h.repairTaxExempt).toHaveBeenCalledWith(record, true, expect.any(Function));
});
