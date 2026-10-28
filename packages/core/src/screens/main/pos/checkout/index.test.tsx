/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { CheckoutScreen } from './index';
import { getCheckoutModeSnapshot, resetCheckoutMode } from './checkout-mode';

let mockSize = 'lg';
let mockLoaded = true;
let mockUnsupported = false;
let mockHref: unknown;
let mockParams: Record<string, string> = { orderId: 'a' };
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockParams,
	Redirect: ({ href }: { href: unknown }) => {
		mockHref = href;
		return <div data-testid="redirect" />;
	},
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
	mockHref = undefined;
	mockParams = { orderId: 'a' };
});
it('turns a wide tender deep link into order mode and the columns route', () => {
	render(<CheckoutScreen />);
	expect(screen.getByTestId('redirect')).not.toBeNull();
	expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(true);
	expect(mockHref).toEqual({
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
});
it('a standalone link opens the order itself, never the columns cart that holds only open orders', () => {
	// A refused reopen leaves the order completed: the columns cart could not resolve it.
	mockParams = { orderId: 'a', standalone: '1' };
	render(<CheckoutScreen />);
	expect(screen.getByTestId('modal')).not.toBeNull();
	expect(mockHref).toBeUndefined();
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
});
