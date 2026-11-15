/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';

import type { CouponContext } from '@wcpos/order-math';

import {
	OrderMoneyDivergenceProvider,
	useServerOwnsMoneyReader,
} from '../contexts/order-money-divergence';
import { useCartWrite } from './use-cart-write';
import { settlePayload } from './settle-payload';
import { config } from '../../../../../jest/cart-write';

// Cart consumers may mock only useAppState, with no session provider.
jest.mock('../../../../contexts/app-state', () => ({ useAppState: () => ({}) }));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: jest.fn() }),
}));
jest.mock('./use-boundary-commit', () => ({ useBoundaryCommit: () => jest.fn() }));
jest.mock('../hooks/use-cart-config', () => ({
	useCartConfigReader: () => () => config,
}));

let listener: (event: { type: string; recordId?: string; renameOnly?: boolean }) => void;
let epoch: string | number = 0;
const engine = {
	active: () => ({
		database: {
			collections: {
				orders: {
					_docCache: {
						getLatestDocumentDataIfExists: () => ({
							payload: { meta_data: [{ key: '_wcpos_money_epoch', value: epoch }] },
						}),
					},
				},
			},
		},
	}),
	events: jest.fn((callback) => {
		listener = callback;
		return () => {};
	}),
};
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine }),
}));
it('reads ownership immediately from an event, before another render, and clears on scope switch', () => {
	const { result } = renderHook(() => useServerOwnsMoneyReader(), {
		wrapper: OrderMoneyDivergenceProvider,
	});
	const read = result.current;
	act(() => {
		listener({ type: 'order-money-divergence', recordId: 'target' });
		expect(read('target')).toBe(true);
		expect(read('other')).toBe(false);
		listener({ type: 'scope-switched' });
		expect(read('target')).toBe(false);
	});
});

it('rename-only ownership stops both shipping and coupon settlement patches', () => {
	const { result } = renderHook(() => useServerOwnsMoneyReader(), {
		wrapper: OrderMoneyDivergenceProvider,
	});
	const read = result.current;
	act(() => listener({ type: 'order-money-divergence', recordId: 'target', renameOnly: true }));
	expect(read('target')).toBe(true);
	const stale = {
		status: 'pos-open',
		total: '20',
		line_items: [{ product_id: 1, quantity: 1, total: '10', subtotal: '10' }],
	};
	const coupons: CouponContext = {
		coupons: new Map([['ten', { code: 'ten', discount_type: 'percent', amount: '10' }]]),
		productCategories: new Map(),
	};
	for (const input of [
		{ payload: { ...stale, shipping_lines: [{ method_id: 'flat_rate', total: '5' }] } },
		{ payload: { ...stale, coupon_lines: [{ code: 'ten' }] }, coupons },
	]) {
		expect(
			settlePayload({ ...input, config, owner: { uuid: 'target', serverOwnsMoney: read } })
		).toEqual({ kind: 'owned' });
		expect(
			settlePayload({ ...input, config, owner: { uuid: 'target', serverOwnsMoney: () => false } })
		).toMatchObject({ kind: 'patch' });
	}
});

it('ownership latched for an order survives a change to its _wcpos_money_epoch meta', () => {
	epoch = 0;
	const { result } = renderHook(() => useServerOwnsMoneyReader(), {
		wrapper: OrderMoneyDivergenceProvider,
	});
	act(() => listener({ type: 'order-money-divergence', recordId: 'target' }));
	epoch = '1';
	expect(result.current('target')).toBe(true);
});

const hintedOrder = {
	uuid: 'hinted',
	payload: {
		status: 'pos-open',
		line_items: [{ product_id: 1, subtotal: '10', total: '10' }],
		total: '99',
		meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }],
	},
	getLatest() {
		return this;
	},
};

it('cart writes without a session or money provider honour the durable hint', async () => {
	const { result } = renderHook(() => useCartWrite());
	const patch = await result.current.settleIntent(hintedOrder as never, { customer_note: 'saved' });
	expect(patch).toMatchObject({ customer_note: 'saved' });
	expect(patch).not.toHaveProperty('total');
});
