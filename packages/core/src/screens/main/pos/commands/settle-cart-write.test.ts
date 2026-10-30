/** @jest-environment jsdom */
import { settleAggregate, snapshotFromOrderJSON } from '@wcpos/order-math';
import { toOrderWirePayload } from '@wcpos/sync-core';

import { config, resolveCartWrite } from '../../../../../jest/cart-write';
import { compareOrderMoney } from '../../../../../../sync-engine/src/write-path/order-money-divergence';
import { settleCartWrite } from './settle-cart-write';

import type { CurrentOrderRecord } from '../contexts/current-order';

const line = {
	product_id: 1,
	subtotal: '10',
	total: '8',
};
const payload = { status: 'pos-open', line_items: [line], billing: { country: 'AU' }, total: '99' };
const record = (value = payload) =>
	({
		uuid: 'target',
		payload: { ...value },
		getLatest() {
			return this;
		},
	}) as unknown as CurrentOrderRecord;

it('settles the latest post-intent payload in one write, without changing outbound intent', async () => {
	const latest = record();
	const stale = { getLatest: () => latest } as CurrentOrderRecord;
	const localPatch = jest.fn().mockResolvedValue('written');
	const configForOrder = jest.fn(() => config);
	const data = { billing: { country: 'NZ' }, line_items: [{ ...line, total: '6' }] };
	await settleCartWrite(
		{ document: stale, data },
		{ localPatch: resolveCartWrite(localPatch), configForOrder, serverOwnsMoney: () => false }
	);
	expect(configForOrder).toHaveBeenCalledWith({ ...payload, ...data });
	expect(localPatch).toHaveBeenCalledTimes(1);
	const patch = localPatch.mock.calls[0][0].data;
	expect(patch).toEqual({
		...data,
		total: '6',
		total_tax: '0',
		discount_total: '4',
		discount_tax: '0',
		shipping_total: '0',
		shipping_tax: '0',
		cart_tax: '0',
		tax_lines: [],
	});
	expect(toOrderWirePayload(patch)).toEqual(data);
	expect(
		compareOrderMoney({
			pushed: toOrderWirePayload(patch),
			acked: { ...patch, total: '100' },
		})
	).toBeNull();
	expect(settleAggregate(snapshotFromOrderJSON({ ...payload, ...patch }), config).changed).toBe(
		false
	);
});

it.each(['hint', 'memory'])(
	'keeps server money owned through %s while writing intent',
	async (source) => {
		const order = record();
		if (source === 'hint')
			order.payload.meta_data = [{ key: '_wcpos_money_owner_hint', value: 'server' }];
		const localPatch = jest.fn();
		const data = { line_items: [line] };
		await settleCartWrite(
			{ document: order, data },
			{
				localPatch: resolveCartWrite(localPatch),
				configForOrder: () => config,
				serverOwnsMoney: (uuid: string) => source === 'memory' && uuid === 'target',
			}
		);
		expect(localPatch).toHaveBeenCalledWith({ document: order, data });
	}
);

it.each(['_wcpos_money_owner_hint'])('preserves ownership against stale meta (%s)', async (key) => {
	const order = record();
	const owner = { id: 42, key, value: 'server' };
	order.payload.meta_data = [owner];
	const data = { line_items: [line], meta_data: [{ key: '_wcpos_cart', value: 'restarted' }] };
	const localPatch = jest.fn();
	await settleCartWrite(
		{ document: order, data },
		{
			localPatch: resolveCartWrite(localPatch),
			configForOrder: () => config,
			serverOwnsMoney: () => false,
		}
	);
	expect(localPatch).toHaveBeenCalledWith({
		document: order,
		data: { ...data, meta_data: [...data.meta_data, owner] },
	});
});

it('writes only intent when persisted money already matches', async () => {
	const settled = settleAggregate(snapshotFromOrderJSON(payload), config).patch;
	const order = record({ ...payload, ...settled });
	const localPatch = jest.fn();
	const data = { billing: undefined };
	const configForOrder = jest.fn(() => config);
	await settleCartWrite(
		{ document: order, data },
		{ localPatch: resolveCartWrite(localPatch), configForOrder, serverOwnsMoney: () => false }
	);
	expect(localPatch).toHaveBeenCalledWith({ document: order, data });
	expect(configForOrder).toHaveBeenCalledWith(
		expect.objectContaining({ billing: payload.billing })
	);
});

it.each(['remove', 'reduce'])('%s routes only a covered balance to commit', async (operation) => {
	const order = record();
	order.payload.line_items = [
		{ ...line, total: '3' },
		{ ...line, total: '9', quantity: 3 },
	];
	order.payload.status = 'pos-partial';
	order.payload.meta_data = [
		{
			key: '_wcpos_payments',
			value: {
				schema: 1,
				payments: [{ id: 'leg', status: 'captured', amount: '4', refunded_amount: '0' }],
			},
		},
	];
	const queue = {
		dispatchToken: {},
	} as import('../hooks/order-mutation-queue').OrderMutationContext;
	const data = {
		line_items:
			operation === 'remove'
				? order.payload.line_items.slice(0, 1)
				: [
						{ ...line, total: '3' },
						{ ...line, quantity: 1, total: '3' },
					],
	};
	const localPatch = jest.fn(async ({ data: changes }) => {
		Object.assign(order.payload, changes);
		return order;
	});
	const commitAtBoundary = jest.fn(async () => {
		expect(localPatch).toHaveBeenCalledTimes(1);
		expect(order.payload.line_items).toEqual(data.line_items);
		expect(order.payload.total).toBe('99');
	});
	await settleCartWrite(
		{ document: order, data, queue },
		{
			localPatch: resolveCartWrite(localPatch),
			configForOrder: () => config,
			serverOwnsMoney: () => false,
			commitAtBoundary,
		}
	);
	if (operation === 'remove') {
		expect(localPatch).toHaveBeenCalledWith({ document: order, data });
		expect(commitAtBoundary).toHaveBeenCalledWith(
			order,
			expect.objectContaining({ changed: true }),
			queue
		);
	} else {
		expect(order.payload.total).toBe('6');
		expect(commitAtBoundary).not.toHaveBeenCalled();
	}
});

it('resolves data against each resident payload and propagates a resolver refusal', async () => {
	const order = record();
	const refusal = { deny: { reasonKey: 'caller_locked' } };
	const data = jest.fn((current) =>
		current.status === 'completed' ? refusal : { total: current.total }
	);
	const localPatch = jest.fn(({ changes }) => {
		expect(changes(order.payload)).toMatchObject({ total: '8' });
		expect(changes({ ...order.payload, status: 'completed' })).toEqual({});
		return Promise.resolve(order);
	});
	const commitAtBoundary = jest.fn();
	expect(
		await settleCartWrite(
			{ document: order, data, queue: {} as never },
			{
				localPatch,
				commitAtBoundary,
				configForOrder: () => config,
				serverOwnsMoney: () => false,
			}
		)
	).toEqual(refusal);
	expect(data).toHaveBeenCalledTimes(2);
	expect(commitAtBoundary).not.toHaveBeenCalled();
});

it.each([true, false])(
	'settles supplied coupons atomically or refuses a missing coupon, available=%s',
	async (available) => {
		const order = record();
		order.payload.coupon_lines = [{ code: 'ten' }];
		const coupons = {
			coupons: new Map(
				available ? [['ten', { code: 'ten', discount_type: 'percent' as const, amount: '10' }]] : []
			),
			productCategories: new Map(),
		};
		const writes: object[] = [];
		const result = await settleCartWrite(
			{
				document: order,
				data: () => ({ billing: { country: 'NZ' } }),
				coupons: {
					context: coupons,
					missing: { deny: { reasonKey: 'caller_missing' } },
					boundary: { deny: { reasonKey: 'caller_locked' } },
				},
				queue: {} as never,
			},
			{
				localPatch: ({ changes }) => {
					writes.push(changes(order.payload));
					return Promise.resolve(order);
				},
				commitAtBoundary: jest.fn(),
				configForOrder: () => config,
				serverOwnsMoney: () => false,
			}
		);
		if (available) {
			expect(writes).toEqual([
				expect.objectContaining({
					billing: { country: 'NZ' },
					total: '9',
					discount_total: '1',
					coupon_lines: [
						expect.objectContaining({ code: 'ten', discount: '1', discount_tax: '0' }),
					],
				}),
			]);
			expect(result).toBe(order);
		} else {
			expect(writes).toEqual([{}]);
			expect(result).toEqual({ deny: { reasonKey: 'caller_missing' } });
		}
	}
);
