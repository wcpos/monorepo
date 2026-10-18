/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';

import {
	OrderMoneyDivergenceProvider,
	useServerOwnsMoneyReader,
} from '../contexts/order-money-divergence';
let listener: (event: { type: string; recordId?: string }) => void;
const engine = {
	events: jest.fn((callback) => {
		listener = callback;
		return () => {};
	}),
};
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({ engine }) }));
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

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	findEngineResident: async () => null,
}));
