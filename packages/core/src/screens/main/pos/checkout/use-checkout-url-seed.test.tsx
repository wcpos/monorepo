/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { getCheckoutModeSnapshot, leaveCheckout, resetCheckoutMode } from './checkout-mode';
import { useCheckoutUrlSeed } from './use-checkout-url-seed';

let mockSize = 'lg';
const mockReplace = jest.fn();
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockSize }) }));
jest.mock('@wcpos/query', () => ({ useRecordField: jest.fn() }));
let mockLoaded = true;
let mockUnsupported = false;
jest.mock('../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ loaded: mockLoaded, unsupportedSchema: mockUnsupported }),
}));
beforeEach(() => {
	resetCheckoutMode();
	mockSize = 'lg';
	mockLoaded = true;
	mockUnsupported = false;
	mockReplace.mockClear();
});
it('seeds wide checkout once per distinct seed, including across tab switches', () => {
	const { rerender } = renderHook(({ param }) => useCheckoutUrlSeed(param), {
		initialProps: { param: ['u', 'checkout', 'cash'] },
	});
	expect(getCheckoutModeSnapshot().checkoutOrders.has('u')).toBe(true);
	expect(getCheckoutModeSnapshot().tenderMethods.get('u')).toBe('cash');
	leaveCheckout('u');
	rerender({ param: ['u', 'checkout', 'cash'] });
	rerender({ param: [] });
	rerender({ param: ['u', 'checkout', 'cash'] });
	expect(getCheckoutModeSnapshot().checkoutOrders.has('u')).toBe(false);
	expect(getCheckoutModeSnapshot().tenderMethods.has('u')).toBe(false);
	rerender({ param: ['v', 'checkout'] });
	expect(getCheckoutModeSnapshot().checkoutOrders.has('v')).toBe(true);
});
it('routes phone checkout links to the sheet and still seeds the store', () => {
	mockSize = 'sm';
	renderHook(() => useCheckoutUrlSeed(['u', 'checkout', 'cash']));
	expect(mockReplace).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
		params: { orderId: 'u' },
	});
	expect(getCheckoutModeSnapshot().checkoutOrders.has('u')).toBe(true);
	expect(getCheckoutModeSnapshot().tenderMethods.get('u')).toBe('cash');
});
it('waits for the payment-methods contract before seeding', () => {
	mockLoaded = false;
	const { rerender } = renderHook(() => useCheckoutUrlSeed(['u', 'checkout', 'cash']));
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	mockLoaded = true;
	rerender();
	expect(getCheckoutModeSnapshot().checkoutOrders.has('u')).toBe(true);
});
it('sends a store without the contract to the legacy modal without seeding', () => {
	mockUnsupported = true;
	renderHook(() => useCheckoutUrlSeed(['u', 'checkout', 'cash']));
	expect(mockReplace).toHaveBeenCalledTimes(1);
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	expect(getCheckoutModeSnapshot().tenderMethods.size).toBe(0);
});
it('ignores ordinary cart links', () => {
	renderHook(() => useCheckoutUrlSeed(['u']));
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	expect(mockReplace).not.toHaveBeenCalled();
});
