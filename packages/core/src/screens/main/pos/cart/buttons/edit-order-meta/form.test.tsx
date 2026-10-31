/** @jest-environment jsdom */
import * as React from 'react';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { WriteDeferredError } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { EditOrderMetaForm } from './form';
import { protectOrderMeta } from '../../../../../../../../query/src/mutations/protected-order-meta';
import { enqueueOrderMutation } from '../../../hooks/order-mutation-queue';
import {
	enterCheckout,
	leaveCheckout,
	markOrderSaveRejected,
	resetCheckoutMode,
} from '../../../checkout/checkout-mode';

const mockBeforePatch = jest.fn();
const mockPatch = jest.fn(),
	mockPush = jest.fn(),
	mockMove = jest.fn(),
	mockClose = jest.fn(),
	mockGuard = jest.fn(),
	mockSelectProps = jest.fn(),
	mockComboboxProps = jest.fn(),
	mockT = jest.fn((key: string) => key);
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
	disabled,
	accessibilityLabel,
}: React.PropsWithChildren<{
	testID?: string;
	onPress?: () => void;
	disabled?: boolean;
	accessibilityLabel?: string;
}>) {
	return (
		<button
			data-testid={testID}
			onClick={onPress}
			disabled={disabled}
			aria-label={accessibilityLabel}
		>
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
	useFormChangeHandler: jest.requireActual('@wcpos/components/form/use-form-change-handler')
		.useFormChangeHandler,
	SavedMark: () => null,
	useMarkSaved: () => jest.fn(),
	useSavedName: () => '',
	Form: jest.requireActual('react-hook-form').FormProvider,
	FormField: jest.requireActual('react-hook-form').Controller,
	FormInput: mockInput,
	FormTextarea: mockInput,
	FormSelect: (props: Record<string, unknown>) => {
		mockSelectProps(props);
		return mockInput(props);
	},
	FormCombobox: (props: Record<string, unknown> & { value: string | { value: string } }) => {
		mockComboboxProps(props);
		return mockInput({
			...props,
			value: typeof props.value === 'object' ? props.value.value : props.value,
		});
	},
	FormItem: mockWrap,
	FormLabel: mockWrap,
}));
jest.mock('@wcpos/components/dialog', () => ({
	useDialog: () => ({ close: mockClose }),
	DialogBody: mockWrap,
	DialogFooter: jest.requireActual('../../../../../../../jest/footer.test-utils').DialogFooter,
	DialogClose: mockButton,
	DialogAction: mockButton,
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? <>{children}</> : null,
	AlertDialogContent: mockWrap,
	AlertDialogHeader: mockWrap,
	AlertDialogFooter: jest.requireActual('../../../../../../../jest/footer.test-utils')
		.AlertDialogFooter,
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => (
		<span data-testid="order-meta-send-title">{children}</span>
	),
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
jest.mock('@wcpos/components/switch', () => ({
	Switch: (props: {
		checked: boolean;
		disabled?: boolean;
		onCheckedChange: (checked: boolean) => void;
		testID: string;
	}) => (
		<input
			type="checkbox"
			data-testid={props.testID}
			checked={props.checked}
			disabled={props.disabled}
			onChange={() => props.onCheckedChange(!props.checked)}
		/>
	),
}));
const mockSetTaxExempt = jest.fn();
let mockPricesIncludeTax = false;
jest.mock('../../../commands/use-tax-exempt', () => ({
	useSetTaxExempt: () => mockSetTaxExempt,
	useWcVersion: () => () => '11.3.0',
}));
jest.mock('../../../hooks/use-cart-config', () => ({
	useCartConfigReader: () => () => ({ dp: 2, pricesIncludeTax: mockPricesIncludeTax }),
}));
let mockOnlineStatus = 'online-website-available';
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnlineStatus }),
}));
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../../../jest/property-row.test-utils')
);
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: mockWrap,
	TooltipContent: mockWrap,
	TooltipTrigger: mockWrap,
}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: mockButton }));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: mockWrap }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: mockWrap }));
jest.mock('@wcpos/components/text', () => ({ Text: mockWrap }));
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({
		tone,
		title,
		description,
		children,
		testID,
	}: React.PropsWithChildren<{
		tone: string;
		title: string;
		description: string;
		testID: string;
	}>) => (
		<div data-testid={testID} data-tone={tone}>
			{title}
			{description}
			{children}
		</div>
	),
}));
let mockStores = [{ id: 2, name: 'Main' }];
let mockDirectories: Record<string, { id: string; name: string }[]> = {};
jest.mock('observable-hooks', () => {
	const actual = jest.requireActual('observable-hooks');
	return {
		...actual,
		useObservableSuspense: (resource: { mockStores?: unknown }) =>
			resource.mockStores ?? actual.useObservableSuspense(resource),
	};
});
jest.mock('../../../../hooks/store-list-resource', () => ({
	storeListResource: () => ({ mockStores }),
}));
jest.mock('../../../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'register' }),
	// A store missing from the map has not answered yet.
	useRegisterDirectory: (id: number) => ({
		registers: mockDirectories[String(id)] ?? [],
		loaded: String(id) in mockDirectories,
	}),
}));
jest.mock('../../../../hooks/use-order-status-label', () => ({
	useOrderStatusLabel: () => ({ getLabel: (status: string) => status }),
}));
jest.mock('../../../../../../contexts/translations', () => ({ useT: () => mockT }));
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
		useRecordField: <T,>(record: T, select: (value: T) => unknown) => select(record),
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
	// Cashier 10 is still resolving.
	useCashierLabel: (id: string) => ({ label: id === '10' ? '' : 'Cashier' }),
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
function formProps(
	data: Omit<typeof payload, 'meta_data'> & { cashier_id: string; meta_data: unknown[] }
) {
	const { status, cashier_id, transaction_id: _transaction, ...formData } = data;
	return {
		formData: formData as React.ComponentProps<typeof EditOrderMetaForm>['formData'],
		handOverData: { status, cashier_id, store_id: '2', register_id: 'register' },
	};
}
const order = { uuid: 'order-1', payload, getLatest: () => order };
/** Stages a hand-over the way the cashier does: through the pickers, against the order's own. */
async function stage({ status, cashier_id }: { status?: string; cashier_id?: string }) {
	if (status) {
		const picker = mockSelectProps.mock.calls
			.map(([props]) => props as Record<string, unknown>)
			.filter((props) => props.customComponent === mockStatusSelect)
			.at(-1)!;
		await act(async () => (picker.onChange as (value: string) => void)(status));
	}
	if (cashier_id)
		fireEvent.change(screen.getByTestId('order-meta-cashier').querySelector('input')!, {
			target: { value: cashier_id },
		});
}
async function save(status: string) {
	const formData = { ...payload, cashier_id: '7', customer_note: 'Keep note' };
	render(<EditOrderMetaForm order={order as never} {...formProps(formData)} />);
	await stage({ status });
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-send')));
}
async function confirm() {
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-send-confirm')));
}
beforeEach(() => {
	jest.clearAllMocks();
	order.payload = payload;
	mockPricesIncludeTax = false;
	mockOnlineStatus = 'online-website-available';
	mockStores = [{ id: 2, name: 'Main' }];
	mockDirectories = { '2': [{ id: 'register', name: 'Till' }] };
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
it('autosaves a note locally without confirmation, push, or a status write', async () => {
	render(
		<EditOrderMetaForm order={order as never} {...formProps({ ...payload, cashier_id: '7' })} />
	);
	fireEvent.change(screen.getByTestId('order-note-input'), { target: { value: 'Keep note' } });
	await waitFor(() =>
		expect(mockPatch).toHaveBeenCalledWith({
			document: order,
			data: { customer_note: 'Keep note' },
		})
	);
	expect(mockPush).not.toHaveBeenCalled();
	expect(screen.queryByTestId('order-meta-send-confirm')).toBeNull();
	expect(mockClose).not.toHaveBeenCalled();
});
it('confirms before writing, keeps values on cancel, then patches, pushes and leaves', async () => {
	await save('completed');
	expect(screen.getByTestId('order-meta-send-confirm')).toBeTruthy();
	expect(mockPatch).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('order-meta-send-cancel'));
	expect(mockPatch).not.toHaveBeenCalled();
	expect((screen.getByTestId('order-note-input') as HTMLInputElement).value).toBe('Keep note');
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-send')));
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
// A meta edit saves as it is made (never carrying the hidden identity rows, which the local
// patch keeps); a hand-off afterwards stamps the identity onto the order's meta as it stands.
it.each(['pos-open', 'completed'])('protects meta on %s save', async (status) => {
	const protectedMeta = [
		...meta,
		{ id: 42, key: '_wcpos_money_owner_hint', value: 'server' },
		{ id: 43, key: 'is_vat_exempt', value: 'yes' },
	];
	const resident = { ...order, payload: { ...payload, meta_data: protectedMeta } };
	resident.getLatest = () => resident;
	const custom = { key: 'custom', value: 'edited' };
	const formData = {
		...payload,
		cashier_id: '7',
		meta_data: [...protectedMeta, { ...custom, value: 'before' }],
	};
	render(<EditOrderMetaForm order={resident as never} {...formProps(formData)} />);
	expect(screen.queryAllByDisplayValue('server')).toHaveLength(0);
	expect(screen.queryAllByDisplayValue('is_vat_exempt')).toHaveLength(0);
	expect(screen.getByDisplayValue('custom')).toBeTruthy();
	fireEvent.change(screen.getByDisplayValue('before'), { target: { value: 'edited' } });
	await waitFor(() => expect(mockPatch).toHaveBeenCalled());
	if (status === 'completed') {
		await stage({ status });
		await act(async () => fireEvent.click(screen.getByTestId('order-meta-send')));
		await confirm();
	}
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
		const formData = {
			...payload,
			cashier_id: '7',
			meta_data: [...meta, { ...custom, value: 'before' }],
		};
		render(<EditOrderMetaForm order={resident as never} {...formProps(formData)} />);
		fireEvent.change(screen.getByDisplayValue('before'), { target: { value: 'edited' } });
		await waitFor(() => expect(mockPatch).toHaveBeenCalled());
		if (status === 'completed') {
			await stage({ status });
			await act(async () => fireEvent.click(screen.getByTestId('order-meta-send')));
			await confirm();
		}
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
	const formData = { ...payload, cashier_id: '7' };
	render(<EditOrderMetaForm order={resident as never} {...formProps(formData)} />);
	await stage({ status: 'completed', cashier_id: '9' });
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-send')));
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
	const formData = { ...payload, cashier_id: '7' };
	render(<EditOrderMetaForm order={resident as never} {...formProps(formData)} />);
	await stage({ cashier_id: '9' });
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-send')));
	await confirm();
	expect(sentCashiers).toEqual(['9']);
	expect(resident.payload.meta_data).toEqual([...meta, hint]);
});

it('rejects renaming an ordinary row to a protected key', async () => {
	render(
		<EditOrderMetaForm
			order={order as never}
			{...formProps({
				...payload,
				cashier_id: '7',
				meta_data: [...meta, { key: 'ordinary', value: 'keep' }],
			})}
		/>
	);
	const input = screen.getByDisplayValue('ordinary');
	fireEvent.change(input, { target: { value: '_pos_user' } });
	expect(screen.queryByDisplayValue('_pos_user')).toBeNull();
	expect(screen.getByDisplayValue('ordinary')).toBe(input);
});

it('the status picker offers pushable statuses and shows a paid status read-only', () => {
	const statusProps = () =>
		mockSelectProps.mock.calls
			.map(([props]) => props as Record<string, unknown>)
			.filter((props) => props.customComponent === mockStatusSelect)
			.at(-1)!;
	const formData = { ...payload, cashier_id: '7' };
	const view = render(<EditOrderMetaForm order={order as never} {...formProps(formData)} />);
	expect([...(statusProps().allowed as string[])].sort()).toEqual(
		['cancelled', 'on-hold', 'pending', 'pos-open'].sort()
	);
	expect(statusProps().disabled).toBeFalsy();
	view.rerender(
		<EditOrderMetaForm
			order={order as never}
			{...formProps({ ...formData, status: 'completed' })}
		/>
	);
	expect(statusProps().allowed).toEqual(expect.arrayContaining(['completed', 'pos-open']));
	expect(statusProps().disabled).toBe(true);
});

// Status is an intent, never an echo (ADR 0040): a hand-off that changes only the cashier pushes
// no status, so a stale `pos-open` copy cannot reopen a sale another till completed, and its
// rollback restores the cashier alone.
it('a cashier-only hand-off writes and rolls back no status', async () => {
	mockPush.mockRejectedValueOnce(new Error('offline'));
	const formData = { ...payload, cashier_id: '7' };
	render(<EditOrderMetaForm order={order as never} {...formProps(formData)} />);
	await stage({ cashier_id: '9' });
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-send')));
	await confirm();
	expect(mockPatch).toHaveBeenCalledTimes(2);
	const [[handOff], [rollback]] = mockPatch.mock.calls as [[{ data: object }], [{ data: object }]];
	expect(handOff.data).not.toHaveProperty('status');
	expect(rollback.data).not.toHaveProperty('status');
	expect(rollback.data).toEqual({ meta_data: meta });
});

// The status edit is the cashier's, captured when the hand-off is staged: a pull adopting another
// till's completion while it awaits confirmation is never read as one, so confirming sends no
// status and cannot reopen the paid sale.
it('a completion adopted while the hand-off awaits confirmation is not sent as a status edit', async () => {
	const formData = { ...payload, cashier_id: '7' };
	render(<EditOrderMetaForm order={order as never} {...formProps(formData)} />);
	await stage({ cashier_id: '9' });
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-send')));
	order.payload = { ...payload, status: 'completed' }; // another till completed it; a pull adopted
	await confirm();
	expect(mockPatch).toHaveBeenCalledTimes(1);
	expect(mockPatch.mock.calls[0][0].data).not.toHaveProperty('status');
});

it('a meta row deleted after the store numbered it is written as a tombstone', async () => {
	// The draft (opened before a sync) holds the row without an id; the order now has it numbered.
	const numbered = { id: 9, key: 'custom', value: 'x' };
	const resident = { ...order, payload: { ...payload, meta_data: [...meta, numbered] } };
	resident.getLatest = () => resident;
	const formData = {
		...payload,
		status: 'pos-open',
		cashier_id: '7',
		meta_data: [...meta, { key: 'custom', value: 'x' }],
	};
	render(<EditOrderMetaForm order={resident as never} {...formProps(formData)} />);
	await act(async () => fireEvent.click(screen.getByTestId('order-meta-remove-meta-4')));
	await waitFor(() => expect(mockPatch).toHaveBeenCalled());
	expect(resident.payload.meta_data).toEqual(
		expect.arrayContaining([{ id: 9, key: 'custom', value: null }, ...meta])
	);
});

it('a meta row that arrived from the store while the sheet was open is never tombstoned', async () => {
	// The draft never saw external_reference (a store integration added it after the sheet opened).
	const arrived = { id: 11, key: 'external_reference', value: 'INT-1' };
	const resident = { ...order, payload: { ...payload, meta_data: [...meta, arrived] } };
	resident.getLatest = () => resident;
	const formData = {
		...payload,
		status: 'pos-open',
		cashier_id: '7',
		meta_data: [...meta, { key: 'custom', value: 'before' }],
	};
	render(<EditOrderMetaForm order={resident as never} {...formProps(formData)} />);
	fireEvent.change(screen.getByDisplayValue('before'), { target: { value: 'edited' } });
	await waitFor(() => expect(mockPatch).toHaveBeenCalled());
	expect(resident.payload.meta_data).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ id: 11, value: null })])
	);
});

it('is property rows: Customer note, then the Hand over box holding Status, Cashier and its Send; no More', () => {
	render(
		<EditOrderMetaForm order={order as never} {...formProps({ ...payload, cashier_id: '7' })} />
	);
	const rows = ['customer_note', 'status', 'cashier'];
	for (const id of rows) expect(screen.getByTestId(`order-meta-row-${id}`)).toBeTruthy();
	const box = screen.getByTestId('order-meta-hand-over');
	expect(box.textContent).toContain('pos_cart.hand_over_hint');
	for (const id of ['status', 'cashier'])
		expect(box.contains(screen.getByTestId(`order-meta-row-${id}`))).toBe(true);
	expect(box.contains(screen.getByTestId('order-meta-send'))).toBe(true);
	expect(screen.queryByText('common.more')).toBeNull();
	expect(screen.queryByTestId('order-meta-row-currency')).toBeNull();
});

it('the add row offers Currency and Custom field; an added Currency is a row with no Remove', () => {
	render(
		<EditOrderMetaForm order={order as never} {...formProps({ ...payload, cashier_id: '7' })} />
	);
	const offered = () => screen.getAllByTestId(/^order-meta-add-/).map((add) => add.textContent);
	expect(offered()).toEqual(['common.currency', 'common.custom_field']);
	fireEvent.click(screen.getByTestId('order-meta-add-currency'));
	expect(screen.getByTestId('order-meta-row-currency').querySelector('button')).toBeNull();
	expect(offered()).toEqual(['common.custom_field']);
});

describe('the hand-over box', () => {
	const selectProps = (testID: string) =>
		mockSelectProps.mock.calls
			.map(([props]) => props as Record<string, unknown>)
			.filter((props) => props.triggerTestID === testID)
			.at(-1);
	const choose = (testID: string, value: string) =>
		act(async () => {
			await (selectProps(testID)!.onChange as (value: string) => unknown)(value);
		});
	const statusProps = () =>
		mockSelectProps.mock.calls
			.map(([props]) => props as Record<string, unknown>)
			.filter((props) => props.customComponent === mockStatusSelect)
			.at(-1)!;
	const box = () => screen.getByTestId('order-meta-hand-over');
	const send = () => screen.getByTestId('order-meta-send') as HTMLButtonElement;
	const stamped = (key: string) =>
		(mockPatch.mock.calls[0][0].data.meta_data as { key: string; value: string }[]).find(
			(entry) => entry.key === key
		)?.value;
	function renderBox() {
		render(
			<EditOrderMetaForm order={order as never} {...formProps({ ...payload, cashier_id: '7' })} />
		);
	}

	it('rests info: the footer says it stays in this cart and Send is disabled', () => {
		renderBox();
		expect(box().dataset.tone).toBe('info');
		expect(screen.getByTestId('order-meta-hand-over-summary').textContent).toBe(
			'pos_cart.stays_in_this_cart'
		);
		expect(send().disabled).toBe(true);
	});

	it('a changed cashier turns the box amber, lists the change and confirms the hand-over', async () => {
		renderBox();
		await stage({ cashier_id: '9' });
		expect(box().dataset.tone).toBe('warning');
		expect(screen.getByTestId('order-meta-hand-over-summary').textContent).toBe(
			'pos_cart.leaves_this_cartpos_cart.totals_disagree_change'
		);
		expect(send().disabled).toBe(false);
		expect(mockComboboxProps.mock.calls.at(-1)![0].tone).toBe('attention');
		expect(statusProps().tone).toBeUndefined();
		await act(async () => fireEvent.click(send()));
		expect(screen.getByTestId('order-meta-send-title').textContent).toBe(
			'pos_cart.hand_order_to_question'
		);
		expect(screen.getByTestId('order-meta-send-confirm').textContent).toBe('pos_cart.send_to');
	});

	it('shows the Store row only when the credential holds more than one store', () => {
		renderBox();
		expect(screen.queryByTestId('order-meta-row-store')).toBeNull();
		cleanup();
		mockStores = [
			{ id: 2, name: 'Main' },
			{ id: 5, name: 'Annex' },
		];
		renderBox();
		expect(screen.getByTestId('order-meta-row-store')).toBeTruthy();
		expect(selectProps('order-meta-store-select')!.options).toEqual([
			{ value: '2', label: 'Main' },
			{ value: '5', label: 'Annex' },
		]);
	});

	it('changing the store resets the register, or picks the only one the store has', async () => {
		mockStores = [
			{ id: 2, name: 'Main' },
			{ id: 5, name: 'Annex' },
			{ id: 6, name: 'Kiosk' },
		];
		mockDirectories = {
			...mockDirectories,
			'5': [
				{ id: 'r5a', name: 'A' },
				{ id: 'r5b', name: 'B' },
			],
			'6': [{ id: 'r6', name: 'Kiosk till' }],
		};
		renderBox();
		await choose('order-meta-store-select', '5');
		expect(selectProps('order-meta-register-select')!.value).toBe('');
		// A store with registers needs one chosen before the order can go.
		expect(send().disabled).toBe(true);
		expect(selectProps('order-meta-store-select')!.tone).toBe('attention');
		await choose('order-meta-store-select', '6');
		expect(selectProps('order-meta-register-select')!.value).toBe('r6');
		expect(send().disabled).toBe(false);
	});

	it('a store-only send stamps the new store and register, names the place and leaves the cart', async () => {
		mockStores = [
			{ id: 2, name: 'Main' },
			{ id: 6, name: 'Kiosk' },
		];
		mockDirectories = { ...mockDirectories, '6': [{ id: 'r6', name: 'Kiosk till' }] };
		renderBox();
		await choose('order-meta-store-select', '6');
		await act(async () => fireEvent.click(send()));
		expect(screen.getByTestId('order-meta-send-title').textContent).toBe(
			'pos_cart.send_order_to_question'
		);
		expect(screen.getByTestId('order-meta-send-changes').textContent).toContain('common.store');
		await confirm();
		expect(stamped('_pos_store')).toBe('6');
		expect(stamped('_wcpos_register')).toBe('r6');
		expect(stamped('_pos_user')).toBe('7');
		expect(mockPatch.mock.calls[0][0].data).not.toHaveProperty('status');
		expect(mockMove).toHaveBeenCalledWith('');
	});

	it('a status-only send asks to send to the store and changes no identity', async () => {
		renderBox();
		await stage({ status: 'on-hold' });
		expect(statusProps().tone).toBe('attention');
		expect(mockComboboxProps.mock.calls.at(-1)![0].tone).toBeUndefined();
		await act(async () => fireEvent.click(send()));
		expect(screen.getByTestId('order-meta-send-title').textContent).toBe(
			'pos_cart.send_order_title'
		);
		expect(screen.getByTestId('order-meta-send-confirm').textContent).toBe('common.send');
		await confirm();
		expect(mockPatch.mock.calls[0][0].data).toEqual({ status: 'on-hold', meta_data: meta });
	});

	it('waits for another store to answer before Send, offline or loading', async () => {
		mockStores = [
			{ id: 2, name: 'Main' },
			{ id: 5, name: 'Annex' },
		];
		renderBox();
		await choose('order-meta-store-select', '5');
		expect(screen.queryByTestId('order-meta-row-register')).toBeNull();
		expect(send().disabled).toBe(true);
	});

	it('a store with no registers clears the order register, and the change row is true', async () => {
		mockStores = [
			{ id: 2, name: 'Main' },
			{ id: 5, name: 'Annex' },
		];
		mockDirectories = { ...mockDirectories, '5': [] };
		renderBox();
		await choose('order-meta-store-select', '5');
		expect(send().disabled).toBe(false);
		await act(async () => fireEvent.click(send()));
		expect(mockT).toHaveBeenCalledWith('pos_cart.totals_disagree_change', {
			before: 'Till',
			after: '—',
		});
		await confirm();
		// The real protectOrderMeta runs in the patch: the cleared row survives it.
		const stored = order.payload.meta_data as { key: string; value: string }[];
		expect(stored.find((entry) => entry.key === '_wcpos_register')?.value).toBe('');
		expect(stored.find((entry) => entry.key === '_pos_store')?.value).toBe('5');
		expect(mockMove).toHaveBeenCalledWith('');
	});

	it('a register-only change at the same store names the register', async () => {
		mockDirectories = {
			'2': [
				{ id: 'register', name: 'Till' },
				{ id: 'r2', name: 'Till 2' },
			],
		};
		renderBox();
		await choose('order-meta-register-select', 'r2');
		await act(async () => fireEvent.click(send()));
		expect(screen.getByTestId('order-meta-send-title').textContent).toBe(
			'pos_cart.send_order_to_question'
		);
		expect(mockT).toHaveBeenCalledWith('pos_cart.send_order_to_question', { name: 'Till 2' });
	});

	it('pos-open to pending stays in this cart: the footer, the confirm and the cart agree', async () => {
		renderBox();
		await stage({ status: 'pending' });
		expect(box().dataset.tone).toBe('warning');
		expect(screen.getByTestId('order-meta-hand-over-summary').textContent).toBe(
			'pos_cart.stays_in_this_cartpos_cart.totals_disagree_change'
		);
		await act(async () => fireEvent.click(send()));
		expect(screen.getByText('pos_cart.send_order_stays_description')).toBeTruthy();
		await confirm();
		expect(mockPush).toHaveBeenCalled();
		expect(mockMove).not.toHaveBeenCalled();
	});

	it('a failed store hand-over restores the store and the register', async () => {
		mockPush.mockRejectedValueOnce(new Error('offline'));
		mockStores = [
			{ id: 2, name: 'Main' },
			{ id: 6, name: 'Kiosk' },
		];
		mockDirectories = { ...mockDirectories, '6': [{ id: 'r6', name: 'Kiosk till' }] };
		renderBox();
		await choose('order-meta-store-select', '6');
		await act(async () => fireEvent.click(send()));
		await confirm();
		expect(order.payload.meta_data).toEqual(meta);
		expect(mockMove).not.toHaveBeenCalled();
	});

	it('holds Send while the new cashier name is still resolving', async () => {
		renderBox();
		await stage({ cashier_id: '10' });
		expect(box().dataset.tone).toBe('warning');
		expect(send().disabled).toBe(true);
	});

	it('a re-pick of the same store (the phone sheet reports it) keeps the chosen register', async () => {
		mockStores = [
			{ id: 2, name: 'Main' },
			{ id: 5, name: 'Annex' },
		];
		mockDirectories = {
			...mockDirectories,
			'5': [
				{ id: 'r5a', name: 'A' },
				{ id: 'r5b', name: 'B' },
			],
		};
		renderBox();
		await choose('order-meta-store-select', '5');
		await choose('order-meta-register-select', 'r5b');
		await choose('order-meta-store-select', '5');
		expect(selectProps('order-meta-register-select')!.value).toBe('r5b');
		expect(send().disabled).toBe(false);
	});

	it('a failed hand-over clears a register the order never had and restores its store', async () => {
		mockPush.mockRejectedValueOnce(new Error('offline'));
		mockStores = [
			{ id: 2, name: 'Main' },
			{ id: 6, name: 'Kiosk' },
		];
		mockDirectories = { ...mockDirectories, '6': [{ id: 'r6', name: 'Kiosk till' }] };
		const unregistered = meta.filter((entry) => entry.key !== '_wcpos_register');
		const resident = { ...order, payload: { ...payload, meta_data: unregistered } };
		resident.getLatest = () => resident;
		render(
			<EditOrderMetaForm
				order={resident as never}
				{...formProps({ ...payload, cashier_id: '7', meta_data: unregistered })}
			/>
		);
		await choose('order-meta-store-select', '6');
		await act(async () => fireEvent.click(send()));
		await confirm();
		const stored = resident.payload.meta_data as { key: string; value: string }[];
		expect(stored.find((entry) => entry.key === '_wcpos_register')?.value ?? '').toBe('');
		expect(stored.find((entry) => entry.key === '_pos_store')?.value).toBe('2');
		expect(mockMove).not.toHaveBeenCalled();
	});
});

describe('the Tax exempt row', () => {
	const flag = () =>
		(screen.getByTestId('order-meta-tax-exempt-switch') as HTMLInputElement).checked;
	function renderResident(meta_data: { key: string; value: string }[]) {
		const resident = { ...order, payload: { ...payload, meta_data } };
		resident.getLatest = () => resident;
		// The command, as far as this form sees it: it stamps the flag on the live record.
		mockSetTaxExempt.mockImplementation(async (record: typeof resident, exempt: boolean) => {
			record.payload = {
				...record.payload,
				meta_data: wooMetaCarrier.stampVatExempt(record.payload.meta_data, exempt) as typeof meta,
			};
		});
		const view = render(
			<EditOrderMetaForm
				order={resident as never}
				{...formProps({ ...payload, cashier_id: '7', meta_data })}
			/>
		);
		return { resident, view };
	}

	it('sits above the custom fields; flipping runs the command, never the autosave', async () => {
		const { resident } = renderResident(meta);
		const row = screen.getByTestId('order-meta-tax-exempt');
		expect(row.textContent).toContain('pos_cart.tax_exempt');
		expect(row.textContent).toContain('pos_cart.tax_exempt_hint');
		expect(flag()).toBe(false);
		await act(async () => fireEvent.click(screen.getByTestId('order-meta-tax-exempt-switch')));
		expect(mockSetTaxExempt).toHaveBeenCalledWith(resident, true);
		await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
		expect(mockPatch).not.toHaveBeenCalled();
		expect(screen.queryAllByDisplayValue('is_vat_exempt')).toHaveLength(0);
	});

	it('reads the flag from the live record and names why it cannot change', () => {
		const { resident, view } = renderResident([...meta, { key: 'is_vat_exempt', value: 'yes' }]);
		expect(flag()).toBe(true);
		resident.payload = { ...resident.payload, status: 'completed' };
		view.rerender(
			<EditOrderMetaForm
				order={resident as never}
				{...formProps({ ...payload, cashier_id: '7' })}
			/>
		);
		const toggle = screen.getByTestId('order-meta-tax-exempt-switch') as HTMLInputElement;
		expect(toggle.disabled).toBe(true);
		expect(screen.getByTestId('order-meta-tax-exempt').textContent).toContain(
			'pos_cart.tax_exempt_reopen'
		);
	});

	// The command waits on coupon references from the store: an unreachable website is offline too.
	it.each(['offline', 'online-website-unavailable'])(
		'a couponed order asks for the store when %s',
		(status) => {
			mockOnlineStatus = status;
			const { resident, view } = renderResident(meta);
			resident.payload = { ...resident.payload, coupon_lines: [{ code: 'save10' }] } as never;
			view.rerender(
				<EditOrderMetaForm
					order={resident as never}
					{...formProps({ ...payload, cashier_id: '7' })}
				/>
			);
			expect(
				(screen.getByTestId('order-meta-tax-exempt-switch') as HTMLInputElement).disabled
			).toBe(true);
			expect(screen.getByTestId('order-meta-tax-exempt').textContent).toContain(
				'pos_cart.tax_exempt_offline'
			);
		}
	);

	// The command reads these at toggle time; the row subscribes, so it never offers a refused toggle.
	it('disables with the payment hint when checkout opens or the save is refused, order unchanged', () => {
		const disabled = () =>
			(screen.getByTestId('order-meta-tax-exempt-switch') as HTMLInputElement).disabled;
		const hint = () => screen.getByTestId('order-meta-tax-exempt').textContent;
		try {
			renderResident(meta);
			expect(disabled()).toBe(false);
			act(() => enterCheckout('order-1'));
			expect(disabled()).toBe(true);
			expect(hint()).toContain('pos_cart.tax_exempt_payment');
			act(() => leaveCheckout('order-1'));
			expect(disabled()).toBe(false);
			act(() => markOrderSaveRejected('order-1', { status: 400, reason: null, message: null }));
			expect(disabled()).toBe(true);
			expect(hint()).toContain('pos_cart.tax_exempt_payment');
		} finally {
			act(() => resetCheckoutMode());
		}
	});

	it('is hidden on a store whose prices include tax', () => {
		mockPricesIncludeTax = true;
		renderResident(meta);
		expect(screen.queryByTestId('order-meta-tax-exempt')).toBeNull();
	});

	it('a custom-field edit before and after a toggle, across a delayed autosave, keeps the flag', async () => {
		const { resident } = renderResident([...meta, { key: 'custom', value: 'before' }]);
		const apply = mockPatch.getMockImplementation()!;
		let release: () => void = () => undefined;
		const held = new Promise<void>((resolve) => (release = resolve));
		mockPatch.mockImplementationOnce(async (input) => {
			await held;
			return apply(input);
		});
		fireEvent.change(screen.getByDisplayValue('before'), { target: { value: 'mid' } });
		await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
		await act(async () => fireEvent.click(screen.getByTestId('order-meta-tax-exempt-switch')));
		await act(async () => release());
		await waitFor(() =>
			expect(resident.payload.meta_data).toContainEqual({ key: 'custom', value: 'mid' })
		);
		expect(wooMetaCarrier.vatExempt(resident.payload.meta_data)).toBe(true);
		fireEvent.change(screen.getByDisplayValue('mid'), { target: { value: 'after' } });
		await waitFor(() =>
			expect(resident.payload.meta_data).toContainEqual({ key: 'custom', value: 'after' })
		);
		expect(wooMetaCarrier.vatExempt(resident.payload.meta_data)).toBe(true);
		expect(mockSetTaxExempt).toHaveBeenCalledTimes(1);
	});
});
