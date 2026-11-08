import { settleAggregate, settlementPatch, snapshotFromOrderJSON } from '@wcpos/order-math';
import type { CouponContext } from '@wcpos/order-math';

import { config as baseConfig } from '../../../../../jest/cart-write';
import { cartConfigForOrder, type OrderPayload } from './cart-config-for-order';
import { settlePayload } from './settle-payload';

const owner = { uuid: 'a', serverOwnsMoney: () => false };
const leg = (status: string, amount: string) => ({
	key: '_wcpos_payments',
	value: { schema: 1, payments: [{ id: 'leg', status, amount, refunded_amount: '0' }] },
});
const stale: OrderPayload = {
	status: 'pos-open',
	total: '20',
	line_items: [{ product_id: 1, quantity: 1, total: '10', subtotal: '10' }],
};
const settled = {
	...stale,
	...settlementPatch(settleAggregate(snapshotFromOrderJSON(stale), baseConfig)),
} as OrderPayload;
const coupons = (taxStatusFor?: CouponContext['taxStatusFor']): CouponContext => ({
	coupons: new Map([['ten', { code: 'ten', discount_type: 'percent', amount: '10' }]]),
	productCategories: new Map(),
	taxStatusFor,
});

it.each<[string, OrderPayload, Partial<typeof owner>, CouponContext | undefined, object]>([
	[
		'owned: durable server hint',
		{ ...stale, meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }] },
		{},
		undefined,
		{ kind: 'owned' },
	],
	[
		'owned: the divergence reader',
		stale,
		{ serverOwnsMoney: () => true },
		undefined,
		{ kind: 'owned' },
	],
	[
		'owned: a live settlement leg',
		{ ...stale, meta_data: [leg('pending', '10')] },
		{},
		undefined,
		{ kind: 'owned' },
	],
	['unchanged', settled, {}, undefined, { kind: 'unchanged', warnings: [] }],
	[
		'patch',
		stale,
		{},
		undefined,
		{ kind: 'patch', changes: expect.objectContaining({ total: '10' }), warnings: [] },
	],
	[
		'boundary',
		{ ...stale, status: 'pos-partial', meta_data: [leg('captured', '10')] },
		{},
		undefined,
		{
			kind: 'boundary',
			changes: expect.objectContaining({ total: '10' }),
			netPaid: 10,
			warnings: [],
		},
	],
	[
		'error: a coupon missing from the context',
		{ ...stale, coupon_lines: [{ code: 'missing' }] },
		{},
		coupons(),
		{ kind: 'error', error: expect.objectContaining({ code: 'missing_coupon' }), warnings: [] },
	],
	[
		'patch: a coupon cart through its context',
		{ ...stale, coupon_lines: [{ code: 'ten' }] },
		{},
		coupons(),
		{
			kind: 'patch',
			changes: expect.objectContaining({ total: '9', discount_total: '1' }),
			warnings: [],
		},
	],
])('%s', (_name, payload, readers, context, expected) => {
	expect(
		settlePayload({
			payload,
			config: baseConfig,
			coupons: context,
			owner: { ...owner, ...readers },
		})
	).toEqual(expected);
});

// One envelope for every caller: the coupon context's catalog tax statuses reach the replay.
it.each([
	['taxable', '1'],
	['none', '0'],
] as const)('a coupon cart settles with the context tax status (%s)', (status, tax) => {
	const payload: OrderPayload = {
		status: 'pos-open',
		billing: { country: 'AU' },
		shipping: { country: 'AU' },
		line_items: [{ product_id: 1, quantity: 1, subtotal: '11.11', total: '11.11' }],
		coupon_lines: [{ code: 'ten' }],
	};
	const config = cartConfigForOrder({
		settings: { ...baseConfig, calcTaxes: true, priceNumDecimals: 2, taxBasedOn: 'shipping' },
		rates: [{ id: 1, country: 'AU', rate: '10', class: 'standard', shipping: true, priority: 1 }],
		baseLocation: { country: 'AU' },
		order: payload,
	} as never);
	const outcome = settlePayload({ payload, config, coupons: coupons(() => status), owner });
	expect(outcome).toMatchObject({ kind: 'patch', changes: { total_tax: tax } });
});
