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
let mockSaveState: { kind: string } | null = null;
const mockLegacySave = jest.fn();
const mockRefusal = jest.fn();
const mockLeave = jest.fn();
const mockMarkSaving = jest.fn();
const mockClearSaving = jest.fn();
const mockReplace = jest.fn();
const mockOrder = { isNew: false, uuid: 'order-1', payload: { total: '10.00', line_items: [] } };
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('../../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockSize }) }));
jest.mock('../../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ loaded: mockLoaded, unsupportedSchema: mockUnsupported }),
}));
jest.mock('../../checkout/checkout-mode', () => ({
	enterCheckout: (id: string) => mockEnter(id),
	leaveCheckout: (id: string) => mockLeave(id),
	markOrderSaving: (id: string) => mockMarkSaving(id),
	clearOrderSaving: (id: string) => mockClearSaving(id),
	getOrderSaveState: () => mockSaveState,
	useOrderSaveState: () => mockSaveState,
}));
jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../../contexts/use-push-document', () => ({ usePushDocument: () => mockLegacySave }));
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
jest.mock('../../checkout/hooks/use-checkout-save', () => ({ useCheckoutSave: () => mockSave }));
jest.mock('../../checkout/refusal-toast', () => ({
	showOrderRefusedToast: (...args: unknown[]) => mockRefusal(...args),
}));
beforeEach(() => {
	jest.clearAllMocks();
	mockSaveState = null;
	mockOrder.isNew = false;
	mockSize = 'lg';
	mockLoaded = true;
	mockUnsupported = false;
	mockSave.mockResolvedValue({ outcome: 'saved', resident: mockOrder });
	mockLegacySave.mockResolvedValue(mockOrder);
});
it.each([false, true])('enters wide checkout immediately (draft: %s)', async (isNew) => {
	mockOrder.isNew = isNew;
	mockSave.mockResolvedValue({ outcome: 'saved', resident: { ...mockOrder, isNew: false } });
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
it('leaves checkout on an unsuccessful push', async () => {
	mockLoaded = false;
	mockLegacySave.mockResolvedValue(null);
	render(<PayButton />);
	fireEvent.click(screen.getByTestId('checkout-button'));
	await waitFor(() => expect(mockLeave).toHaveBeenCalledWith('order-1'));
	expect(mockClearSaving).toHaveBeenCalledWith('order-1');
	expect(mockPush).not.toHaveBeenCalled();
});

it('enters checkout before the push resolves', () => {
	mockSave.mockReturnValue(new Promise(() => {}));
	render(<PayButton />);
	fireEvent.click(screen.getByTestId('checkout-button'));
	expect(mockMarkSaving).toHaveBeenCalledWith('order-1');
	expect(mockEnter).toHaveBeenCalledWith('order-1');
	expect(mockClearSaving).not.toHaveBeenCalled();
});
it.each(['lg', 'sm'])(
	'a failed save leaves checkout (the save hook owns clearing) (%s)',
	async (size) => {
		mockSize = size;
		mockSave.mockRejectedValue(new Error('save failed'));
		render(<PayButton />);
		fireEvent.click(screen.getByTestId('checkout-button'));
		await waitFor(() => expect(mockLeave).toHaveBeenCalledWith('order-1'));
		expect(mockClearSaving).not.toHaveBeenCalled();
		if (size === 'sm') expect(mockReplace).toHaveBeenCalledWith('/cart');
		else expect(mockReplace).not.toHaveBeenCalled();
	}
);

it.each(['lg', 'sm'])('re-enters checkout without a second save while saving (%s)', (size) => {
	mockSize = size;
	mockSaveState = { kind: 'saving' };
	render(<PayButton />);
	fireEvent.click(screen.getByTestId('checkout-button'));
	expect(mockSave).not.toHaveBeenCalled();
	expect(mockMarkSaving).not.toHaveBeenCalled();
	if (size === 'lg') expect(mockEnter).toHaveBeenCalledWith('order-1');
	else
		expect(mockPush).toHaveBeenCalledWith(
			expect.objectContaining({ params: { orderId: 'order-1' } })
		);
});

const rejection = { status: 403, reason: 'refused', message: 'No permission' };
it('leaves checkout and shows the refusal once', async () => {
	mockSave.mockResolvedValue({ outcome: 'rejected', rejection });
	render(<PayButton />);
	fireEvent.click(screen.getByTestId('checkout-button'));
	await waitFor(() => expect(mockRefusal).toHaveBeenCalledTimes(1));
	expect(mockRefusal).toHaveBeenCalledWith(expect.objectContaining({ rejection }));
	expect(mockLeave).toHaveBeenCalledWith('order-1');
});
it('keeps queued-offline checkout open without clearing the save entry', async () => {
	mockSave.mockResolvedValue({ outcome: 'queued-offline' });
	render(<PayButton />);
	fireEvent.click(screen.getByTestId('checkout-button'));
	await waitFor(() => expect(mockSave).toHaveBeenCalled());
	expect(mockLeave).not.toHaveBeenCalled();
	expect(mockClearSaving).not.toHaveBeenCalled();
});
it('refuses a held order without enqueueing', () => {
	mockSaveState = { kind: 'rejected', ...rejection };
	render(<PayButton />);
	fireEvent.click(screen.getByTestId('checkout-button'));
	expect(mockSave).not.toHaveBeenCalled();
	expect(mockLegacySave).not.toHaveBeenCalled();
	expect(mockRefusal).toHaveBeenCalledWith(expect.objectContaining({ rejection: mockSaveState }));
});
it.each(['lg', 'sm'])(
	'releases checkout and toasts a late refusal without navigating (%s)',
	async (size) => {
		mockSize = size;
		mockSave.mockResolvedValue({ outcome: 'queued-offline' });
		render(<PayButton />);
		fireEvent.click(screen.getByTestId('checkout-button'));
		await waitFor(() => expect(mockSave).toHaveBeenCalled());
		mockSave.mock.calls[0][1].onLateRejected(rejection);
		expect(mockLeave).toHaveBeenCalledWith('order-1');
		expect(mockRefusal).toHaveBeenCalledWith(expect.objectContaining({ rejection }));
		// The cashier may be on another order by now: a late outcome never moves the screen.
		expect(mockReplace).not.toHaveBeenCalled();
	}
);
