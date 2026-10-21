/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { WriteDeferredError } from '@wcpos/query';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { protectOrderMeta } from '@wcpos/query/mutations';

import { EditOrderMetaForm } from './form';
import { enqueueOrderMutation } from '../../../hooks/order-mutation-queue';

const mockBeforePatch = jest.fn();
const mockPatch = jest.fn(),
	mockPush = jest.fn(),
	mockMove = jest.fn(),
	mockClose = jest.fn(),
	mockGuard = jest.fn(),
	mockSelectProps = jest.fn();
function mockStatusSelect() {
	return null;
}
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
	editable,
}: {
	value?: string;
	onChange?: (value: string) => void;
	testID?: string;
	editable?: boolean;
}) {
	return (
		<input
			data-testid={testID}
			readOnly={editable === false}
			value={value ?? ''}
			onChange={(e) => onChange?.(e.target.value)}
		/>
	);
}
jest.mock('@wcpos/components/form', () => ({
	Form: jest.requireActual('react-hook-form').FormProvider,
	FormField: jest.requireActual('react-hook-form').Controller,
	FormInput: mockInput,
	FormTextarea: mockInput,
	FormSelect: (props: Record<string, unknown>) => {
		mockSelectProps(props);
		return mockInput(props);
	},
	FormCombobox: mockInput,
	FormItem: mockWrap,
	FormLabel: mockWrap,
}));
jest.mock('@wcpos/components/dialog', () => ({
	useDialog: () => ({ close: mockClose }),
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
jest.mock('@wcpos/components/button', () => ({ Button: mockButton, ButtonText: mockWrap }));
jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: mockWrap,
	CollapsibleContent: mockWrap,
	CollapsibleTrigger: mockWrap,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: mockWrap,
	TooltipContent: mockWrap,
	TooltipTrigger: mockWrap,
}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: mockButton }));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: mockWrap }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: mockWrap }));
jest.mock('@wcpos/components/text', () => ({ Text: mockWrap }));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { id: 2 }, wpCredentials: { id: 7 } }),
}));
jest.mock('@wcpos/query', () => {
	// pushFailureCode tests these with instanceof.
	class WriteDeferredError extends Error {
		status?: number;
		constructor(mutationId: string, status?: number) {
			super(`write-deferred (${status}) for mutation "${mutationId}"`);
			this.status = status;
		}
	}
	return {
		OPEN_ORDER_STATUSES: jest.requireActual('../../../../../../../../query/src/open-orders-scope')
			.OPEN_ORDER_STATUSES,
		useDocField: <T,>(value: T, select: (value: T) => unknown) => select(value),
		WriteDeferredError,
		WriteOutcomeError: class WriteOutcomeError extends Error {},
	};
});
const mockLogError = jest.fn(),
	mockLogWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	...jest.requireActual('@wcpos/utils/logger'),
	getLogger: () => ({
		error: (...args: unknown[]) => mockLogError(...args),
		warn: (...args: unknown[]) => mockLogWarn(...args),
		success: jest.fn(),
		info: jest.fn(),
		debug: jest.fn(),
	}),
}));
jest.mock('../../../../../../query', () => ({
	useSearchSelect: () => ({ search: '', setSearch: jest.fn() }),
}));
jest.mock('../../../../components/customer-select', () => ({ CustomerList: () => null }));
jest.mock('../../../../components/currency-select', () => ({ CurrencySelect: mockInput }));
jest.mock('../../../../components/order/order-status-select', () => ({
	OrderStatusSelect: mockStatusSelect,
}));
jest.mock('../../../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../../../components/meta-data-form', () => ({
	MetaDataForm: jest.requireActual('../../../../components/meta-data-form').MetaDataForm,
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
	{ key: '_wcpos_till', value: 'till' },
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
	order.payload = payload;
	mockPatch.mockImplementation((input) => {
		mockBeforePatch();
		const resident = input.document.getLatest();
		const changes = input.changes?.(resident.payload) ?? input.data;
		input.data = protectOrderMeta(resident.payload, changes);
		delete input.changes;
		resident.payload = { ...resident.payload, ...input.data };
		return Promise.resolve({ document: resident });
	});
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
	expect(mockClose).toHaveBeenCalledWith();
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
it('restores status and metadata after a rejected push, pushes the revert, keeps the cart', async () => {
	mockPush.mockRejectedValueOnce(new Error('offline'));
	await save('completed');
	await confirm();
	expect(mockPatch).toHaveBeenNthCalledWith(2, {
		document: order,
		data: { status: 'pos-open', meta_data: meta },
	});
	// The revert goes to the server too, after the revert patch, so a send that lands
	// late is overwritten rather than left owning the order.
	expect(mockPush).toHaveBeenCalledTimes(2);
	expect(mockPatch.mock.invocationCallOrder[1]).toBeLessThan(mockPush.mock.invocationCallOrder[1]);
	expect(mockMove).not.toHaveBeenCalled();
	expect(mockClose).not.toHaveBeenCalled();
});
// usePushDocument reports nothing (the caller owns the one report), so this form must.
it('reports a refused send once, as AUTH101, and records a failed revert send at warn', async () => {
	mockPush
		.mockRejectedValueOnce(new WriteDeferredError('mutation-1', 401))
		.mockRejectedValueOnce(new Error('offline'));
	await save('completed');
	await confirm();
	await act(async () => undefined);

	expect(mockLogError).toHaveBeenCalledTimes(1);
	expect(mockLogError).toHaveBeenCalledWith(
		'Failed to save order',
		expect.objectContaining({ showToast: true, code: ERROR_CODES.SESSION_EXPIRED })
	);
	expect(mockLogWarn).toHaveBeenCalledWith(
		'Failed to send the reverted order',
		expect.objectContaining({ code: ERROR_CODES.SYNC_UNEXPECTED })
	);
	expect(
		mockLogWarn.mock.calls.find(([, options]) => (options as { showToast?: boolean })?.showToast)
	).toBeUndefined();
});
it('does not re-send the hand-off when the revert patch itself fails', async () => {
	mockPush.mockRejectedValueOnce(new Error('offline'));
	mockPatch.mockResolvedValueOnce({ document: order }).mockResolvedValueOnce(undefined);
	await save('completed');
	await confirm();
	expect(mockPatch).toHaveBeenCalledTimes(2);
	expect(mockPush).toHaveBeenCalledTimes(1);
	expect(mockMove).not.toHaveBeenCalled();
});
it('does not write or push when storage is degraded', async () => {
	mockGuard.mockReturnValue(true);
	await save('completed');
	await confirm();
	expect(mockGuard).toHaveBeenCalledWith('save-order', { orderId: 'order-1' });
	expect(mockPatch).not.toHaveBeenCalled();
	expect(mockPush).not.toHaveBeenCalled();
});
it.each(['pos-open', 'completed'])('protects meta on %s save', async (status) => {
	const protectedMeta = [...meta, { id: 42, key: '_wcpos_money_owner_hint', value: 'server' }];
	const resident = { ...order, payload: { ...payload, meta_data: protectedMeta } };
	resident.getLatest = () => resident;
	const custom = { key: 'custom', value: 'edited' };
	const formData = { ...payload, status, cashier_id: '7', meta_data: [...protectedMeta, custom] };
	const view = render(<EditOrderMetaForm order={resident as never} formData={formData} />);
	expect(screen.queryAllByDisplayValue('server')).toHaveLength(0);
	expect(screen.getByDisplayValue('custom')).toBeTruthy();
	const edited = { ...formData, meta_data: [{ ...protectedMeta[4], value: null }, custom] };
	view.rerender(<EditOrderMetaForm order={resident as never} formData={edited} />);
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-save')));
	if (status === 'completed') await confirm();
	expect(resident.payload.meta_data).toEqual(expect.arrayContaining([custom, ...protectedMeta]));
	expect(resident.payload.meta_data).toHaveLength(protectedMeta.length + 1);
});

it.each(['pos-open', 'completed'])(
	'keeps a hint arriving at the %s write boundary',
	async (status) => {
		const hint = { key: '_wcpos_money_owner_hint', value: 'server' };
		const custom = { key: 'custom', value: 'edited' };
		const resident = { ...order, payload: { ...payload } };
		resident.getLatest = () => resident;
		mockBeforePatch.mockImplementationOnce(() => {
			resident.payload = { ...payload, meta_data: [...meta, hint] };
		});
		const formData = { ...payload, status, cashier_id: '7', meta_data: [...meta, custom] };
		render(<EditOrderMetaForm order={resident as never} formData={formData} />);
		await act(async () => fireEvent.click(screen.getByTestId('order-meta-save')));
		if (status === 'completed') await confirm();
		expect(resident.payload.meta_data).toEqual(expect.arrayContaining([custom, ...meta, hint]));
		expect(resident.payload.meta_data).toHaveLength(meta.length + 2);
	}
);

it('keeps a hint queued during a failed send when rolling back', async () => {
	const sentCashiers: unknown[] = [];
	const hint = { id: 42, key: '_wcpos_money_owner_hint', value: 'server' };
	const resident = { ...order, payload: { ...payload } };
	resident.getLatest = () => resident;
	mockPush.mockImplementationOnce(() => {
		sentCashiers.push(resident.payload.meta_data.find((entry) => entry.key === '_pos_user')?.value);
		void enqueueOrderMutation(resident.uuid, async () => {
			await Promise.resolve();
			resident.payload = { ...resident.payload, meta_data: [...resident.payload.meta_data, hint] };
		});
		return Promise.reject(new Error('offline'));
	});
	const formData = { ...payload, status: 'completed', cashier_id: '9' };
	render(<EditOrderMetaForm order={resident as never} formData={formData} />);
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-save')));
	await confirm();
	expect(sentCashiers).toEqual(['9']);
	expect(resident.payload).toEqual({
		...payload,
		status: 'pos-open',
		meta_data: [...meta, hint],
	});
});

it('rolls back the cashier after a failed hand-off without losing concurrent ownership', async () => {
	const sentCashiers: unknown[] = [];
	const hint = { id: 42, key: '_wcpos_money_owner_hint', value: 'server' };
	const resident = { ...order, payload: { ...payload } };
	resident.getLatest = () => resident;
	mockPush.mockImplementationOnce(() => {
		sentCashiers.push(resident.payload.meta_data.find((entry) => entry.key === '_pos_user')?.value);
		resident.payload = { ...resident.payload, meta_data: [...resident.payload.meta_data, hint] };
		return Promise.reject(new Error('offline'));
	});
	const formData = { ...payload, cashier_id: '9' };
	render(<EditOrderMetaForm order={resident as never} formData={formData} />);
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-save')));
	await confirm();
	expect(sentCashiers).toEqual(['9']);
	expect(resident.payload.meta_data).toEqual([...meta, hint]);
});

it('rejects renaming an ordinary row to a protected key', async () => {
	render(
		<EditOrderMetaForm
			order={order as never}
			formData={{
				...payload,
				cashier_id: '7',
				meta_data: [...meta, { key: 'ordinary', value: 'keep' }],
			}}
		/>
	);
	const input = screen.getByDisplayValue('ordinary');
	fireEvent.change(input, { target: { value: '_pos_user' } });
	expect(screen.queryByDisplayValue('_pos_user')).toBeNull();
	expect(screen.getByDisplayValue('ordinary')).toBe(input);
});

// ADR 0040: under the server's reopen rule a stale pushable status is a reopen, so a
// save names the status only when the cashier changed it.
it('a note-only save does not write status', async () => {
	await save();
	expect(mockPatch).toHaveBeenCalledWith({
		document: order,
		data: expect.objectContaining({ customer_note: 'Keep note' }),
	});
	expect(mockPatch.mock.calls[0][0].data).not.toHaveProperty('status');
});

it('the status picker offers pushable statuses and shows a paid status read-only', () => {
	const statusProps = () =>
		mockSelectProps.mock.calls
			.map(([props]) => props as Record<string, unknown>)
			.filter((props) => props.customComponent === mockStatusSelect)
			.at(-1)!;
	const formData = { ...payload, cashier_id: '7' };
	const view = render(<EditOrderMetaForm order={order as never} formData={formData} />);
	expect([...(statusProps().allowed as string[])].sort()).toEqual(
		['cancelled', 'on-hold', 'pending', 'pos-open'].sort()
	);
	expect(statusProps().disabled).toBeFalsy();
	view.rerender(
		<EditOrderMetaForm order={order as never} formData={{ ...formData, status: 'completed' }} />
	);
	expect(statusProps().allowed).toEqual(expect.arrayContaining(['completed', 'pos-open']));
	expect(statusProps().disabled).toBe(true);
});

// ADR 0040: the server owns transaction_id and strips it from every push, so the cart shows it
// read-only and neither the local save nor the send writes it.
it('shows transaction_id read-only and never writes it', async () => {
	const formData = { ...payload, transaction_id: 'tx-1', cashier_id: '7' };
	render(<EditOrderMetaForm order={order as never} formData={formData} />);
	expect((screen.getByTestId('order-meta-transaction-id') as HTMLInputElement).readOnly).toBe(true);
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-save')));
	expect(mockPatch.mock.calls[0][0].data).not.toHaveProperty('transaction_id');
	mockPatch.mockClear();
	render(
		<EditOrderMetaForm order={order as never} formData={{ ...formData, status: 'completed' }} />
	);
	await act(async () => fireEvent.click(screen.getAllByTestId('order-meta-save')[1]));
	await confirm();
	expect(mockPatch.mock.calls[0][0].data).not.toHaveProperty('transaction_id');
});

// Status is an intent, never an echo (ADR 0040): a hand-off that changes only the cashier pushes
// no status, so a stale `pos-open` copy cannot reopen a sale another till completed, and its
// rollback restores the cashier alone.
it('a cashier-only hand-off writes and rolls back no status', async () => {
	mockPush.mockRejectedValueOnce(new Error('offline'));
	const formData = { ...payload, cashier_id: '9' };
	render(<EditOrderMetaForm order={order as never} formData={formData} />);
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-save')));
	await confirm();
	expect(mockPatch).toHaveBeenCalledTimes(2);
	const [[handOff], [rollback]] = mockPatch.mock.calls as [[{ data: object }], [{ data: object }]];
	expect(handOff.data).not.toHaveProperty('status');
	expect(rollback.data).not.toHaveProperty('status');
	expect(rollback.data).toEqual({ meta_data: meta });
});
