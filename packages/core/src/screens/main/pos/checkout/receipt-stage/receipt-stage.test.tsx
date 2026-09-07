/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { enterReceipt, getCheckoutModeSnapshot, resetCheckoutMode } from '../checkout-mode';
import { ReceiptStage } from './receipt-stage';

const mockReplace = jest.fn();
const mockSetCurrentOrderID = jest.fn();
let mockPrintedTo: string | null = null;
let mockBack: () => void;
const mockOrder = {
	uuid: 'paid',
	payload: { total: '92.95', currency_symbol: '$', meta_data: [] },
};
jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../../hooks/use-engine-document', () => ({ useEngineRecord: () => mockOrder }));
jest.mock('observable-hooks', () => ({ useObservableSuspense: <T,>(value: T) => value }));
jest.mock('../../../receipt/use-receipt-document', () => ({
	useReceiptDocument: () => ({ printedTo: mockPrintedTo }),
}));
jest.mock('../../../receipt/receipt-body', () => ({ ReceiptBody: () => null }));
jest.mock('../../../receipt/receipt-actions', () => ({ ReceiptActions: () => null }));
jest.mock('../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: [{ id: 'pos_cash', title: 'Cash' }] }),
}));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `$${value.toFixed(2)}` }),
}));
jest.mock('../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { price_num_decimals: 2 } }),
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, args?: Record<string, string>) =>
		[key, ...Object.values(args ?? {})].join(' '),
}));
jest.mock('../../contexts/current-order/context', () => ({
	useCurrentOrderActions: () => ({ setCurrentOrderID: mockSetCurrentOrderID }),
}));
jest.mock('../column/use-checkout-back', () => ({
	useCheckoutBack: (back: () => void) => {
		mockBack = back;
	},
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: {
		children?: React.ReactNode;
		testID?: string;
		onPress?: () => void;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

beforeEach(() => {
	jest.clearAllMocks();
	resetCheckoutMode();
	enterReceipt('paid');
	mockPrintedTo = null;
	mockOrder.payload.meta_data = [
		{
			key: '_wcpos_payments',
			value: {
				schema: 1,
				payments: [
					{
						id: 'cash',
						status: 'captured',
						method_id: 'pos_cash',
						amount: '92.95',
						tendered: '100.00',
						captured_at_gmt: null,
					},
				],
			},
		},
	] as never;
});
it('shows paid amount, cash method and the change to hand back', () => {
	render(<ReceiptStage orderUuid="paid" compact={false} />);
	expect(screen.getByTestId('receipt-paid-banner').textContent).toContain('$92.95');
	expect(screen.getByTestId('receipt-paid-banner').textContent).toContain('Cash');
	expect(screen.getByTestId('receipt-change-due').textContent).toBe('$7.05');
	expect(screen.queryByTestId('receipt-printed-to')).toBeNull();
});
it('shows successful printing and omits zero change', () => {
	mockPrintedTo = 'Till printer';
	mockOrder.payload.meta_data = [];
	render(<ReceiptStage orderUuid="paid" compact={false} />);
	expect(screen.getByTestId('receipt-printed-to').textContent).toContain('Till printer');
	expect(screen.queryByTestId('receipt-change-due')).toBeNull();
});
it.each(['receipt-no-receipt', 'receipt-new-sale'])(
	'%s finishes the sale on both layouts',
	(testID) => {
		const wide = render(<ReceiptStage orderUuid="paid" compact={false} />);
		fireEvent.click(screen.getByTestId(testID));
		expect(getCheckoutModeSnapshot().receiptOrders.has('paid')).toBe(false);
		expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
		expect(mockReplace).not.toHaveBeenCalled();
		wide.unmount();
		enterReceipt('paid');
		render(<ReceiptStage orderUuid="paid" compact />);
		fireEvent.click(screen.getByTestId(testID));
		expect(getCheckoutModeSnapshot().selectedReceiptOrder).toBeNull();
		expect(mockSetCurrentOrderID).toHaveBeenCalledTimes(2);
		expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
	}
);
it('finishes on Android hardware back', () => {
	render(<ReceiptStage orderUuid="paid" compact />);
	act(() => mockBack());
	expect(getCheckoutModeSnapshot().receiptOrders.size).toBe(0);
	expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
	expect(mockReplace).toHaveBeenCalledWith({ pathname: '/cart' });
});
