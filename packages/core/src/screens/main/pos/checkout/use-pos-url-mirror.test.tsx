/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import {
	enterCheckout,
	enterReceipt,
	leaveCheckout,
	resetCheckoutMode,
	setTenderMethod,
} from './checkout-mode';
import { usePosUrlMirror } from './use-pos-url-mirror';

let mockSize = 'lg';
const mockRecord = { uuid: 'u', isNew: false, payload: { meta_data: [] } };
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: true } }));
let mockSegments: string[] = ['(app)', '(drawer)', '(pos)', '(columns)', 'cart', '[...orderId]'];
jest.mock('expo-router', () => ({ useRouter: () => ({}), useSegments: () => mockSegments }));
jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockSize }) }));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockRecord }),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(record: T, select: (value: T) => unknown) => select(record),
}));

beforeEach(() => {
	resetCheckoutMode();
	mockSize = 'lg';
	mockSegments = ['(app)', '(drawer)', '(pos)', '(columns)', 'cart', '[...orderId]'];
	mockRecord.isNew = false;
	window.history.replaceState(null, '', '/');
	jest.useFakeTimers();
	jest.spyOn(window.history, 'replaceState');
	jest
		.spyOn(window, 'requestAnimationFrame')
		.mockImplementation((callback) => window.setTimeout(() => callback(0), 0));
	jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(window.clearTimeout);
});
afterEach(() => {
	jest.restoreAllMocks();
	jest.useRealTimers();
});
const flush = () => act(() => jest.runOnlyPendingTimers());

it('mirrors cart, checkout, method, leave, and receipt state', () => {
	renderHook(usePosUrlMirror);
	flush();
	expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/cart/u');
	act(() => enterCheckout('u'));
	flush();
	expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/cart/u/checkout');
	act(() => setTenderMethod('u', 'cash'));
	flush();
	expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/cart/u/checkout/cash');
	act(() => leaveCheckout('u'));
	flush();
	expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/cart/u');
	act(() => enterReceipt('r'));
	flush();
	expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/cart/receipt/r');
});
it.each([
	[
		'phone checkout sheet',
		['(app)', '(drawer)', '(pos)', '(modals)', 'cart', '[orderId]', 'checkout'],
	],
	[
		'cold receipt modal',
		['(app)', '(drawer)', '(pos)', '(modals)', 'cart', 'receipt', '[orderId]'],
	],
])('does not write while a routed modal owns the URL (%s)', (_label, segments) => {
	mockSegments = segments;
	window.history.replaceState(null, '', '/cart/receipt/u');
	renderHook(usePosUrlMirror);
	flush();
	expect(window.history.replaceState).toHaveBeenCalledTimes(1);
	expect(window.location.pathname).toBe('/cart/receipt/u');
});
it('omits draft ids and cancels a stale frame', () => {
	const { rerender } = renderHook(usePosUrlMirror);
	mockRecord.isNew = true;
	rerender();
	flush();
	expect(window.history.replaceState).toHaveBeenCalledTimes(1);
	expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/cart');
});
