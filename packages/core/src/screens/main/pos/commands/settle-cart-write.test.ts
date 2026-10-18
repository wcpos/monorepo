import { settleAggregate, snapshotFromOrderJSON } from '@wcpos/order-math';
import { stripServerAuthoredOrderMoney } from '@wcpos/sync-core';

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
	expect(stripServerAuthoredOrderMoney(patch)).toEqual(data);
	expect(
		compareOrderMoney({
			pushed: stripServerAuthoredOrderMoney(patch),
			acked: { ...patch, total: '100' },
		})
	).toBeNull();
	expect(settleAggregate(snapshotFromOrderJSON({ ...payload, ...patch }), config).changed).toBe(
		false
	);
});

it.each(['meta', 'hint', 'memory'])(
	'keeps server money owned through %s while writing intent',
	async (source) => {
		const order = record();
		if (source !== 'memory')
			order.payload.meta_data = [
				{
					key: source === 'hint' ? '_wcpos_money_owner_hint' : '_wcpos_money_owner',
					value: 'server',
				},
			];
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

const ownerKeys = ['_wcpos_money_owner', '_wcpos_money_owner_hint'];
it.each(ownerKeys)('preserves ownership against stale meta (%s)', async (key) => {
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
