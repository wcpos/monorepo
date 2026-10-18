/** @jest-environment jsdom */

import * as React from 'react';

import { act, renderHook } from '@testing-library/react';

import {
	OrderMoneyDivergenceProvider,
	useServerOwnsMoneyReader,
} from '../contexts/order-money-divergence';
import { useCartWrite } from './use-cart-write';
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

let listener: (event: { type: string; recordId?: string }) => void;
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

it.each([0, '1'])(
	'ownership latched at epoch 0 only holds while resident remains at %s',
	(next) => {
		epoch = 0;
		const { result } = renderHook(() => useServerOwnsMoneyReader(), {
			wrapper: OrderMoneyDivergenceProvider,
		});
		act(() => listener({ type: 'order-money-divergence', recordId: 'target' }));
		epoch = next;
		expect(result.current('target')).toBe(next === 0);
	}
);

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

it('cart writes without a session or money provider retain the unknown-contract hint rule', async () => {
	const { result } = renderHook(() => useCartWrite());
	const patch = await result.current.settleIntent(hintedOrder as never, { customer_note: 'saved' });
	expect(patch).toMatchObject({ customer_note: 'saved' });
	expect(patch).not.toHaveProperty('total');
});

it('cart writes read a newly resolved contract through the existing money context', async () => {
	let contract: string | null = null;
	const props = { storeContract: () => contract };
	const { result } = renderHook(() => useCartWrite(), {
		wrapper: ({ children }) => (
			<OrderMoneyDivergenceProvider {...props}>{children}</OrderMoneyDivergenceProvider>
		),
	});
	const write = result.current.settleIntent;
	expect(await write(hintedOrder as never, {})).not.toHaveProperty('total');
	contract = '1.3';
	expect(await write(hintedOrder as never, {})).toMatchObject({ total: '10' });
});
