/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';

import { ViewOrderModal } from './modal';

const push = jest.fn();
const mockOrder = {
	id: 23858,
	uuid: 'order-uuid',
	status: 'completed',
} as any;

jest.mock('react-native', () => ({
	ScrollView: ({ children }: any) => <div data-testid="modal-scroll">{children}</div>,
	View: ({ children, className }: any) => <div className={className}>{children}</div>,
	useWindowDimensions: () => ({ width: 1024 }),
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({ push }),
}));

jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => mockOrder,
}));

jest.mock('rxdb', () => ({
	isRxDocument: () => true,
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, onPress }: any) => <button onClick={onPress}>{children}</button>,
	ButtonText: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: any) => <>{children}</>,
}));

jest.mock('@wcpos/components/modal', () => ({
	Modal: ({ children }: any) => <div>{children}</div>,
	ModalBody: ({ children }: any) => <div>{children}</div>,
	ModalClose: ({ children }: any) => <button>{children}</button>,
	ModalContent: ({ children }: any) => <div>{children}</div>,
	ModalFooter: ({ children, className }: any) => (
		<div data-testid="order-view-modal-footer" className={className}>
			{children}
		</div>
	),
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('./sections/header', () => ({
	HeaderSection: ({ onPrintReceipt, onRefund }: any) => (
		<div
			data-testid="order-view-header"
			data-has-print={String(Boolean(onPrintReceipt))}
			data-has-refund={String(Boolean(onRefund))}
		/>
	),
}));
jest.mock('./sections/customer', () => ({
	AddressesRail: () => <div />,
	CustomerNoteSection: () => <div />,
	CustomerRail: () => <div data-testid="customer-rail" />,
}));
jest.mock('./sections/line-items', () => ({
	LineItemsSection: () => <div />,
}));
jest.mock('./sections/payment', () => ({
	PaymentSection: () => <div />,
}));
jest.mock('./sections/pos-metadata', () => ({
	POSMetadataSection: () => <div />,
}));
jest.mock('./sections/refunds', () => ({
	RefundsFallback: () => <div />,
	RefundsSection: () => <div />,
	RefundsSkeleton: () => <div />,
}));
jest.mock('./sections/totals', () => ({
	TotalsSection: () => <div />,
}));
jest.mock('./use-order-refunds', () => ({
	useOrderRefunds: () => ({}),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('ViewOrderModal', () => {
	beforeEach(() => {
		push.mockClear();
	});

	it('renders print and refund actions in the card footer instead of the header', () => {
		render(<ViewOrderModal resource={{} as never} />);

		expect(screen.getByTestId('order-view-header')).toHaveAttribute('data-has-print', 'false');
		expect(screen.getByTestId('order-view-header')).toHaveAttribute('data-has-refund', 'false');

		const footer = screen.getByTestId('order-view-modal-footer');
		const printButton = within(footer).getByText('receipt.print_receipt');
		const refundButton = within(footer).getByText('orders.refund');

		expect(printButton).toBeInTheDocument();
		expect(refundButton).toBeInTheDocument();

		fireEvent.click(printButton);
		expect(push).toHaveBeenCalledWith({ pathname: '/orders/receipt/order-uuid' });

		fireEvent.click(refundButton);
		expect(push).toHaveBeenCalledWith({ pathname: '/orders/refund/order-uuid' });
	});

	it('uses a top divider when stacked and left divider when the rail moves beside the main column', () => {
		render(<ViewOrderModal resource={{} as never} />);

		expect(screen.getByTestId('customer-rail').parentElement).toHaveClass(
			'border-t',
			'sm:border-t-0',
			'sm:border-l'
		);
	});
});
