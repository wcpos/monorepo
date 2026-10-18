/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';

import {
	OrderMoneyDivergenceProvider,
	useServerOwnsMoneyReader,
} from '../contexts/order-money-divergence';
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
