/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { OrderModal } from './modal';

type Props = React.PropsWithChildren<{ testID?: string }>;
function mockDiv({ children, testID }: Props) {
	return <div data-testid={testID}>{children}</div>;
}
const mockPush = jest.fn();
const mockClose = jest.fn();
const mockDelete = jest.fn(async () => ({ annihilated: true, mutationId: 'm' }));
let mockTab: string | undefined;
let mockReadOnly = false;
const mockOrder = { uuid: 'one', payload: { id: 42, number: '42', status: 'completed' } };
jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush }),
	useLocalSearchParams: () => ({ tab: mockTab }),
}));
jest.mock('observable-hooks', () => ({ useObservableSuspense: () => mockOrder }));
jest.mock('@wcpos/query', () => ({
	useRecordField: (r: unknown, select: (r: unknown) => unknown) => (r ? select(r) : undefined),
	useQueryRuntime: () => ({ engine: {} }),
}));
jest.mock('@wcpos/query/record-readers', () => ({ refreshRecordByWooId: jest.fn() }));
jest.mock('../../hooks/mutations/request-server-delete', () => ({
	requestServerDelete: () => mockDelete(),
}));
jest.mock('../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ storageDegraded: false, blockIfDegraded: () => false }),
}));
jest.mock('../use-reopen-order', () => ({ useReopenOrder: () => ({ reopening: false }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: !mockReadOnly } }),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: mockDiv,
	DialogContent: mockDiv,
	DialogHeader: mockDiv,
	DialogTitle: mockDiv,
	DialogBody: mockDiv,
	DialogFooter: mockDiv,
	useDialog: () => ({ close: mockClose }),
}));
jest.mock('@wcpos/components/tabs', () => {
	const Tab = React.createContext('');
	return {
		Tabs: ({ value, children }: Props & { value: string }) => (
			<Tab.Provider value={value}>{children}</Tab.Provider>
		),
		TabsList: mockDiv,
		TabsTrigger: mockDiv,
		TabsContent: ({ value, children }: Props & { value: string }) =>
			React.useContext(Tab) === value ? <div>{children}</div> : null,
	};
});
function mockButton({ children, testID, onPress }: Props & { onPress?: () => void }) {
	return (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	);
}
jest.mock('@wcpos/components/button', () => ({ Button: mockButton }));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ open, children }: Props & { open: boolean }) => (open ? children : null),
	AlertDialogContent: mockDiv,
	AlertDialogHeader: mockDiv,
	AlertDialogTitle: mockDiv,
	AlertDialogDescription: mockDiv,
	AlertDialogFooter: mockDiv,
	AlertDialogCancel: mockDiv,
	AlertDialogAction: mockButton,
}));
jest.mock('@wcpos/components/text', () => ({ Text: mockDiv }));
jest.mock('@wcpos/components/tree', () => ({ Tree: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({ StatusBadge: () => null }));
jest.mock('./form', () => ({ EditOrderForm: () => <div data-testid="order-edit-form" /> }));
jest.mock('../../components/order/created-via', () => ({ CreatedVia: () => null }));
jest.mock('../cells/status', () => ({ OrderStatusBadge: () => null }));
jest.mock('../invoice-actions', () => ({ InvoiceActions: () => null }));
jest.mock('../view/refunds-boundary', () => ({ RefundsBoundary: () => null }));
jest.mock('../view/sections/line-items', () => ({ LineItemsSection: () => null }));
jest.mock('../view/sections/totals', () => ({ TotalsSection: () => null }));
jest.mock('../view/sections/payment', () => ({ PaymentSection: () => null }));
jest.mock('../view/sections/pos-metadata', () => ({ POSMetadataSection: () => null }));
jest.mock('../view/sections/customer', () => ({
	CustomerNoteSection: () => null,
	CustomerRail: () => null,
	AddressesRail: () => null,
	TaxIdsRail: () => null,
}));

const footer = () =>
	screen.getAllByRole('button').map((button) => button.dataset.testid?.replace('order-modal-', ''));
beforeEach(() => {
	jest.clearAllMocks();
	mockTab = undefined;
	mockReadOnly = false;
	mockOrder.payload.id = 42;
});

it('opens on the View tab by default and on the Edit tab when the route asks for it', () => {
	const { unmount } = render(<OrderModal resource={{} as never} />);
	expect(screen.getByText('orders.order_title')).toBeTruthy();
	expect(screen.getByTestId('order-modal-view')).toBeTruthy();
	expect(screen.queryByTestId('order-edit-form')).toBeNull();
	unmount();
	mockTab = 'edit';
	render(<OrderModal resource={{} as never} />);
	expect(screen.getByTestId('order-edit-form')).toBeTruthy();
	expect(screen.queryByTestId('order-modal-view')).toBeNull();
});

it('puts Delete and Refund apart from Sync, Re-open and Receipt, each on its own action', async () => {
	render(<OrderModal resource={{} as never} />);
	expect(footer()).toEqual(['delete', 'refund', 'sync', 'reopen', 'receipt']);
	fireEvent.click(screen.getByTestId('order-modal-receipt'));
	expect(mockPush).toHaveBeenLastCalledWith({
		pathname: '/orders/receipt/[orderId]',
		params: { orderId: 'one' },
	});
	fireEvent.click(screen.getByTestId('order-modal-refund'));
	expect(mockPush).toHaveBeenLastCalledWith({
		pathname: '/orders/refund/[orderId]',
		params: { orderId: 'one' },
	});
	fireEvent.click(screen.getByTestId('order-modal-delete'));
	await act(async () => fireEvent.click(screen.getByTestId('order-delete-confirm-button')));
	expect(mockDelete).toHaveBeenCalledTimes(1);
	expect(mockClose).toHaveBeenCalledTimes(1);
});

it('offers only Re-open and Delete for an order the store has not saved', () => {
	mockOrder.payload.id = 0;
	render(<OrderModal resource={{} as never} />);
	expect(footer()).toEqual(['delete', 'reopen']);
});

it('offers only the receipt when read-only', () => {
	mockReadOnly = true;
	render(<OrderModal resource={{} as never} />);
	expect(footer()).toEqual(['receipt']);
});
