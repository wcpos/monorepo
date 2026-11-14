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
const mockOrder = {
	uuid: 'one',
	payload: {
		id: 42,
		number: '42',
		status: 'completed',
		total: '17.60',
		date_created_gmt: '2026-10-23T12:47:00',
		meta_data: [] as { key: string; value: string }[],
	},
};
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
	DialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter,
	DismissIsClose: jest.requireActual('../../../../../jest/footer.test-utils').DismissIsClose,
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
function mockButton({
	children,
	testID,
	onPress,
	variant,
}: Props & { onPress?: () => void; variant?: string }) {
	return (
		<button data-testid={testID} data-variant={variant} onClick={onPress}>
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
	AlertDialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').AlertDialogFooter,
	AlertDialogCancel: mockDiv,
	AlertDialogAction: mockButton,
}));
// The class rides along so the header test can see that no `text-amt` total is drawn.
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, className }: Props & { className?: string }) => (
		<span className={className}>{children}</span>
	),
}));
jest.mock('../../../../hooks/use-store-day-label', () => ({
	useStoreDayLabel: () => ({ dateTime: () => 'Today · 12:47' }),
}));
jest.mock('../../hooks/use-store-label', () => ({
	useStoreLabel: (id?: string) => ({ label: id === '7' ? 'High Street' : '' }),
}));
jest.mock('../../hooks/use-cashier-label', () => ({
	useCashierLabel: (id?: string) => ({ label: id === '3' ? 'Alice' : '' }),
}));
jest.mock('@wcpos/components/tree', () => ({ Tree: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({ StatusBadge: () => null }));
jest.mock('./form', () => ({ EditOrderForm: () => <div data-testid="order-edit-form" /> }));
jest.mock('../../components/order/created-via', () => ({ CreatedVia: () => null }));
jest.mock('../cells/status', () => ({ OrderStatusBadge: () => null }));
jest.mock('../invoice-actions', () => ({
	useInvoiceActions: () => ({ destructive: [], secondary: [] }),
}));
jest.mock('../view/refunds-boundary', () => ({ RefundsBoundary: () => null }));
jest.mock('../view/sections/line-items', () => ({ LineItemsSection: () => null }));
jest.mock('../view/sections/totals', () => ({ TotalsSection: () => null }));
jest.mock('../view/sections/payment', () => ({ PaymentSection: () => null }));
jest.mock('../view/sections/customer', () => ({ CustomerSection: () => null }));

const footer = () =>
	screen
		.getAllByRole('button')
		.filter((button) => button.textContent !== 'Close')
		.map((button) => button.dataset.testid?.replace('order-modal-', ''));
beforeEach(() => {
	jest.clearAllMocks();
	mockTab = undefined;
	mockReadOnly = false;
	mockOrder.payload.id = 42;
	mockOrder.payload.status = 'completed';
	mockOrder.payload.meta_data = [];
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
	expect(footer()).toEqual(['delete', 'refund', 'sync', 'receipt', 'reopen']);
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

it('offers only the receipt when read-only, and no Edit tab even when the route asks for it', () => {
	mockReadOnly = true;
	mockTab = 'edit';
	render(<OrderModal resource={{} as never} />);
	expect(footer()).toEqual(['receipt']);
	expect(screen.queryByText('common.edit')).toBeNull();
	expect(screen.queryByTestId('order-edit-form')).toBeNull();
	expect(screen.getByTestId('order-modal-view')).toBeTruthy();
});

it('leads with the status and one identity line, no big total; the store only when the order has one', () => {
	mockOrder.payload.meta_data = [
		{ key: '_pos_user', value: '3' },
		{ key: '_pos_store', value: '7' },
	];
	const { container, unmount } = render(<OrderModal resource={{} as never} />);
	expect(container.querySelector('.text-amt')).toBeNull();
	expect(screen.queryByText('17.6')).toBeNull();
	expect(screen.getByTestId('order-modal-identity').textContent).toBe(
		'Today · 12:47 · High Street · Alice · '
	);
	unmount();
	mockOrder.payload.meta_data = [
		{ key: '_pos_user', value: '3' },
		{ key: '_pos_store', value: '0' },
	];
	render(<OrderModal resource={{} as never} />);
	expect(screen.getByTestId('order-modal-identity').textContent).toBe('Today · 12:47 · Alice · ');
});

jest.mock('@wcpos/components/lib/overlay', () => ({
	useOverlay: () => ({ presentation: 'right' }),
	useOverlayPresentation: () => 'right',
}));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => false }));
it('makes Re-open the only primary and groups Sync with Delete', () => {
	render(<OrderModal resource={{} as never} />);
	expect(
		screen
			.getAllByRole('button')
			.filter((button) => button.dataset.variant === 'default')
			.map((button) => button.dataset.testid)
	).toEqual(['order-modal-reopen']);
	expect(screen.getByTestId('order-modal-sync').parentElement).toBe(
		screen.getByTestId('order-modal-delete').parentElement
	);
	expect(screen.getByTestId('order-modal-sync').parentElement).not.toBe(
		screen.getByTestId('order-modal-reopen').parentElement
	);
});

jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));

// The record dialog's not-found state; the real block loads ESM (uniwind, expo-linking).
jest.mock('@wcpos/components/empty-state', () => ({ EmptyState: () => null }));

// The record shell makes the dismiss read Close beside Re-open (an open order saves as it is edited).
it('labels the dismiss Close beside Re-open on an open order', () => {
	mockOrder.payload.status = 'pos-open';
	render(<OrderModal resource={{} as never} />);
	expect(screen.getByRole('button', { name: 'Close' }).parentElement).toBe(
		screen.getByTestId('order-modal-reopen').parentElement
	);
	expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
});
