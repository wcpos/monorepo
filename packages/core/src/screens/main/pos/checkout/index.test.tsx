/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { CheckoutScreen } from './index';
import { getCheckoutModeSnapshot, resetCheckoutMode } from './checkout-mode';

let mockSize = 'lg';
let mockLoaded = true;
let mockUnsupported = false;
let mockCanDismiss = true;
const mockDismiss = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { canDismiss: () => mockCanDismiss, dismiss: mockDismiss, replace: mockReplace };
let mockParams: Record<string, string> = { orderId: 'a' };
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('expo-router', () => ({
	useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
	useLocalSearchParams: () => mockParams,
	useRouter: () => mockRouter,
}));
jest.mock('./checkout', () => ({ Checkout: () => <div data-testid="modal" /> }));
jest.mock('@wcpos/query/record-readers', () => ({ useEngineRecord: () => null }));
jest.mock('../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ loaded: mockLoaded, unsupportedSchema: mockUnsupported }),
}));
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => mockSize === 'sm',
}));
jest.mock('@wcpos/query', () => ({ useRecordField: jest.fn() }));
beforeEach(() => {
	resetCheckoutMode();
	mockSize = 'lg';
	mockLoaded = true;
	mockUnsupported = false;
	mockCanDismiss = true;
	mockDismiss.mockReset();
	mockReplace.mockReset();
	mockParams = { orderId: 'a' };
});
it('a wide sheet over a till pops to it and enters checkout', () => {
	mockCanDismiss = true;
	render(<CheckoutScreen />);
	expect(mockDismiss).toHaveBeenCalledTimes(1);
	expect(mockReplace).not.toHaveBeenCalled();
	expect(screen.queryByTestId('modal')).toBeNull();
	expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(true);
});
it('a wide deep link with nothing beneath is replaced by the columns cart in checkout', () => {
	mockCanDismiss = false;
	render(<CheckoutScreen />);
	expect(mockReplace).toHaveBeenCalledTimes(1);
	expect(mockDismiss).not.toHaveBeenCalled();
	expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(true);
	expect(mockReplace).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
		params: { orderId: ['a', 'checkout'] },
	});
});
it.each(['phone', 'legacy', 'unsupported'])('retains the %s modal', (lane) => {
	if (lane === 'phone') mockSize = 'sm';
	if (lane === 'legacy') mockLoaded = false;
	if (lane === 'unsupported') mockUnsupported = true;
	render(<CheckoutScreen />);
	expect(screen.getByTestId('modal')).not.toBeNull();
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	expect(mockDismiss).not.toHaveBeenCalled();
	expect(mockReplace).not.toHaveBeenCalled();
});
it('a standalone link opens the order itself, never the columns cart that holds only open orders', () => {
	// A refused reopen leaves the order completed: the columns cart could not resolve it.
	mockParams = { orderId: 'a', standalone: '1' };
	render(<CheckoutScreen />);
	expect(screen.getByTestId('modal')).not.toBeNull();
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	expect(mockDismiss).not.toHaveBeenCalled();
	expect(mockReplace).not.toHaveBeenCalled();
});
