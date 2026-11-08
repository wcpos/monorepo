/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { enterCheckout, getOrderSaveState, leaveCheckout } from '../checkout/checkout-mode';
import { useOrderLockReaders } from './use-order-lock-readers';

let owns = jest.fn(() => false);
jest.mock('../contexts/order-money-divergence', () => ({ useServerOwnsMoneyReader: () => owns }));

it('reads the locks at call time and keeps its identity until the money reader changes', () => {
	const { result, rerender } = renderHook(() => useOrderLockReaders());
	const readers = result.current;
	expect(readers.serverOwnsMoney).toBe(owns);
	expect(readers.orderSaveState).toBe(getOrderSaveState);
	expect(readers.inCheckout('a')).toBe(false);
	enterCheckout('a');
	try {
		expect(readers.inCheckout('a')).toBe(true);
	} finally {
		leaveCheckout('a');
	}
	rerender();
	expect(result.current).toBe(readers);
	owns = jest.fn(() => true);
	rerender();
	expect(result.current).not.toBe(readers);
	expect(result.current.serverOwnsMoney('a')).toBe(true);
});
