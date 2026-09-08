/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import {
	getCheckoutModeSnapshot,
	leaveCheckout,
	resetCheckoutMode,
	takeMethodSeed,
} from './checkout-mode';
import { useCheckoutUrlSeed } from './use-checkout-url-seed';

let mockSize = 'lg';
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockSize }) }));
jest.mock('@wcpos/query', () => ({ useRecordField: jest.fn() }));
beforeEach(() => {
	resetCheckoutMode();
	mockSize = 'lg';
	mockReplace.mockClear();
});
it('seeds wide checkout once per distinct seed, including across tab switches', () => {
	const { rerender } = renderHook(({ param }) => useCheckoutUrlSeed(param), {
		initialProps: { param: ['u', 'checkout', 'cash'] },
	});
	expect(getCheckoutModeSnapshot().checkoutOrders.has('u')).toBe(true);
	expect(takeMethodSeed('u')).toBe('cash');
	leaveCheckout('u');
	rerender({ param: ['u', 'checkout', 'cash'] });
	rerender({ param: [] });
	rerender({ param: ['u', 'checkout', 'cash'] });
	expect(getCheckoutModeSnapshot().checkoutOrders.has('u')).toBe(false);
	expect(takeMethodSeed('u')).toBeUndefined();
	rerender({ param: ['v', 'checkout'] });
	expect(getCheckoutModeSnapshot().checkoutOrders.has('v')).toBe(true);
});
it('routes phone checkout links to the sheet', () => {
	mockSize = 'sm';
	renderHook(() => useCheckoutUrlSeed(['u', 'checkout', 'cash']));
	expect(mockReplace).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
		params: { orderId: 'u' },
	});
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
});
it('ignores ordinary cart links', () => {
	renderHook(() => useCheckoutUrlSeed(['u']));
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	expect(mockReplace).not.toHaveBeenCalled();
});
