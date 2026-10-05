/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { OpenOrders } from './index';

let mockPosition = 'bottom';
let mockIsNew = false;
let mockStage = 'cart';

jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('./register-bar', () => ({ RegisterBar: () => null }));
jest.mock('./register-picker', () => ({ RegisterPicker: () => null }));
jest.mock('./open-register-card', () => ({
	OpenRegisterCard: () => <div data-testid="open-register-card" />,
}));
jest.mock('./register-count', () => ({ RegisterCount: () => null }));
jest.mock('./closure-sheet', () => ({ ClosureSheet: () => null }));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ status: 'bound', registers: [] }),
}));
let mockSession: { session: unknown; sessionsOn: boolean; loaded?: boolean } = {
	session: null,
	sessionsOn: false,
};
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({ loaded: true, ...mockSession, overdue: false }),
}));
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { openOrdersPosition: mockPosition } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'order-1', isNew: mockIsNew } }),
}));
jest.mock('../hooks/use-cart-settlement', () => ({ useCartSettlement: () => undefined }));
jest.mock('./v2/table', () => ({ CartTable: () => <div data-testid="cart-table" /> }));
jest.mock('./totals', () => ({ Totals: () => <div /> }));
jest.mock('./totals-changed-banner', () => ({ CartTotalsChangedBanner: () => <div /> }));
jest.mock('./v2/cart-header', () => ({ CartHeader: () => <div data-testid="cart-header" /> }));
jest.mock('./v2/foot', () => ({ CartFoot: () => <div data-testid="checkout-button" /> }));
jest.mock('./v2/order-sheet', () => ({ OrderSheet: () => null }));
jest.mock('./v2/tabs', () => ({
	OpenOrderTabs: ({ onCoverChange }: { onCoverChange: (covered: boolean) => void }) => (
		<button data-testid="open-orders" onClick={() => onCoverChange(true)} />
	),
}));

// Keep the slot and its registration real; replace native chrome and data-heavy children.
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="cart-card">{children}</div>
	),
	CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonGroupSeparator: () => <div />,
	Button: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

describe('open orders position', () => {
	it.each(['draft', 'cart', 'checkout'])(
		'places the cart bar before/after the card (%s)',
		(stage) => {
			mockIsNew = stage === 'draft';
			mockStage = stage;
			mockPosition = 'top';
			const { rerender } = render(<OpenOrders isColumn />);
			// The frame is now a View, not Card. Keep comparing the whole cart surface.
			const cartSurface = () =>
				stage === 'checkout'
					? screen.getByTestId('cart-card')
					: screen.getByTestId('cart-header').parentElement!;
			if (stage === 'checkout') {
				expect(screen.queryByTestId('cart-table')).toBeNull();
				expect(screen.queryByTestId('checkout-button')).toBeNull();
			}
			expect(screen.getByTestId('open-orders').compareDocumentPosition(cartSurface())).toBe(
				Node.DOCUMENT_POSITION_FOLLOWING
			);

			mockPosition = 'bottom';
			rerender(<OpenOrders isColumn />);
			expect(screen.getByTestId('open-orders').compareDocumentPosition(cartSurface())).toBe(
				Node.DOCUMENT_POSITION_PRECEDING
			);
		}
	);
});

jest.mock('../checkout/checkout-mode', () => ({
	useOrderCheckoutStage: (record: { isNew?: boolean }) => (record.isNew ? 'cart' : mockStage),
}));
jest.mock('./checkout-ledger', () => ({ CheckoutLedger: () => <div data-testid="cart-card" /> }));

it('hides the open-order tabs while the register is closed or counting', () => {
	mockIsNew = false;
	mockStage = 'cart';
	mockPosition = 'top';
	mockSession = { session: null, sessionsOn: true };
	try {
		const { rerender } = render(<OpenOrders isColumn />);
		expect(screen.queryByTestId('open-orders')).toBeNull();
		mockSession = { session: { id: 's', status: 'counting' }, sessionsOn: true };
		rerender(<OpenOrders isColumn />);
		expect(screen.queryByTestId('open-orders')).toBeNull();
		mockSession = { session: { id: 's', status: 'open' }, sessionsOn: true };
		rerender(<OpenOrders isColumn />);
		expect(screen.getByTestId('open-orders')).toBeTruthy();
	} finally {
		mockSession = { session: null, sessionsOn: false };
	}
});

it('shows neither the Open register card nor the cart until the session has loaded', () => {
	mockIsNew = false;
	mockStage = 'cart';
	mockPosition = 'top';
	mockSession = { session: null, sessionsOn: true, loaded: false };
	try {
		const { rerender } = render(<OpenOrders isColumn />);
		expect(screen.getByTestId('cart-column-loading')).toBeTruthy();
		expect(screen.queryByTestId('open-register-card')).toBeNull();
		expect(screen.queryByTestId('cart-header')).toBeNull();
		expect(screen.queryByTestId('open-orders')).toBeNull();
		mockSession = { session: { id: 's', status: 'open' }, sessionsOn: true, loaded: true };
		rerender(<OpenOrders isColumn />);
		expect(screen.queryByTestId('cart-column-loading')).toBeNull();
		expect(screen.queryByTestId('open-register-card')).toBeNull();
		expect(screen.getByTestId('cart-header')).toBeTruthy();
		mockSession = { session: null, sessionsOn: true, loaded: true };
		rerender(<OpenOrders isColumn />);
		expect(screen.getByTestId('open-register-card')).toBeTruthy();
	} finally {
		mockSession = { session: null, sessionsOn: false };
	}
});

it('takes the covered cart out of the tab order and the accessibility tree while the list is open', () => {
	mockIsNew = false;
	mockStage = 'cart';
	render(<OpenOrders isColumn />);
	const body = screen.getByTestId('cart-column-body');
	expect(body.getAttribute('aria-hidden')).not.toBe('true');
	expect(body.hasAttribute('inert')).toBe(false);
	fireEvent.click(screen.getByTestId('open-orders'));
	expect(body.getAttribute('aria-hidden')).toBe('true');
	expect(body.hasAttribute('inert')).toBe(true);
	// The strip itself stays reachable: it is how the list is closed.
	expect(body.contains(screen.getByTestId('open-orders'))).toBe(false);
});
