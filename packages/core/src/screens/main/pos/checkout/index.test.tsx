/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { CheckoutScreen } from './index';
import { getCheckoutModeSnapshot, resetCheckoutMode } from './checkout-mode';

let mockSize = 'lg';
let mockLoaded = true;
let mockUnsupported = false;
let mockHref: unknown;
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => ({ orderId: 'a' }),
	Redirect: ({ href }: { href: unknown }) => {
		mockHref = href;
		return <div data-testid="redirect" />;
	},
}));
jest.mock('./checkout', () => ({ Checkout: () => <div data-testid="modal" /> }));
jest.mock('../../hooks/use-engine-document', () => ({ useEngineRecord: () => null }));
jest.mock('../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ loaded: mockLoaded, unsupportedSchema: mockUnsupported }),
}));
jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockSize }) }));
jest.mock('@wcpos/query', () => ({ useRecordField: jest.fn() }));
beforeEach(() => {
	resetCheckoutMode();
	mockSize = 'lg';
	mockLoaded = true;
	mockUnsupported = false;
	mockHref = undefined;
});
it('turns a wide tender deep link into order mode and the columns route', () => {
	render(<CheckoutScreen />);
	expect(screen.getByTestId('redirect')).not.toBeNull();
	expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(true);
	expect(mockHref).toEqual({
		pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
		params: { orderId: ['a'] },
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
