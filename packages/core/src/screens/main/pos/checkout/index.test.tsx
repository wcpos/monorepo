/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { CheckoutScreen } from './index';
import { getCheckoutModeSnapshot, markOrderSaving, resetCheckoutMode } from './checkout-mode';
import { tillCartHref } from './till-route';

let mockSize = 'lg';
let mockLoaded = true;
let mockUnsupported = false;
let mockCanDismiss = true;
const mockDismiss = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { canDismiss: () => mockCanDismiss, dismiss: mockDismiss, replace: mockReplace };
let mockParams: Record<string, string> = { orderId: 'a' };
let mockBeneath = '(columns)/cart/[...orderId]';
const mockNavigation = {
	getState: () => ({ index: 1, routes: [{ name: mockBeneath }, { name: 'checkout' }] }),
};
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('expo-router', () => ({
	useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
	useLocalSearchParams: () => mockParams,
	useNavigation: () => mockNavigation,
	useRouter: () => mockRouter,
}));
jest.mock('./checkout', () => ({ Checkout: () => <div data-testid="modal" /> }));
// The order's record as `useEngineRecord` answers it: undefined until it resolves. By default an
// order the store has created, so the lanes above the bounce behave as before.
// `read()` is what `useFirstAnswer` asks while there is no value: a pending thenable while
// unresolved, the failure itself once the record has failed before its first answer.
const resourceOf = (serverId?: number | 'unresolved' | 'failed') => {
	const value =
		serverId === 'unresolved' || serverId === 'failed'
			? undefined
			: { current: { payload: { id: serverId } } };
	const pending = new Promise<never>(() => {});
	return {
		valueRef$$: new BehaviorSubject(value),
		read: () => {
			if (serverId === 'unresolved') throw pending;
			if (serverId === 'failed') throw new Error('the order record failed');
			return value;
		},
	};
};
let mockResource = resourceOf(42);
jest.mock('@wcpos/query/record-readers', () => ({ useEngineRecord: () => mockResource }));
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
	mockBeneath = '(columns)/cart/[...orderId]';
	mockResource = resourceOf(42);
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
it('a wide sheet over the anchor is replaced by the columns checkout even when it can dismiss', () => {
	mockBeneath = 'index';
	mockCanDismiss = true;
	render(<CheckoutScreen />);
	expect(mockDismiss).not.toHaveBeenCalled();
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
// A legacy Pay pushes this sheet only once `pushRecord` has resolved, and its `finally` then
// clears the save state: the sheet decides on a record that already carries the server id
// (`warm-pay-server-id.test.tsx` proves that answer on a real engine), with nothing saving.
it.each([
	['unsupported', 'wide'],
	['unsupported', 'phone'],
	['legacy', 'wide'],
	['legacy', 'phone'],
])('a %s %s Pay with no save state left lands in checkout, never its cart', (lane, size) => {
	if (lane === 'legacy') mockLoaded = false;
	if (lane === 'unsupported') mockUnsupported = true;
	if (size === 'phone') mockSize = 'sm';
	mockCanDismiss = false;
	mockBeneath = 'index';
	render(<CheckoutScreen />);
	expect(screen.getByTestId('modal')).not.toBeNull();
	expect(mockReplace).not.toHaveBeenCalled();
	expect(mockDismiss).not.toHaveBeenCalled();
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
describe('a cold load of an order the store has not created, with no save of its own', () => {
	beforeEach(() => {
		mockResource = resourceOf(undefined);
		mockCanDismiss = false;
		mockBeneath = 'index';
	});
	it('wide: goes back to its cart instead of entering checkout', () => {
		render(<CheckoutScreen />);
		expect(mockReplace).toHaveBeenCalledTimes(1);
		expect(mockReplace).toHaveBeenCalledWith(tillCartHref(false, 'a'));
		expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(false);
	});
	it('phone: goes back to its cart instead of rendering the sheet', () => {
		mockSize = 'sm';
		render(<CheckoutScreen />);
		expect(screen.queryByTestId('modal')).toBeNull();
		expect(mockReplace).toHaveBeenCalledTimes(1);
		expect(mockReplace).toHaveBeenCalledWith(tillCartHref(true, 'a'));
		expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(false);
	});
	it('phone: Pay in flight still opens the sheet', () => {
		mockSize = 'sm';
		markOrderSaving('a');
		render(<CheckoutScreen />);
		expect(screen.getByTestId('modal')).not.toBeNull();
		expect(mockReplace).not.toHaveBeenCalled();
		expect(mockDismiss).not.toHaveBeenCalled();
	});
});
it('a wide cold load of an order the store has created enters checkout in the columns', () => {
	mockCanDismiss = false;
	render(<CheckoutScreen />);
	expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(true);
	expect(mockReplace).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
		params: { orderId: ['a', 'checkout'] },
	});
});
it('decides nothing while the order record is unresolved', () => {
	mockResource = resourceOf('unresolved');
	render(<CheckoutScreen />);
	expect(screen.queryByTestId('modal')).toBeNull();
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	expect(mockReplace).not.toHaveBeenCalled();
	expect(mockDismiss).not.toHaveBeenCalled();
});
// The record failed (or completed empty) before its first answer: the screen hands it on as
// main did, never holding a blank sheet; the reader's `read()` rethrows into its boundary.
describe('a record that fails before its first answer', () => {
	beforeEach(() => {
		mockResource = resourceOf('failed');
		mockCanDismiss = false;
		mockBeneath = 'index';
	});
	it.each(['wide legacy', 'phone'])(
		'%s: mounts the checkout, never bounced to its cart',
		(lane) => {
			if (lane === 'phone') mockSize = 'sm';
			if (lane === 'wide legacy') mockLoaded = false;
			render(<CheckoutScreen />);
			expect(screen.getByTestId('modal')).not.toBeNull();
			expect(mockReplace).not.toHaveBeenCalled();
			expect(mockDismiss).not.toHaveBeenCalled();
		}
	);
	it('wide: enters the columns checkout, whose reader rethrows, never its cart', () => {
		render(<CheckoutScreen />);
		expect(mockReplace).toHaveBeenCalledTimes(1);
		expect(mockReplace).toHaveBeenCalledWith({
			pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
			params: { orderId: ['a', 'checkout'] },
		});
		expect(getCheckoutModeSnapshot().checkoutOrders.has('a')).toBe(true);
	});
});
