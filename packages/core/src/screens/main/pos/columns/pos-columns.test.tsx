/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { POSColumns } from './pos-columns';

let mockPosition = 'left';
let mockStage = 'cart';
let mockReceipt: string | null = null;
let mockIsNew = false;
const mockPatchUI = jest.fn();
type PanelProps = { children?: React.ReactNode; testID?: string; defaultSize?: number };

jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { position: mockPosition, width: 60 },
		patchUI: mockPatchUI,
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
// The real registration module populates the real slot registry with these panels.
jest.mock('../cart', () => ({ OpenOrders: () => <div data-testid="open-orders-strip" /> }));
jest.mock('../products', () => ({ POSProducts: () => <div data-testid="products" /> }));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: { uuid: 'a', isNew: mockIsNew, payload: {} } }),
}));
jest.mock('../checkout/checkout-mode', () => ({
	useCheckoutMode: () => ({ selectedReceiptOrder: mockReceipt }),
	useOrderCheckoutStage: (record: { isNew?: boolean }) => (record.isNew ? 'cart' : mockStage),
}));
jest.mock('../checkout/tender/use-tender-flow', () => ({ useTenderFlow: () => ({ dp: 2 }) }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../checkout/column/checkout-column', () => ({
	CheckoutColumn: () => <div data-testid="checkout-tender-pane" />,
}));
jest.mock('../checkout/receipt-stage/receipt-stage', () => ({
	ReceiptStage: ({ orderUuid }: { orderUuid: string }) => (
		<div data-testid="checkout-receipt-stage">{orderUuid}</div>
	),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: ({ children }: PanelProps) => <div>{children}</div> },
	FadeIn: { duration: () => ({}) },
	FadeOut: { duration: () => ({}) },
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/panels', () => ({
	Panel: ({ children, testID, defaultSize }: PanelProps) => (
		<div data-testid={testID} data-default-size={defaultSize}>
			{children}
		</div>
	),
	PanelGroup: ({ children }: PanelProps) => <div>{children}</div>,
	PanelResizeHandle: ({ testID }: PanelProps) => <div data-testid={testID} />,
}));

describe('POSColumns', () => {
	beforeEach(() => {
		mockStage = 'cart';
		mockReceipt = null;
		mockIsNew = false;
		mockPosition = 'left';
	});
	it.each(['left', 'right'])('swaps only the products content at %s', (position) => {
		mockPosition = position;
		const { rerender } = render(<POSColumns />);
		expect(screen.getByTestId('products')).not.toBeNull();
		const cartPanel = screen.getByTestId('pos-cart-panel');
		const productsPanel = screen.getByTestId('pos-products-panel');
		mockStage = 'checkout';
		rerender(<POSColumns />);
		expect(screen.getByTestId('pos-cart-panel')).toBe(cartPanel);
		expect(screen.getByTestId('pos-products-panel')).toBe(productsPanel);
		expect(screen.queryByTestId('products')).toBeNull();
		expect(
			screen.getByTestId('pos-cart-panel').contains(screen.getByTestId('open-orders-strip'))
		).toBe(true);
		expect(
			screen.getByTestId('pos-products-panel').contains(screen.getByTestId('checkout-tender-pane'))
		).toBe(true);
		expect(screen.getAllByTestId(/^pos-.*-panel$/).map((el) => el.dataset.testid)).toEqual(
			position === 'right'
				? ['pos-cart-panel', 'pos-products-panel']
				: ['pos-products-panel', 'pos-cart-panel']
		);
	});
	it('hosts the selected paid order even when the current order is a new draft', () => {
		mockIsNew = true;
		mockReceipt = 'paid-order';
		const { rerender } = render(<POSColumns />);
		expect(
			screen
				.getByTestId('pos-products-panel')
				.contains(screen.getByTestId('checkout-receipt-stage'))
		).toBe(true);
		expect(screen.getByTestId('checkout-receipt-stage').textContent).toBe('paid-order');
		mockReceipt = null;
		rerender(<POSColumns />);
		expect(screen.queryByTestId('checkout-receipt-stage')).toBeNull();
		expect(screen.getByTestId('products')).not.toBeNull();
	});
	it('never enters checkout for the new-order placeholder', () => {
		mockIsNew = true;
		mockStage = 'checkout';
		render(<POSColumns />);
		expect(screen.getByTestId('products')).not.toBeNull();
		expect(screen.queryByTestId('checkout-tender-pane')).toBeNull();
	});
	it('reverses the registered panels when products move right, keeping complementary sizes', () => {
		mockPosition = 'left';
		const { rerender } = render(<POSColumns />);
		const panelOrder = () => screen.getAllByTestId(/^pos-.*-panel$/).map((el) => el.dataset.testid);
		expect(panelOrder()).toEqual(['pos-products-panel', 'pos-cart-panel']);

		mockPosition = 'right';
		rerender(<POSColumns />);
		expect(panelOrder()).toEqual(['pos-cart-panel', 'pos-products-panel']);
		expect(screen.getByTestId('pos-products-panel').dataset.defaultSize).toBe('60');
		expect(screen.getByTestId('pos-cart-panel').dataset.defaultSize).toBe('40');
		expect(
			screen
				.getByTestId('pos-cart-panel')
				.compareDocumentPosition(screen.getByTestId('pos-resize-handle'))
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(
			screen
				.getByTestId('pos-resize-handle')
				.compareDocumentPosition(screen.getByTestId('pos-products-panel'))
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
	});
});
