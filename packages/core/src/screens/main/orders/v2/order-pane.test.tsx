/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { BehaviorSubject, Subject } from 'rxjs';

import { OrderPane } from './order-pane';

jest.mock('expo-haptics', () => ({}));
const mockPush = jest.fn();
const mockClose = jest.fn();
let mockReadOnly = false;
const mockOrder = {
	uuid: 'one',
	payload: {
		id: 42,
		number: '42',
		status: 'completed',
		total: '12.50',
		refunds: [] as { total: string }[],
	},
};
let mockResource = new ObservableResource(new BehaviorSubject(mockOrder));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../hooks/use-engine-document', () => ({ useEngineRecord: () => mockResource }));
jest.mock('@wcpos/query', () => ({
	useRecordField: (r: unknown, select: (r: unknown) => unknown) => (r ? select(r) : null),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../contexts/pro-access', () => ({
	useProAccess: () => ({ readOnly: mockReadOnly }),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (v: number) => `$${v.toFixed(2)}` }),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('../../components/order/created-via', () => ({ CreatedVia: () => null }));
jest.mock('./cells/status', () => ({
	OrderStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));
// The invoice actions reach the REST client; they have their own suite.
jest.mock('./invoice-actions', () => ({ InvoiceActions: () => null }));
jest.mock('./order-menu', () => ({
	OrderActionsMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
jest.mock('../view/use-order-refunds', () => ({ useOrderRefunds: () => ({}) }));
jest.mock('../view/sections/line-items', () => ({
	LineItemsSection: () => <div data-testid="section-items" />,
}));
jest.mock('../view/sections/totals', () => ({
	TotalsSection: () => <div data-testid="section-totals" />,
}));
jest.mock('../view/sections/refunds', () => ({
	RefundsSection: () => <div data-testid="section-refunds" />,
	RefundsSkeleton: () => null,
	RefundsFallback: () => null,
}));
jest.mock('../view/sections/customer', () => ({
	CustomerNoteSection: () => <div data-testid="section-note" />,
	CustomerRail: () => <div data-testid="section-customer" />,
	AddressesRail: () => <div data-testid="section-addresses" />,
	TaxIdsRail: () => <div data-testid="section-tax-ids" />,
}));
jest.mock('../view/sections/payment', () => ({
	PaymentSection: () => <div data-testid="section-payment" />,
}));
jest.mock('../view/sections/pos-metadata', () => ({
	POSMetadataSection: () => <div data-testid="section-pos" />,
}));
beforeEach(() => {
	jest.clearAllMocks();
	mockReadOnly = false;
	mockOrder.payload.id = 42;
	mockOrder.payload.status = 'completed';
	mockOrder.payload.refunds = [];
	mockResource = new ObservableResource(new BehaviorSubject(mockOrder));
});
it('stacks the reused sections in order, with actions outside the scroll', () => {
	render(<OrderPane selected="one" onClose={mockClose} />);
	expect(screen.getAllByTestId(/^section-/).map((n) => n.dataset.testid)).toEqual([
		'section-items',
		'section-totals',
		'section-refunds',
		'section-note',
		'section-customer',
		'section-addresses',
		'section-tax-ids',
		'section-payment',
		'section-pos',
	]);
	expect(screen.getByText('$12.50')).toBeTruthy();
	expect(
		screen.getByTestId('order-pane-print').closest('[data-testid="order-pane-scroll"]')
	).toBeNull();
	fireEvent.click(screen.getByTestId('order-pane-print'));
	expect(mockPush).toHaveBeenLastCalledWith({
		pathname: '/orders/receipt/[orderId]',
		params: { orderId: 'one' },
	});
	fireEvent.click(screen.getByTestId('order-pane-refund'));
	expect(mockPush).toHaveBeenLastCalledWith({
		pathname: '/orders/refund/[orderId]',
		params: { orderId: 'one' },
	});
	fireEvent.click(screen.getByTestId('order-pane-close'));
	expect(mockClose).toHaveBeenCalledTimes(1);
});
it.each([
	'completed',
	'processing',
	'on-hold',
	'pending',
	'failed',
	'refunded',
	'cancelled',
	'pos-open',
	'pos-partial',
	'trash',
])('refund eligibility is preserved for %s', (status) => {
	mockOrder.payload.status = status;
	render(<OrderPane selected="one" onClose={mockClose} />);
	expect(!!screen.queryByTestId('order-pane-refund')).toBe(
		['completed', 'processing', 'on-hold'].includes(status)
	);
});
it('omits print and refund for unpersisted orders', () => {
	mockOrder.payload.id = 0;
	render(<OrderPane selected="one" onClose={mockClose} />);
	expect(screen.queryByTestId('order-pane-print')).toBeNull();
	expect(screen.queryByTestId('order-pane-refund')).toBeNull();
});
it('hides the actions menu in read-only mode', () => {
	mockReadOnly = true;
	render(<OrderPane selected="one" onClose={mockClose} />);
	expect(screen.queryByTestId('order-actions-button')).toBeNull();
});
it('isolates loading in the pane skeleton', () => {
	mockResource = new ObservableResource(new Subject()) as typeof mockResource;
	render(<OrderPane selected="one" onClose={mockClose} />);
	expect(screen.getByTestId('order-pane-skeleton')).toBeTruthy();
});

jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));

it('retains the partial-refund status and local synthetic labels', () => {
	mockOrder.payload.refunds = [{ total: '-2.50' }];
	render(<OrderPane selected="one" onClose={mockClose} />);
	expect(screen.getByText('orders.status.partially-refunded')).toBeTruthy();
});
it.each(['pos-open', 'pos-partial'])('translates synthetic status %s', (status) => {
	mockOrder.payload.status = status;
	render(<OrderPane selected="one" onClose={mockClose} />);
	expect(screen.getByText(`orders.status.${status}`)).toBeTruthy();
});
