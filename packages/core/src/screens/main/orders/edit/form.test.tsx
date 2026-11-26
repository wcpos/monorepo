/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { getLogger, markErrorReported } from '@wcpos/utils/logger';
import { type EngineRecord, WriteOutcomeTimeoutError } from '@wcpos/query';

import { EditOrderForm } from './form';

// Paid on has its own integration suite; keep this form harness focused on its existing rows.
jest.mock('./paid-on', () => ({ PaidOn: () => null }));

const testLogger = getLogger(['test']);

const mockPushDocument = jest.fn();
const mockLocalPatch = jest.fn();
const mockDialogClose = jest.fn();
const modalActions = new Map<string, { onPress?: () => unknown; disabled: boolean }>();

type Customer = {
	id: number;
	first_name: string;
	last_name: string;
	email: string;
	billing: Record<string, unknown>;
	shipping: Record<string, unknown>;
	tax_ids: unknown[];
};

type CustomerRecord = {
	uuid: string;
	payload: Customer;
	getLatest: () => CustomerRecord;
	toMutableJSON: () => { payload: Customer };
	collection: { name: string };
};
type CustomerValueRef = { current: CustomerRecord | null };

const customerResources = new Map<number, { valueRef$$: Subject<CustomerValueRef> }>();
const mockMarkSaved = jest.fn();
const mockFlush = jest.fn();
const mockFormSelect = jest.fn();
const mockSaveOrderFields = jest.fn();
let capturedChange: ((changes: Record<string, unknown>) => Promise<boolean>) | undefined;
let draft: Record<string, unknown>;
let mockStatus = 'on-hold';
const fieldOnChange = jest.fn();
let selectCustomer: (value: string) => void = () => undefined;
// The Cashier and Store rows: the picks, who may change them, what the server offers, the stores.
let mockPicks: Record<string, string> = {};
let mockCanReassign = false;
let mockFeatures: string[] = [];
let mockStores: { id: number; name: string }[] = [];
const mockCashierCombobox = jest.fn();

const mockWatch = (name: string) =>
	name === 'status' ? mockStatus : name in mockPicks ? mockPicks[name] : draft[name];

const form = {
	control: {},
	trigger: jest.fn(async () => true),
	getValues: jest.fn((name?: string) => (name ? draft[name] : draft)),
	reset: jest.fn((values: Record<string, unknown>) => {
		draft = values;
	}),
};
const statusForm = {
	control: {},
	reset: jest.fn(),
	handleSubmit: (callback: (data: { status: string }) => unknown) => () =>
		callback({ status: mockStatus }),
};
const identityForm = { control: {} };

jest.mock('../commands/use-order-record', () => {
	const actual = jest.requireActual('../commands/use-order-record');
	return {
		...actual,
		useOrderRecord: () => {
			const commands = actual.useOrderRecord();
			mockSaveOrderFields.mockImplementation(commands.saveOrderFields);
			return { ...commands, saveOrderFields: mockSaveOrderFields };
		},
	};
});

jest.mock('react-hook-form', () => ({
	useForm: (options: { values?: Record<string, unknown> }) =>
		options.values ? ('status' in options.values ? statusForm : identityForm) : form,
	useWatch: ({ name }: { name: string }) => mockWatch(name),
}));

jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservablePickState: (_observable: unknown, projector: () => unknown) => projector(),
	useObservableSuspense: () => mockStores,
}));

jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormCombobox: (props: { name: string; onChange: (value: string) => void }) => {
		if (props.name === 'cashier_id') mockCashierCombobox(props);
		else selectCustomer = props.onChange;
		return null;
	},
	FormField: ({
		name,
		render: renderField,
	}: {
		name: string;
		render: (input: { field: Record<string, unknown> }) => React.ReactNode;
	}) =>
		renderField({
			field: { name, value: name === 'customer_id' ? 1 : '', onChange: fieldOnChange },
		}),
	FormItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormLabel: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SavedFieldProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SavedMark: () => null,
	useSavedName: () => '',
	useMarkSaved: () => mockMarkSaved,
	useMarkFailed: () => jest.fn(),
	useFormChangeHandler: (options: { onChange: typeof capturedChange }) => {
		capturedChange = options.onChange;
		return { flush: mockFlush };
	},
	FormInput: () => null,
	FormSelect: (props: unknown) => {
		mockFormSelect(props);
		return null;
	},
	FormTextarea: () => null,
}));

function mockAction({
	children,
	onPress,
	disabled,
	testID,
}: React.PropsWithChildren<{
	onPress?: () => unknown;
	disabled?: boolean;
	testID?: string;
}>) {
	if (testID) modalActions.set(testID, { onPress, disabled: !!disabled });
	return <>{children}</>;
}
jest.mock('@wcpos/components/button', () => ({ Button: mockAction }));
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogAction: mockAction,
	DialogClose: mockAction,
	DialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter,
	useDialog: () => ({ close: mockDialogClose }),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('../../components/customer/address', () => ({
	billingAddressSchema: { shape: {} },
	shippingAddressSchema: { shape: {} },
}));
jest.mock('../../components/customer/address-rows', () => ({
	useAddressFacts: () => ({
		linked: false,
		focus: null,
		labels: {},
		isEmpty: () => true,
		clear() {},
		added() {},
		layout: () => ({ offered: [], rows: null }),
	}),
	ADDRESS_FACTS: [{ name: 'company' }, { name: 'billing' }, { name: 'shipping' }],
	ADDRESS_PARTS: [],
	asShipping: (billing: unknown) => billing,
	TextPart: () => null,
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: null, wpCredentials: {} }),
}));
jest.mock('../../components/cashier-select', () => ({ CashierSelect: () => null }));
jest.mock('../../hooks/store-list-resource', () => ({ storeListResource: () => ({}) }));
jest.mock('../../hooks/use-cashier-label', () => ({
	useCashierLabel: (id: string) => ({ label: id ? `Cashier ${id}` : '' }),
}));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ known: true, caps: { canReassignSales: mockCanReassign } }),
}));
jest.mock('../../hooks/use-server-feature', () => ({
	useServerFeature: (name: string) => mockFeatures.includes(name),
}));
jest.mock('../../components/currency-select', () => ({ CurrencySelect: () => null }));
jest.mock('../../components/customer-select', () => ({ CustomerSelect: () => null }));
jest.mock('../../components/customer/tax-ids-form', () => ({
	useNewTaxIdRow: () => () => ({ type: 'eu_vat', value: '', country: '' }),
	TaxIdsForm: () => null,
	taxIdsFormSchema: {},
}));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
const mockMetaDataForm = jest.fn();
jest.mock('../../components/meta-data-form', () => ({
	MetaDataForm: (props: unknown) => {
		mockMetaDataForm(props);
		return null;
	},
	metaDataSchema: {},
}));
jest.mock('../../components/order/order-status-select', () => ({ OrderStatusSelect: () => null }));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../contexts/use-push-document', () => ({ usePushDocument: () => mockPushDocument }));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Customer' }),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	...jest.requireActual('@wcpos/query/record-readers'),
	useEngineRecordByWooId: (_collection: string, wooId: number) => customerResources.get(wooId),
}));
jest.mock('../../hooks/use-guest-customer', () => ({
	useGuestCustomer: () => ({ billing: {}, shipping: {}, tax_ids: [] }),
}));

const orderPayload = {
	id: 50,
	status: 'pending',
	total: '100',
	refunds: [] as { total: string }[],
	customer_id: 1,
	billing: { first_name: 'Previous' },
	shipping: { first_name: 'Previous' },
	meta_data: [] as { key: string; value: string }[],
	tax_ids: [],
};
const order = {
	uuid: 'order-50',
	payload: orderPayload,
	$: new BehaviorSubject({ toJSON: () => ({ payload: orderPayload }) }),
	getLatest: () => order,
	toMutableJSON: () => ({ payload: orderPayload }),
	collection: { name: 'orders' },
} as unknown as EngineRecord<'orders'>;

function customer(id: number): CustomerRecord {
	// Engine-record-shaped on purpose: the production hook returns EngineRecord<'customers'>,
	// and a flat fixture would exercise only the guest-object branch of handleCustomerChange —
	// leaving getLatest().payload extraction untested.
	const payload: Customer = {
		id,
		first_name: `Customer ${id}`,
		last_name: '',
		email: `${id}@example.com`,
		billing: { first_name: `Billing ${id}` },
		shipping: { first_name: `Shipping ${id}` },
		tax_ids: [{ id }],
	};
	const record: CustomerRecord = {
		uuid: `customer-${id}`,
		payload,
		getLatest: () => record,
		toMutableJSON: () => ({ payload }),
		collection: { name: 'customers' },
	};
	return record;
}

async function degradeStorage(databaseName: string) {
	const instance = {
		schema: { version: 0, type: 'object', properties: {}, primaryKey: 'id' },
		findDocumentsById: jest.fn(),
		bulkWrite: jest
			.fn()
			.mockRejectedValue(
				new Error(
					'could not requestRemote: {"methodName":"bulkWrite","error":{"message":"worker gone"}}'
				)
			),
		query: jest.fn(),
		count: jest.fn(),
		getAttachmentData: jest.fn(),
		getChangedDocumentsSince: jest.fn(),
		changeStream: jest.fn(),
		cleanup: jest.fn(),
		close: jest.fn().mockResolvedValue(undefined),
		remove: jest.fn(),
		collectionName: 'orders',
		databaseName,
		internals: {},
		options: {},
	};
	const wrapped = await wrappedErrorHandlerStorage({
		storage: {
			name: 'mock-storage',
			rxdbVersion: '17.4.0',
			createStorageInstance: jest.fn().mockResolvedValue(instance),
		} as never,
	}).createStorageInstance({ databaseName } as never);

	await act(async () => {
		await expect(wrapped.bulkWrite([{ document: { id: '1' } }] as never, 'test')).rejects.toThrow();
	});
}

beforeEach(() => {
	jest.clearAllMocks();
	mockLocalPatch.mockReset().mockResolvedValue({ changes: {}, document: order });
	mockPushDocument.mockReset().mockResolvedValue(order);
	mockFlush.mockReset().mockResolvedValue(true);
	mockFormSelect.mockReset();
	mockStatus = 'on-hold';
	orderPayload.status = 'pending';
	orderPayload.meta_data = [];
	orderPayload.total = '100';
	orderPayload.refunds = [];
	draft = { ...orderPayload };
	capturedChange = undefined;
	modalActions.clear();
	mockPicks = {};
	mockCanReassign = false;
	mockFeatures = [];
	mockStores = [];
	customerResources.clear();
	customerResources.set(0, {
		valueRef$$: new BehaviorSubject<CustomerValueRef>({ current: null }),
	});
});

afterEach(() => {
	act(() => clearStorageDegradation());
});

async function updateStatus() {
	await act(async () => {
		await modalActions.get('order-edit-update-status')!.onPress!();
	});
}

async function editField(name: string, value: unknown) {
	let written: boolean | undefined;
	await act(async () => {
		written = await capturedChange!({ [name]: value });
	});
	return written;
}

describe('EditOrderForm customer lookup', () => {
	it('writes one customer snapshot after flushing and resets the draft when the selected lookup resolves', async () => {
		const selectedCustomer$ = new Subject<CustomerValueRef>();
		customerResources.set(2, { valueRef$$: selectedCustomer$ });
		render(<EditOrderForm order={order} />);
		act(() => selectCustomer('2'));
		expect(fieldOnChange).not.toHaveBeenCalled();
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(form.reset).not.toHaveBeenCalled();
		expect(testLogger.error).not.toHaveBeenCalled();

		await act(async () => {
			selectedCustomer$.next({ current: customer(2) });
		});

		const patch = {
			customer_id: 2,
			billing: { first_name: 'Billing 2', last_name: '', email: '2@example.com' },
			shipping: { first_name: 'Shipping 2' },
			tax_ids: [{ id: 2 }],
		};
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).toHaveBeenCalledWith(
			{ document: order, data: patch },
			{ stampTill: false }
		);
		expect(mockFlush.mock.invocationCallOrder[0]).toBeLessThan(
			mockLocalPatch.mock.invocationCallOrder[0]
		);
		expect(form.reset).toHaveBeenCalledWith({ ...orderPayload, ...patch });
		expect(mockMarkSaved).toHaveBeenCalledWith(['billing', 'shipping', 'tax_ids', 'customer_id']);
		expect(mockPushDocument).not.toHaveBeenCalled();
	});

	it('reports a missing customer only when the selected lookup resolves null', () => {
		const selectedCustomer$ = new Subject<CustomerValueRef>();
		customerResources.set(3, { valueRef$$: selectedCustomer$ });
		render(<EditOrderForm order={order} />);
		act(() => selectCustomer('3'));
		expect(testLogger.info).not.toHaveBeenCalled();
		act(() => selectedCustomer$.next({ current: null }));
		expect(testLogger.error).not.toHaveBeenCalled();
		expect(testLogger.info).toHaveBeenCalledWith('Selected customer is not on this device', {
			showToast: true,
			toast: { title: 'orders.customer_not_on_device', type: 'warning' },
			context: { customerId: 3 },
		});
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(form.reset).not.toHaveBeenCalled();
	});

	it('attaches the guest and clears the previous tax-ID snapshot', async () => {
		render(<EditOrderForm order={order} />);
		await act(async () => selectCustomer('0'));
		expect(mockLocalPatch).toHaveBeenCalledWith(
			{
				document: order,
				data: {
					customer_id: 0,
					billing: { first_name: undefined, last_name: undefined, email: undefined },
					shipping: {},
					tax_ids: [],
				},
			},
			{ stampTill: false }
		);
	});

	it.each(['flush', 'write'])(
		'does not reset the customer draft when the %s fails',
		async (failure) => {
			if (failure === 'flush') mockFlush.mockResolvedValue(false);
			else mockLocalPatch.mockResolvedValue(undefined);
			render(<EditOrderForm order={order} />);
			await act(async () => selectCustomer('0'));
			expect(form.reset).not.toHaveBeenCalled();
			expect(mockMarkSaved).not.toHaveBeenCalled();
			if (failure === 'flush') expect(mockLocalPatch).not.toHaveBeenCalled();
		}
	);
});

describe('EditOrderForm autosave', () => {
	it('writes and marks a customer_note edit without pushing', async () => {
		draft.customer_note = 'Leave at reception';
		render(<EditOrderForm order={order} />);
		expect(await editField('customer_note', draft.customer_note)).toBe(true);
		expect(mockLocalPatch).toHaveBeenCalledWith(
			{
				document: order,
				data: { customer_note: 'Leave at reception' },
			},
			{ stampTill: false }
		);
		expect(mockMarkSaved).toHaveBeenCalledWith(['customer_note']);
		expect(mockPushDocument).not.toHaveBeenCalled();
		// The footer's Close is the slot stand-in's own button; Save is gone from the footer.
		expect(screen.getByTestId('order-edit-close-button')).toBeTruthy();
		expect(screen.queryByTestId('order-edit-save-button')).toBeNull();
	});

	it('validates and writes the whole billing root for a billing.city edit', async () => {
		draft.billing = { first_name: 'Previous', city: 'Madrid' };
		render(<EditOrderForm order={order} />);
		expect(await editField('billing.city', 'Madrid')).toBe(true);
		expect(form.trigger).toHaveBeenCalledWith('billing');
		expect(mockLocalPatch).toHaveBeenCalledWith(
			{
				document: order,
				data: { billing: { first_name: 'Previous', city: 'Madrid' } },
			},
			{ stampTill: false }
		);
		expect(mockMarkSaved).toHaveBeenCalledWith(['billing']);
	});

	it('an address with an invalid field elsewhere in it is not written for a sibling edit', async () => {
		form.trigger.mockResolvedValueOnce(false);
		draft.billing = { email: 'not-an-email', city: 'Madrid' };
		render(<EditOrderForm order={order} />);
		expect(await editField('billing.city', 'Madrid')).toBe(false);
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockMarkSaved).not.toHaveBeenCalled();
	});

	it('writes meta_data without protected keys or blank rows', async () => {
		draft.meta_data = [
			{ key: '_pos_user', value: '7' },
			{ key: 'custom', value: 'edited' },
			{ key: '', value: '' },
		];
		render(<EditOrderForm order={order} />);
		await editField('meta_data.1.value', 'edited');
		expect(mockLocalPatch).toHaveBeenCalledWith(
			{
				document: order,
				data: { meta_data: [{ key: 'custom', value: 'edited' }] },
			},
			{ stampTill: false }
		);
	});

	it('never lists is_vat_exempt as a custom field', () => {
		render(<EditOrderForm order={order} />);
		expect(mockMetaDataForm.mock.calls.at(-1)![0].hiddenKeys).toContain('is_vat_exempt');
	});

	it('writes tax_ids without blank rows', async () => {
		draft.tax_ids = [
			{ type: 'vat', value: 'ABC' },
			{ type: 'vat', value: '' },
		];
		render(<EditOrderForm order={order} />);
		await editField('tax_ids.0.value', 'ABC');
		expect(mockLocalPatch).toHaveBeenCalledWith(
			{
				document: order,
				data: { tax_ids: [{ type: 'vat', value: 'ABC' }] },
			},
			{ stampTill: false }
		);
	});

	it('does not mark an edit when its local patch fails', async () => {
		mockLocalPatch.mockResolvedValue(undefined);
		render(<EditOrderForm order={order} />);
		expect(await editField('customer_note', 'note')).toBe(false);
		expect(mockMarkSaved).not.toHaveBeenCalled();
	});
});

describe('EditOrderForm while storage is degraded', () => {
	it('disables Update status and refuses field, customer and status writes', async () => {
		render(<EditOrderForm order={order} />);
		expect(modalActions.get('order-edit-update-status')?.disabled).toBe(false);
		await degradeStorage('degraded-order-edit');
		expect(modalActions.get('order-edit-update-status')?.disabled).toBe(true);
		expect(await editField('customer_note', 'note')).toBe(false);
		await updateStatus();
		await act(async () => selectCustomer('0'));
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
	});

	it('stops before pushing when storage degrades during the local patch', async () => {
		let resolveLocalPatch!: (value: unknown) => void;
		mockLocalPatch.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveLocalPatch = resolve;
				})
		);
		render(<EditOrderForm order={order} />);
		await updateStatus();
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		await degradeStorage('degraded-order-edit-during-patch');
		await act(async () => {
			resolveLocalPatch({ document: order });
		});
		expect(mockPushDocument).not.toHaveBeenCalled();
	});
});

describe('EditOrderForm Update status', () => {
	// Mirrors the legacy JSON ledger fixture in order-math/src/payments/ledger.test.ts.
	const capturedMeta = [
		{
			key: '_wcpos_payments',
			value: JSON.stringify({
				schema: 1,
				payments: [
					{
						id: 'p1',
						source: 'app',
						order_id: 0,
						method_id: 'pos_cash',
						provider: null,
						kind: 'cash',
						capture_mode: 'manual',
						transport: null,
						recorded_offline: false,
						amount: '16.83',
						currency: 'USD',
						tendered: null,
						change: null,
						tip: null,
						status: 'captured',
						failure_reason: null,
						refunded_amount: '0.00',
						refunds: [],
						provider_refs: {},
						receipt: {},
						cashier_id: 1,
						store_id: null,
						created_at_gmt: '2026-01-01T00:00:00Z',
						captured_at_gmt: '2026-01-01T00:00:00Z',
						updated_at_gmt: '2026-01-01T00:00:00Z',
					},
				],
			}),
		},
	];

	it.each([
		[
			'hides Cancelled with captured money',
			'pos-open',
			capturedMeta,
			['pos-open', 'pending', 'on-hold'],
			false,
		],
		[
			'offers Cancelled without payments',
			'pos-open',
			[],
			['pos-open', 'pending', 'on-hold', 'cancelled'],
			false,
		],
		[
			'keeps the current Cancelled status with captured money',
			'cancelled',
			capturedMeta,
			['pos-open', 'pending', 'on-hold', 'cancelled'],
			false,
		],
		[
			'keeps a non-pushable status read-only with captured money',
			'completed',
			capturedMeta,
			['pos-open', 'pending', 'on-hold', 'completed'],
			true,
		],
	] as const)('%s', (_name, status, meta, allowed, disabled) => {
		orderPayload.status = status;
		orderPayload.meta_data = [...meta];
		render(<EditOrderForm order={order} />);
		const [picker] = mockFormSelect.mock.calls.find(([props]) => props.name === 'status')!;
		expect(picker).toEqual(expect.objectContaining({ name: 'status', allowed, disabled }));
	});

	it('offers Cancelled after the captured row is fully refunded', () => {
		const ledger = JSON.parse(capturedMeta[0].value);
		ledger.payments[0].refunds = [
			{ id: 1, amount: '16.83', status: 'succeeded', provider_ref: null },
		];
		orderPayload.meta_data = [{ key: '_wcpos_payments', value: JSON.stringify(ledger) }];
		render(<EditOrderForm order={order} />);
		const [picker] = mockFormSelect.mock.calls.find(([props]) => props.name === 'status')!;
		expect(picker.allowed).toContain('cancelled');
	});

	it('offers Cancelled after an unallocated Woo refund exhausts the captured money', () => {
		const ledger = JSON.parse(capturedMeta[0].value);
		ledger.payments[0].amount = '20';
		orderPayload.status = 'pos-open';
		orderPayload.total = '100';
		orderPayload.refunds = [{ total: '-20' }];
		orderPayload.meta_data = [{ key: '_wcpos_payments', value: JSON.stringify(ledger) }];
		render(<EditOrderForm order={order} />);
		const [picker] = mockFormSelect.mock.calls.find(([props]) => props.name === 'status')!;
		expect(picker.allowed).toContain('cancelled');
	});

	it('does not save Cancelled when a payment lands after it was picked', async () => {
		const view = render(<EditOrderForm order={order} />);
		const [picker] = mockFormSelect.mock.calls.find(([props]) => props.name === 'status')!;
		expect(picker.allowed).toContain('cancelled');
		mockStatus = 'cancelled';
		view.rerender(<EditOrderForm order={order} />);
		orderPayload.meta_data = capturedMeta;
		view.rerender(<EditOrderForm order={order} />);

		await updateStatus();

		expect(mockFlush).toHaveBeenCalled();
		expect(mockSaveOrderFields).not.toHaveBeenCalled();
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(statusForm.reset).toHaveBeenCalledWith({ status: 'pending' });
		expect(modalActions.get('order-edit-update-status')?.disabled).toBe(false);
	});

	it('flushes, writes only the changed status and pushes without closing the modal', async () => {
		render(<EditOrderForm order={order} />);
		await updateStatus();
		expect(mockFlush.mock.invocationCallOrder[0]).toBeLessThan(
			mockLocalPatch.mock.invocationCallOrder[0]
		);
		expect(mockLocalPatch).toHaveBeenCalledWith(
			{
				document: order,
				data: { status: 'on-hold' },
			},
			{ stampTill: false }
		);
		expect(mockLocalPatch.mock.invocationCallOrder[0]).toBeLessThan(
			mockPushDocument.mock.invocationCallOrder[0]
		);
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
		expect(testLogger.success).toHaveBeenCalledWith('orders.status_updated', {
			showToast: true,
			context: { orderId: 50, status: 'on-hold' },
		});
		expect(mockDialogClose).not.toHaveBeenCalled();
	});

	it('does not write an unchanged status', async () => {
		mockStatus = 'pending';
		render(<EditOrderForm order={order} />);
		expect(modalActions.get('order-edit-update-status')?.disabled).toBe(true);
		await updateStatus();
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
	});

	it('restores the previous status and pushes the revert when a push fails', async () => {
		mockPushDocument.mockRejectedValueOnce(new Error('HTTP 500'));
		render(<EditOrderForm order={order} />);
		await updateStatus();
		expect(mockLocalPatch).toHaveBeenCalledTimes(2);
		expect(mockLocalPatch).toHaveBeenNthCalledWith(
			2,
			{
				document: order,
				data: { status: 'pending' },
			},
			{ stampTill: false }
		);
		expect(mockPushDocument).toHaveBeenCalledTimes(2);
		expect(testLogger.error).toHaveBeenCalledWith(
			'Failed to update order status',
			expect.anything()
		);
		expect(testLogger.success).not.toHaveBeenCalled();
		expect(mockDialogClose).not.toHaveBeenCalled();
	});

	it('keeps the status when the push is still pending (offline, slow store): no revert, "still on its way"', async () => {
		mockPushDocument.mockRejectedValueOnce(new WriteOutcomeTimeoutError('m-1', {}));
		render(<EditOrderForm order={order} />);
		await updateStatus();
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
		expect(testLogger.warn).toHaveBeenCalledWith(
			'Failed to update order status',
			expect.objectContaining({
				toast: expect.objectContaining({ title: 'common.order_still_sending' }),
			})
		);
		expect(testLogger.error).not.toHaveBeenCalled();
	});

	it('does not report a localPatch rethrow a second time', async () => {
		const reported = new Error('Active engine scope changed twice');
		markErrorReported(reported);
		mockLocalPatch.mockRejectedValue(reported);
		render(<EditOrderForm order={order} />);
		await updateStatus();
		expect(testLogger.error).not.toHaveBeenCalled();
		expect(testLogger.debug).not.toHaveBeenCalledWith(
			'Failed to update order status',
			expect.anything()
		);
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(mockDialogClose).not.toHaveBeenCalled();
	});

	it.each(['flush', 'write'])('does not push or close when the %s fails', async (failure) => {
		if (failure === 'flush') mockFlush.mockResolvedValue(false);
		else mockLocalPatch.mockResolvedValue(undefined);
		render(<EditOrderForm order={order} />);
		await updateStatus();
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(mockDialogClose).not.toHaveBeenCalled();
		expect(testLogger.error).not.toHaveBeenCalled();
		if (failure === 'flush') expect(mockLocalPatch).not.toHaveBeenCalled();
	});
});

describe('EditOrderForm Cashier and Store', () => {
	const sale = () => [
		{ id: 1, key: '_pos_user', value: '7' },
		{ id: 2, key: '_pos_store', value: '3' },
		{ id: 3, key: '_wcpos_register', value: 'r1' },
		{ id: 4, key: '_wcpos_till', value: 't1' },
		{ id: 5, key: 'custom', value: 'kept' },
	];
	const pickers = () => ({
		cashier: mockCashierCombobox.mock.calls.length > 0,
		store: mockFormSelect.mock.calls.some(([props]) => props.name === 'store_id'),
	});

	// What each write set: the record holds it, and a resolver runs on the payload it lands on.
	let writes: Record<string, unknown>[];
	let beforeWrite: () => void;

	beforeEach(() => {
		writes = [];
		beforeWrite = () => undefined;
		mockLocalPatch.mockImplementation(async ({ data, changes }) => {
			beforeWrite();
			const patch = changes ? changes(orderPayload) : data;
			writes.push(patch);
			Object.assign(orderPayload, patch);
			return { document: order, changes: patch };
		});
		orderPayload.meta_data = sale();
		mockCanReassign = true;
		mockFeatures = ['order_cashier_reassignment'];
		mockStores = [
			{ id: 3, name: 'Main' },
			{ id: 4, name: 'Annex' },
		];
		mockPicks = { cashier_id: '7', store_id: '3' };
	});

	async function press(testID: string) {
		await act(async () => {
			await modalActions.get(testID)!.onPress!();
		});
	}

	it('writes one meta patch that changes only the cashier, then pushes without closing', async () => {
		mockPicks.cashier_id = '9';
		render(<EditOrderForm order={order} />);
		expect(modalActions.get('order-edit-update-cashier')?.disabled).toBe(false);
		await press('order-edit-update-cashier');
		const [user, ...rest] = sale();
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockLocalPatch).toHaveBeenCalledWith(
			{ document: order, changes: expect.any(Function) },
			{ stampTill: false }
		);
		expect(writes).toEqual([{ meta_data: [{ ...user, value: '9' }, ...rest] }]);
		expect(mockFlush.mock.invocationCallOrder[0]).toBeLessThan(
			mockLocalPatch.mock.invocationCallOrder[0]
		);
		expect(mockLocalPatch.mock.invocationCallOrder[0]).toBeLessThan(
			mockPushDocument.mock.invocationCallOrder[0]
		);
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
		expect(testLogger.success).toHaveBeenCalledWith('orders.cashier_updated', expect.anything());
		expect(mockDialogClose).not.toHaveBeenCalled();
	});

	it('leaves an order without a store row without one when the cashier changes', async () => {
		orderPayload.meta_data = sale().filter((row) => row.key !== '_pos_store');
		mockPicks = { cashier_id: '9', store_id: '' };
		render(<EditOrderForm order={order} />);
		await press('order-edit-update-cashier');
		const written = writes[0].meta_data as { key: string }[];
		expect(written.some((row: { key: string }) => row.key === '_pos_store')).toBe(false);
		expect(written).toHaveLength(4);
	});

	it('writes one meta patch that changes only the store, then pushes', async () => {
		mockPicks.store_id = '4';
		render(<EditOrderForm order={order} />);
		await press('order-edit-update-store');
		const [user, store, ...rest] = sale();
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(writes).toEqual([{ meta_data: [user, { ...store, value: '4' }, ...rest] }]);
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
		expect(testLogger.success).toHaveBeenCalledWith('orders.store_updated', expect.anything());
	});

	it('disables Update cashier and Update store while each pick is the current value', async () => {
		render(<EditOrderForm order={order} />);
		expect(modalActions.get('order-edit-update-cashier')?.disabled).toBe(true);
		expect(modalActions.get('order-edit-update-store')?.disabled).toBe(true);
		await press('order-edit-update-cashier');
		await press('order-edit-update-store');
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
	});

	it('disables Update cashier and Update store while a pick is empty (a cleared picker)', async () => {
		mockPicks = { cashier_id: '', store_id: '' };
		render(<EditOrderForm order={order} />);
		expect(modalActions.get('order-edit-update-cashier')?.disabled).toBe(true);
		expect(modalActions.get('order-edit-update-store')?.disabled).toBe(true);
	});

	it('restores the previous cashier and pushes the revert when the push is refused', async () => {
		mockPicks.cashier_id = '9';
		mockPushDocument.mockRejectedValueOnce(new Error('HTTP 500'));
		render(<EditOrderForm order={order} />);
		await press('order-edit-update-cashier');
		expect(mockLocalPatch).toHaveBeenCalledTimes(2);
		const [user, ...rest] = sale();
		// The revert is resolved on the order carrying cashier 9: it turns 9 back into 7 and leaves
		// every other row as it was.
		expect(writes).toEqual([
			{ meta_data: [{ ...user, value: '9' }, ...rest] },
			{ meta_data: sale() },
		]);
		expect(orderPayload.meta_data).toEqual(sale());
		expect(mockPushDocument).toHaveBeenCalledTimes(2);
		expect(testLogger.success).not.toHaveBeenCalled();
	});

	it('leaves a newer cashier alone when the refused write has been overtaken: no revert, no revert push', async () => {
		mockPicks.cashier_id = '9';
		mockPushDocument.mockImplementationOnce(async () => {
			// Cashier 11 is assigned from elsewhere while the refused write is out.
			orderPayload.meta_data = orderPayload.meta_data.map((row) =>
				row.key === '_pos_user' ? { ...row, value: '11' } : row
			);
			throw new Error('HTTP 500');
		});
		render(<EditOrderForm order={order} />);
		await press('order-edit-update-cashier');
		expect(writes[1]).toEqual({});
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
		expect(orderPayload.meta_data.find((row) => row.key === '_pos_user')?.value).toBe('11');
	});

	it('restores the cashier the refused write replaced, not the one the form read', async () => {
		mockPicks.cashier_id = '9';
		mockPushDocument.mockRejectedValueOnce(new Error('HTTP 500'));
		// Cashier 8 is assigned elsewhere after the form read 7, before the write lands.
		let assigned = false;
		beforeWrite = () => {
			if (assigned) return;
			assigned = true;
			orderPayload.meta_data = orderPayload.meta_data.map((row) =>
				row.key === '_pos_user' ? { ...row, value: '8' } : row
			);
		};
		render(<EditOrderForm order={order} />);
		await press('order-edit-update-cashier');
		const [user, ...rest] = sale();
		expect(writes).toEqual([
			{ meta_data: [{ ...user, value: '9' }, ...rest] },
			{ meta_data: [{ ...user, value: '8' }, ...rest] },
		]);
		expect(mockPushDocument).toHaveBeenCalledTimes(2);
	});

	it('writes, pushes and reports nothing when the order already holds the pick as the write lands', async () => {
		mockPicks.cashier_id = '9';
		beforeWrite = () => {
			orderPayload.meta_data = orderPayload.meta_data.map((row) =>
				row.key === '_pos_user' ? { ...row, value: '9' } : row
			);
		};
		render(<EditOrderForm order={order} />);
		await press('order-edit-update-cashier');
		expect(writes).toEqual([{}]);
		expect(mockPushDocument).not.toHaveBeenCalled();
		expect(testLogger.success).not.toHaveBeenCalled();
	});

	it('keeps a custom field written between the read and the identity write', async () => {
		mockPicks.cashier_id = '9';
		beforeWrite = () => {
			orderPayload.meta_data = [...orderPayload.meta_data, { key: 'late', value: 'landed' }];
		};
		render(<EditOrderForm order={order} />);
		await press('order-edit-update-cashier');
		expect(writes[0].meta_data).toContainEqual({ key: 'late', value: 'landed' });
		expect(writes[0].meta_data).toContainEqual({ id: 1, key: '_pos_user', value: '9' });
	});

	it('keeps the cashier queued when the push is still pending: no revert, "still on its way"', async () => {
		mockPicks.cashier_id = '9';
		mockPushDocument.mockRejectedValueOnce(new WriteOutcomeTimeoutError('m-1', {}));
		render(<EditOrderForm order={order} />);
		await press('order-edit-update-cashier');
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
		expect(testLogger.warn).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				toast: expect.objectContaining({ title: 'common.order_still_sending' }),
			})
		);
	});

	it('locks both rows, with no picker, without the reassign capability', () => {
		mockCanReassign = false;
		render(<EditOrderForm order={order} />);
		expect(pickers()).toEqual({ cashier: false, store: false });
		expect(modalActions.has('order-edit-update-cashier')).toBe(false);
		expect(modalActions.has('order-edit-update-store')).toBe(false);
		expect(screen.getAllByText('orders.set_at_sale')).toHaveLength(2);
		expect(screen.getByText('Cashier 7')).toBeTruthy();
		expect(screen.getByText('Main')).toBeTruthy();
	});

	it('locks the Cashier and keeps the Store editable while the server feature is absent or unknown', () => {
		mockFeatures = [];
		render(<EditOrderForm order={order} />);
		expect(pickers()).toEqual({ cashier: false, store: true });
		expect(modalActions.has('order-edit-update-cashier')).toBe(false);
		expect(modalActions.has('order-edit-update-store')).toBe(true);
		expect(screen.getAllByText('orders.set_at_sale')).toHaveLength(1);
	});

	it('writes neither while storage is degraded', async () => {
		mockPicks = { cashier_id: '9', store_id: '4' };
		render(<EditOrderForm order={order} />);
		await degradeStorage('degraded-order-edit-identity');
		expect(modalActions.get('order-edit-update-cashier')?.disabled).toBe(true);
		expect(modalActions.get('order-edit-update-store')?.disabled).toBe(true);
		await press('order-edit-update-cashier');
		await press('order-edit-update-store');
		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
	});

	it('draws no Store row when the site has no stores to choose from', () => {
		mockStores = [{ id: 0, name: 'Default' }];
		render(<EditOrderForm order={order} />);
		expect(pickers().store).toBe(false);
		expect(modalActions.has('order-edit-update-store')).toBe(false);
		expect(screen.queryByText('Main')).toBeNull();
	});

	it('draws no Cashier row for an order without a cashier', () => {
		orderPayload.meta_data = sale().filter((row) => row.key !== '_pos_user');
		mockPicks.cashier_id = '';
		render(<EditOrderForm order={order} />);
		expect(pickers().cashier).toBe(false);
		expect(modalActions.has('order-edit-update-cashier')).toBe(false);
	});
});

it('management save preserves a tombstoned money-owner hint at the mutation boundary', async () => {
	jest.clearAllMocks();
	const { patchAndEnqueueEngineResident } = jest.requireActual(
		'../../hooks/mutations/use-local-mutation'
	);
	const hint = { id: 8, key: '_wcpos_money_owner_hint', value: 'server' };
	const stored = { payload: { meta_data: [hint] } };
	const resident = {
		toJSON: () => stored,
		incrementalModify: async (modify: (old: typeof stored) => typeof stored) =>
			Object.assign(stored, modify(stored)),
	};
	mockLocalPatch.mockImplementation(async ({ data }) => ({
		document: await patchAndEnqueueEngineResident({
			manager: { engine: { write: async () => ({}), status: () => ({ activeScopeId: 'scope' }) } },
			collection: 'orders',
			recordId: order.uuid,
			changes: data,
			initial: { resident, scope: { scopeId: 'scope' } },
		}),
	}));
	draft.meta_data = [
		{ ...hint, value: null },
		{ key: 'custom', value: 'edited' },
	];
	render(<EditOrderForm order={order} />);
	await editField('meta_data.1.value', 'edited');
	expect(testLogger.error).not.toHaveBeenCalled();
	expect(stored.payload.meta_data).toEqual([hint, { key: 'custom', value: 'edited' }]);
});

jest.mock('@wcpos/query/temporary-order', () => ({}));

jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: () => '2026-10-18',
}));
