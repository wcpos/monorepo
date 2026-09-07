/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { OpenOrders } from './index';

let mockPosition = 'bottom';
let mockIsNew = false;
let mockStage = 'cart';

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
jest.mock('./table', () => ({ CartTable: () => <div data-testid="cart-table" /> }));
jest.mock('./totals', () => ({ Totals: () => <div /> }));
jest.mock('./totals-changed-banner', () => ({ CartTotalsChangedBanner: () => <div /> }));
jest.mock('./cart-header', () => ({ CartHeader: () => <div /> }));
jest.mock('./buttons/add-note', () => ({ AddNoteButton: () => <div /> }));
jest.mock('./buttons/order-meta', () => ({ OrderMetaButton: () => <div /> }));
jest.mock('./buttons/pay', () => ({ PayButton: () => <div data-testid="checkout-button" /> }));
jest.mock('./buttons/save-order', () => ({ SaveButton: () => <div /> }));
jest.mock('./buttons/void', () => ({ VoidButton: () => <div /> }));
jest.mock('./tabs', () => ({ OpenOrderTabs: () => <div data-testid="open-orders" /> }));

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
jest.mock('@wcpos/components/button', () => ({ ButtonGroupSeparator: () => <div /> }));

describe('open orders position', () => {
	it.each(['draft', 'cart', 'checkout'])(
		'places the cart bar before/after the card (%s)',
		(stage) => {
			mockIsNew = stage === 'draft';
			mockStage = stage;
			mockPosition = 'top';
			const { rerender } = render(<OpenOrders isColumn />);
			if (stage === 'checkout') {
				expect(screen.queryByTestId('cart-table')).toBeNull();
				expect(screen.queryByTestId('checkout-button')).toBeNull();
			}
			expect(
				screen.getByTestId('open-orders').compareDocumentPosition(screen.getByTestId('cart-card'))
			).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

			mockPosition = 'bottom';
			rerender(<OpenOrders isColumn />);
			expect(
				screen.getByTestId('open-orders').compareDocumentPosition(screen.getByTestId('cart-card'))
			).toBe(Node.DOCUMENT_POSITION_PRECEDING);
		}
	);
});

jest.mock('../checkout/checkout-mode', () => ({
	useOrderCheckoutStage: (record: { isNew?: boolean }) => (record.isNew ? 'cart' : mockStage),
}));
jest.mock('./checkout-ledger', () => ({ CheckoutLedger: () => <div data-testid="cart-card" /> }));
