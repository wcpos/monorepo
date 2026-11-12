/** @jest-environment jsdom */
import {
	type CartConfig,
	type CouponInput,
	createCartConfig,
	settleAggregate,
	snapshotFromOrderJSON,
} from '@wcpos/order-math';
import { toOrderWirePayload } from '@wcpos/sync-core';

import { config, resolveCartWrite } from '../../../../../jest/cart-write';
import { compareOrderMoney } from '../../../../../../sync-engine/src/write-path/order-money-divergence';
import { type BoundaryCommit, type CartWriteCoupons, settleCartWrite } from './settle-cart-write';

import type { CurrentOrderRecord } from '../contexts/current-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

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
		return { kind: 'closed' as const };
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
		expect(commitAtBoundary).toHaveBeenCalledWith(order, queue, undefined, undefined);
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
					// 10 less 10% of 10 = 9, untaxed.
					total: '9',
					total_tax: '0',
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

// These pass on 786366e9 too: they describe the write side only, not that regression.
describe('a coupon write settles the total it priced', () => {
	const percent = { code: 'ten', discount_type: 'percent' as const, amount: '10' };
	const context = (...coupons: CouponInput[]) => ({
		coupons: new Map(coupons.map((coupon) => [coupon.code, coupon])),
		productCategories: new Map(),
	});
	const captured = (amount: string) => [
		{
			key: '_wcpos_payments',
			value: {
				schema: 1,
				payments: [{ id: 'leg', status: 'captured', amount, refunded_amount: '0' }],
			},
		},
	];
	async function write(
		order: CurrentOrderRecord,
		coupons: CartWriteCoupons,
		configForOrder: () => CartConfig = () => config
	) {
		const writes: Record<string, unknown>[] = [];
		const queue = { dispatchToken: {} } as OrderMutationContext;
		const commitAtBoundary = jest.fn<ReturnType<BoundaryCommit>, Parameters<BoundaryCommit>>(
			async () => ({ kind: 'closed' })
		);
		const codes = [...coupons.context.coupons.keys()].map((code) => ({ code }));
		const result = await settleCartWrite(
			{ document: order, data: () => ({ coupon_lines: codes }), coupons, queue },
			{
				localPatch: ({ changes }) => {
					const landed = changes(order.payload);
					writes.push(landed);
					// As applyLocalPatch: resolves the revision the write produced.
					const document = { payload: { ...order.payload, ...landed } };
					return Promise.resolve({ changes: landed, document });
				},
				commitAtBoundary,
				configForOrder,
				serverOwnsMoney: () => false,
			}
		);
		return { writes, result, commitAtBoundary, queue };
	}
	const missing = { deny: { reasonKey: 'caller_missing' } };

	it('settles an inclusive taxed line with a percent coupon in one write', async () => {
		const rate = {
			id: 1,
			rate: '10',
			compound: false,
			order: 1,
			class: 'standard',
			shipping: true,
		};
		const inclusive = createCartConfig({
			...config,
			rates: [rate],
			allRates: [rate],
			calcTaxes: true,
			pricesIncludeTax: true,
			taxClassSlugs: ['standard'],
		});
		const order = record({
			...payload,
			prices_include_tax: true,
			line_items: [
				{
					product_id: 1,
					quantity: 1,
					tax_class: '',
					subtotal: '10',
					subtotal_tax: '1',
					total: '10',
					total_tax: '1',
					taxes: [{ id: 1, subtotal: '1', total: '1' }],
					meta_data: [
						{ key: '_woocommerce_pos_data', value: { price: 11, tax_status: 'taxable' } },
					],
				},
			],
		} as never);
		const { writes } = await write(
			order,
			{ context: context(percent), taxStatusFor: () => 'taxable', missing },
			() => inclusive
		);
		// 11 inclusive (10 + 1 tax); 10% off inclusive = 1.10, of which 1 ex tax and 0.10 tax.
		// Total 11 - 1.10 = 9.90, its tax 1 - 0.10 = 0.90.
		expect(writes).toEqual([
			expect.objectContaining({
				total: '9.9',
				total_tax: '0.9',
				discount_total: '1',
				discount_tax: '0.1',
				coupon_lines: [
					expect.objectContaining({ code: 'ten', discount: '1', discount_tax: '0.1' }),
				],
			}),
		]);
	});

	it('settles a percent and a fixed_cart coupon together in one write', async () => {
		const order = record({
			...payload,
			line_items: [{ product_id: 1, subtotal: '20', total: '20' }],
		});
		const fixed = { code: 'two', discount_type: 'fixed_cart' as const, amount: '2' };
		const { writes } = await write(order, { context: context(percent, fixed), missing });
		// 10% of 20 = 2 and a fixed 2: 20 - 2 - 2 = 16, discount 4.
		expect(writes).toEqual([
			expect.objectContaining({
				total: '16',
				total_tax: '0',
				discount_total: '4',
				coupon_lines: [
					expect.objectContaining({ code: 'ten', discount: '2' }),
					expect.objectContaining({ code: 'two', discount: '2' }),
				],
			}),
		]);
	});

	it('settles a part-paid order the coupon leaves above its paid balance in one write', async () => {
		const order = record({
			...payload,
			status: 'pos-partial',
			meta_data: captured('4'),
		} as never);
		const { writes, commitAtBoundary } = await write(order, { context: context(percent), missing });
		// 10 less 10% = 9, above the 4 paid: an ordinary patch.
		expect(writes).toEqual([
			expect.objectContaining({ total: '9', total_tax: '0', discount_total: '1' }),
		]);
		expect(commitAtBoundary).not.toHaveBeenCalled();
	});

	it.each([
		['at', '9'],
		['below', '10'],
	])(
		'hands a part-paid order the coupon takes %s its paid balance to the boundary commit with its coupons',
		async (_where, paid) => {
			const order = record({
				...payload,
				status: 'pos-partial',
				meta_data: captured(paid),
			} as never);
			const coupons = { context: context(percent), missing };
			const { writes, commitAtBoundary, queue } = await write(order, coupons);
			// 10 less 10% = 9, at or below the paid balance: the lines land, the total waits.
			expect(writes).toHaveLength(1);
			expect(writes[0]).toMatchObject({ coupon_lines: [{ code: 'ten' }] });
			for (const key of ['total', 'total_tax', 'discount_total', 'discount_tax'])
				expect(writes[0]).not.toHaveProperty(key);
			expect(commitAtBoundary).toHaveBeenCalledTimes(1);
			expect(commitAtBoundary).toHaveBeenCalledWith(order, queue, coupons, expect.anything());
			expect(commitAtBoundary.mock.calls[0][2]?.context).toBe(coupons.context);
		}
	);

	it('hands the boundary commit the revision its write landed', async () => {
		const order = record({
			...payload,
			status: 'pos-partial',
			meta_data: captured('9'),
		} as never);
		const { writes, commitAtBoundary } = await write(order, { context: context(percent), missing });
		// At the balance the write lands the coupon line on the unchanged product line.
		expect(writes).toEqual([{ coupon_lines: [{ code: 'ten' }] }]);
		const written = commitAtBoundary.mock.calls[0][3];
		expect({ line_items: written?.line_items, coupon_lines: written?.coupon_lines }).toEqual({
			line_items: [{ product_id: 1, subtotal: '10', total: '8' }],
			coupon_lines: [{ code: 'ten' }],
		});
	});

	it('settles a part-paid order a coupon is removed from in one write', async () => {
		// 10% of 20 = 2 and a fixed 2: 20 - 2 - 2 = 16, 4 of it paid.
		const order = record({
			...payload,
			status: 'pos-partial',
			total: '16',
			discount_total: '4',
			line_items: [{ product_id: 1, subtotal: '20', total: '16' }],
			coupon_lines: [
				{ code: 'ten', discount: '2' },
				{ code: 'two', discount: '2' },
			],
			meta_data: captured('4'),
		} as never);
		// The write drops the fixed_cart coupon and keeps the percent one.
		const { writes, commitAtBoundary } = await write(order, { context: context(percent), missing });
		// Without the fixed 2: 20 - 2 = 18, above the 4 paid.
		expect(writes).toEqual([
			expect.objectContaining({
				total: '18',
				discount_total: '2',
				line_items: [expect.objectContaining({ subtotal: '20', total: '18' })],
				coupon_lines: [expect.objectContaining({ code: 'ten', discount: '2' })],
			}),
		]);
		expect(commitAtBoundary).not.toHaveBeenCalled();
	});
});
