/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { POSColumns } from './pos-columns';

let mockPosition = 'right';
let mockStage = 'cart';
let mockAutoShow = true;
let mockReceipt: string | null = null;
let mockIsNew = false;
const mockPatchUI = jest.fn();
type PanelProps = { children?: React.ReactNode; testID?: string; defaultSize?: number };

jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: (id: string) =>
		id === 'pos-cart'
			? { uiSettings: { position: mockPosition, autoShowReceipt: mockAutoShow } }
			: { uiSettings: { width: 60 }, patchUI: mockPatchUI },
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
	Easing: { bezier: jest.fn() },
	__esModule: true,
	default: { View: ({ children }: PanelProps) => <div>{children}</div> },
	FadeIn: { duration: () => ({}) },
	FadeOut: { duration: () => ({}) },
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// iPad-like insets: a status bar at the top and a home indicator at the bottom.
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 20, left: 0 }),
}));
jest.mock('@wcpos/components/panels', () => ({
	Panel: ({ children, testID, defaultSize, style }: PanelProps & { style?: object }) => (
		<div data-testid={testID} data-default-size={defaultSize} data-style={JSON.stringify(style)}>
			{children}
		</div>
	),
	PanelGroup: ({ children }: PanelProps) => <div>{children}</div>,
	PanelResizeHandle: ({ testID }: PanelProps) => <div data-testid={testID} />,
}));

describe('POSColumns', () => {
	beforeEach(() => {
		mockStage = 'cart';
		mockAutoShow = true;
		mockReceipt = null;
		mockIsNew = false;
		mockPosition = 'right';
	});
	it.each(['left', 'right'])('swaps only the products content with cart at %s', (position) => {
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
			position === 'left'
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
		mockPosition = 'right';
		const { rerender } = render(<POSColumns />);
		const panelOrder = () => screen.getAllByTestId(/^pos-.*-panel$/).map((el) => el.dataset.testid);
		expect(panelOrder()).toEqual(['pos-products-panel', 'pos-cart-panel']);

		mockPosition = 'left';
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
	it('the products panel lets a focus ring at its inner edge paint into the gutter; the cart clips', () => {
		render(<POSColumns />);
		expect(screen.getByTestId('pos-products-panel').dataset.style).toBe(
			JSON.stringify({ overflow: 'visible' })
		);
		expect(screen.getByTestId('pos-cart-panel').dataset.style).toBeUndefined();
	});

	it('runs every column edge to edge: each pads both insets inside itself, the panels do not', () => {
		const padded = (testID: string) => {
			const { paddingTop, paddingBottom } = screen.getByTestId(testID).style;
			return { paddingTop, paddingBottom };
		};
		const edge = { paddingTop: '24px', paddingBottom: '20px' };
		const { rerender } = render(<POSColumns />);
		expect(padded('pos-products-column')).toEqual(edge);
		expect(padded('pos-cart-column')).toEqual(edge);
		expect(screen.getByTestId('pos-products-column').contains(screen.getByTestId('products'))).toBe(
			true
		);
		expect(
			screen.getByTestId('pos-cart-column').contains(screen.getByTestId('open-orders-strip'))
		).toBe(true);
		// The panels (and so the root) carry no inset: the resize handle runs the full height.
		expect(padded('pos-products-panel')).toEqual({ paddingTop: '', paddingBottom: '' });
		expect(padded('pos-cart-panel')).toEqual({ paddingTop: '', paddingBottom: '' });

		// The products pane's alternates pad the same way, in their own colour.
		mockStage = 'checkout';
		rerender(<POSColumns />);
		expect(padded('pos-checkout-column')).toEqual(edge);
		expect(
			screen.getByTestId('pos-checkout-column').contains(screen.getByTestId('checkout-tender-pane'))
		).toBe(true);
		mockReceipt = 'paid-order';
		rerender(<POSColumns />);
		expect(padded('pos-receipt-column')).toEqual(edge);
		expect(
			screen
				.getByTestId('pos-receipt-column')
				.contains(screen.getByTestId('checkout-receipt-stage'))
		).toBe(true);
	});
});

it.each([true, false])('hosts an unconfirmed paid receipt with autoShow=%s', (autoShow) => {
	mockStage = 'receipt';
	mockReceipt = null;
	mockAutoShow = autoShow;
	render(<POSColumns />);
	expect(screen.queryByTestId('pos-products-column')).toBeNull();
	if (autoShow) {
		expect(screen.getByTestId('pos-receipt-column').textContent).toBe('a');
	} else {
		expect(screen.getByTestId('pos-checkout-column')).not.toBeNull();
		expect(screen.queryByTestId('pos-receipt-column')).toBeNull();
	}
});
it('keeps the tender mounted across the paid write when receipts are off', () => {
	mockAutoShow = false;
	mockReceipt = null;
	mockStage = 'checkout';
	const view = render(<POSColumns />);
	const tender = screen.getByTestId('checkout-tender-pane');
	mockStage = 'receipt';
	view.rerender(<POSColumns />);
	expect(screen.getByTestId('checkout-tender-pane')).toBe(tender);
});
it('shows the current paid order its receipt column before any selection', () => {
	mockAutoShow = true;
	mockReceipt = null;
	mockStage = 'receipt';
	render(<POSColumns />);
	expect(screen.getByTestId('checkout-receipt-stage').textContent).toBe('a');
	expect(screen.queryByTestId('checkout-tender-pane')).toBeNull();
});
