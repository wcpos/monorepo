/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import type { QueryHandle, QueryResult } from '@wcpos/query';

import { getCheckoutModeSnapshot, leaveCheckout, resetCheckoutMode } from './checkout-mode';
import { readCheckoutSeed } from './pos-url';
import { tillCartHref } from './till-route';
import { useCheckoutUrlSeed } from './use-checkout-url-seed';

let mockSize = 'lg';
const mockReplace = jest.fn();
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => mockSize === 'sm',
}));
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
	const { rerender } = renderHook(({ param }) => useCheckoutUrlSeed(readCheckoutSeed(param)), {
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
	renderHook(() => useCheckoutUrlSeed(readCheckoutSeed(['u', 'checkout', 'cash'])));
	expect(mockReplace).toHaveBeenCalledWith({
		pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
		params: { orderId: 'u' },
	});
	expect(getCheckoutModeSnapshot().checkoutOrders.has('u')).toBe(true);
	expect(getCheckoutModeSnapshot().tenderMethods.get('u')).toBe('cash');
});
it('waits for the payment-methods contract before seeding', () => {
	mockLoaded = false;
	const { rerender } = renderHook(() =>
		useCheckoutUrlSeed(readCheckoutSeed(['u', 'checkout', 'cash']))
	);
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	mockLoaded = true;
	rerender();
	expect(getCheckoutModeSnapshot().checkoutOrders.has('u')).toBe(true);
});
it('sends a store without the contract to the legacy modal without seeding', () => {
	mockUnsupported = true;
	renderHook(() => useCheckoutUrlSeed(readCheckoutSeed(['u', 'checkout', 'cash'])));
	expect(mockReplace).toHaveBeenCalledTimes(1);
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	expect(getCheckoutModeSnapshot().tenderMethods.size).toBe(0);
});
it('ignores ordinary cart links', () => {
	renderHook(() => useCheckoutUrlSeed(readCheckoutSeed(['u'])));
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	expect(mockReplace).not.toHaveBeenCalled();
});
type Hit = { id: string; serverId?: number };
const snapshotOf = (hits: Hit[] | null) => ({
	ready: hits !== null,
	hits: (hits ?? []).map(({ id, serverId }) => ({ id, record: { payload: { id: serverId } } })),
});
function openOrders(hits: Hit[] | null) {
	const listeners = new Set<() => void>();
	let value = snapshotOf(hits);
	const handle = {
		get value() {
			return value;
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	} as unknown as QueryHandle<QueryResult>;
	const answer = (next: Hit[]) => {
		value = snapshotOf(next);
		listeners.forEach((listener) => listener());
	};
	return { handle, answer };
}
it.each(['lg', 'sm'])(
	'sends a reloaded checkout for an order the store has not created back to its cart (%s)',
	(size) => {
		mockSize = size;
		const { handle } = openOrders([{ id: 'u' }]);
		renderHook(() => useCheckoutUrlSeed(readCheckoutSeed(['u', 'checkout', 'cash']), handle));
		expect(mockReplace).toHaveBeenCalledTimes(1);
		expect(mockReplace).toHaveBeenCalledWith(tillCartHref(size === 'sm', 'u'));
		expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
		expect(getCheckoutModeSnapshot().tenderMethods.size).toBe(0);
	}
);
it('enters checkout from a reload for an order the store has created', () => {
	const { handle } = openOrders([{ id: 'u', serverId: 42 }]);
	renderHook(() => useCheckoutUrlSeed(readCheckoutSeed(['u', 'checkout', 'cash']), handle));
	expect(getCheckoutModeSnapshot().checkoutOrders.has('u')).toBe(true);
	expect(getCheckoutModeSnapshot().tenderMethods.get('u')).toBe('cash');
	expect(mockReplace).not.toHaveBeenCalled();
});
it('waits for the order record before entering or redirecting', () => {
	const { handle, answer } = openOrders(null);
	const { rerender } = renderHook(() =>
		useCheckoutUrlSeed(readCheckoutSeed(['u', 'checkout']), handle)
	);
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
	expect(mockReplace).not.toHaveBeenCalled();
	act(() => answer([{ id: 'u' }]));
	rerender();
	expect(mockReplace).toHaveBeenCalledTimes(1);
	expect(mockReplace).toHaveBeenCalledWith(tillCartHref(false, 'u'));
	expect(getCheckoutModeSnapshot().checkoutOrders.size).toBe(0);
});
