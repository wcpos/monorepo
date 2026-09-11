/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { EditOrderMetaForm } from './form';

const mockPatch = jest.fn(),
	mockPush = jest.fn(),
	mockMove = jest.fn(),
	mockClose = jest.fn(),
	mockGuard = jest.fn();
function mockWrap({ children }: React.PropsWithChildren) {
	return <>{children}</>;
}
function mockButton({
	children,
	testID,
	onPress,
}: React.PropsWithChildren<{ testID?: string; onPress?: () => void }>) {
	return (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	);
}
function mockInput({
	value,
	onChange,
	testID,
}: {
	value?: string;
	onChange?: (value: string) => void;
	testID?: string;
}) {
	return (
		<input data-testid={testID} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} />
	);
}
jest.mock('@wcpos/components/form', () => ({
	Form: jest.requireActual('react-hook-form').FormProvider,
	FormField: jest.requireActual('react-hook-form').Controller,
	FormInput: mockInput,
	FormTextarea: mockInput,
	FormSelect: mockInput,
	FormCombobox: mockInput,
	FormItem: mockWrap,
	FormLabel: mockWrap,
}));
jest.mock('@wcpos/components/dialog', () => ({
	useRootContext: () => ({ onOpenChange: mockClose }),
	DialogBody: mockWrap,
	DialogFooter: mockWrap,
	DialogClose: mockButton,
	DialogAction: mockButton,
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? <>{children}</> : null,
	AlertDialogContent: mockWrap,
	AlertDialogHeader: mockWrap,
	AlertDialogFooter: mockWrap,
	AlertDialogTitle: mockWrap,
	AlertDialogDescription: mockWrap,
	AlertDialogAction: mockButton,
	AlertDialogCancel: mockButton,
}));
jest.mock('@wcpos/components/combobox', () => ({
	Combobox: mockWrap,
	ComboboxContent: mockWrap,
	ComboboxInput: mockInput,
	ComboboxTrigger: mockWrap,
}));
jest.mock('@wcpos/components/button', () => ({ Button: mockButton }));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: mockWrap }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: mockWrap }));
jest.mock('@wcpos/components/text', () => ({ Text: mockWrap }));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { id: 2 }, wpCredentials: { id: 7 } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(value: T, select: (value: T) => unknown) => select(value),
}));
jest.mock('../../../../../../query', () => ({
	useSearchSelect: () => ({ search: '', setSearch: jest.fn() }),
}));
jest.mock('../../../../components/customer-select', () => ({ CustomerList: () => null }));
jest.mock('../../../../components/currency-select', () => ({ CurrencySelect: mockInput }));
jest.mock('../../../../components/order/order-status-select', () => ({
	OrderStatusSelect: mockInput,
}));
jest.mock('../../../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../../../components/meta-data-form', () => ({
	MetaDataForm: () => null,
	metaDataSchema: jest.requireActual('zod').array(jest.requireActual('zod').unknown()),
}));
jest.mock('../../../../hooks/use-cashier-label', () => ({
	useCashierLabel: () => ({ label: 'Cashier' }),
}));
jest.mock('../../../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockPatch }),
}));
jest.mock('../../../../contexts/use-push-document', () => ({ usePushDocument: () => mockPush }));
jest.mock('../../../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ blockIfDegraded: mockGuard }),
}));
jest.mock('../../../contexts/current-order', () => ({
	useCurrentOrderActions: () => ({ setCurrentOrderID: mockMove }),
}));
const meta = [
	{ key: '_pos_user', value: '7' },
	{ key: '_pos_store', value: '2' },
	{ key: '_wcpos_register', value: 'register' },
];
const payload = {
	status: 'pos-open',
	meta_data: meta,
	currency: 'USD',
	transaction_id: '',
	customer_note: '',
};
const order = { uuid: 'order-1', payload, getLatest: () => order };
async function save(status = 'pos-open') {
	const formData = { ...payload, status, cashier_id: '7', customer_note: 'Keep note' };
	render(<EditOrderMetaForm order={order as never} formData={formData} />);
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-save')));
}
async function confirm() {
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-send-confirm')));
}
beforeEach(() => {
	jest.clearAllMocks();
	mockPatch.mockResolvedValue({ document: order });
	mockPush.mockResolvedValue(order);
	mockGuard.mockReturnValue(false);
});
it('saves notes locally without confirmation or push when identity is unchanged', async () => {
	await save();
	expect(mockPatch).toHaveBeenCalledWith({
		document: order,
		data: expect.objectContaining({ customer_note: 'Keep note' }),
	});
	expect(mockPush).not.toHaveBeenCalled();
	expect(screen.queryByTestId('order-meta-send-confirm')).toBeNull();
	expect(mockClose).toHaveBeenCalledWith(false);
});
it('confirms before writing, keeps values on cancel, then patches, pushes and leaves', async () => {
	await save('completed');
	expect(screen.getByTestId('order-meta-send-confirm')).toBeTruthy();
	expect(mockPatch).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('order-meta-send-cancel'));
	expect(mockPatch).not.toHaveBeenCalled();
	expect((screen.getByTestId('order-note-input') as HTMLInputElement).value).toBe('Keep note');
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-save')));
	await confirm();
	expect(mockPatch).toHaveBeenCalledWith({
		document: order,
		data: expect.objectContaining({ status: 'completed', meta_data: meta }),
	});
	expect(mockPush).toHaveBeenCalledWith(order);
	expect(mockMove).toHaveBeenCalledWith('');
	expect(mockPatch.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0]);
	expect(mockPush.mock.invocationCallOrder[0]).toBeLessThan(mockMove.mock.invocationCallOrder[0]);
});
it('restores only status and metadata after a rejected push, keeping the cart selected', async () => {
	mockPush.mockRejectedValueOnce(new Error('offline'));
	await save('completed');
	await confirm();
	expect(mockPatch).toHaveBeenNthCalledWith(2, {
		document: order,
		data: { status: 'pos-open', meta_data: meta },
	});
	expect(mockMove).not.toHaveBeenCalled();
	expect(mockClose).not.toHaveBeenCalled();
});
it('does not write or push when storage is degraded', async () => {
	mockGuard.mockReturnValue(true);
	await save('completed');
	await confirm();
	expect(mockGuard).toHaveBeenCalledWith('save-order', { orderId: 'order-1' });
	expect(mockPatch).not.toHaveBeenCalled();
	expect(mockPush).not.toHaveBeenCalled();
});
