/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PayButton } from './pay';

let mockSize = 'lg';
let mockLoaded = true;
let mockUnsupported = false;
const mockPush = jest.fn();
const mockEnter = jest.fn();
const mockSave = jest.fn();
const mockOrder = { isNew: false, uuid: 'order-1', payload: { total: '10.00', line_items: [] } };
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockSize }) }));
jest.mock('../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ loaded: mockLoaded, unsupportedSchema: mockUnsupported }),
}));
jest.mock('../../checkout/checkout-mode', () => ({ enterCheckout: (id: string) => mockEnter(id) }));
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../../contexts/use-push-document', () => ({ usePushDocument: () => mockSave }));
jest.mock('../../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ storageDegraded: false, blockIfDegraded: () => false }),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: {
		children: React.ReactNode;
		testID: string;
		onPress: () => void;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
beforeEach(() => {
	jest.clearAllMocks();
	mockOrder.isNew = false;
	mockSize = 'lg';
	mockLoaded = true;
	mockUnsupported = false;
	mockSave.mockResolvedValue(mockOrder);
});
it.each([false, true])('enters wide checkout after saving (draft: %s)', async (isNew) => {
	mockOrder.isNew = isNew;
	mockSave.mockResolvedValue({ ...mockOrder, isNew: false });
	render(<PayButton />);
	fireEvent.click(screen.getByTestId('checkout-button'));
	await waitFor(() => expect(mockEnter).toHaveBeenCalledWith('order-1'));
	expect(mockPush).not.toHaveBeenCalled();
});
it.each(['phone', 'legacy', 'unsupported'])('retains the modal for %s', async (lane) => {
	if (lane === 'phone') mockSize = 'sm';
	if (lane === 'legacy') mockLoaded = false;
	if (lane === 'unsupported') mockUnsupported = true;
	render(<PayButton />);
	fireEvent.click(screen.getByTestId('checkout-button'));
	await waitFor(() =>
		expect(mockPush).toHaveBeenCalledWith({
			pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
			params: { orderId: 'order-1' },
		})
	);
	expect(mockEnter).not.toHaveBeenCalled();
});
it('does not enter checkout on an unsuccessful push', async () => {
	mockSave.mockResolvedValue(null);
	render(<PayButton />);
	fireEvent.click(screen.getByTestId('checkout-button'));
	await waitFor(() => expect(mockSave).toHaveBeenCalled());
	expect(mockEnter).not.toHaveBeenCalled();
	expect(mockPush).not.toHaveBeenCalled();
});
