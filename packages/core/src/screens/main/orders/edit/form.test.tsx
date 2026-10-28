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
let capturedChange: ((changes: Record<string, unknown>) => Promise<boolean>) | undefined;
let draft: Record<string, unknown>;
let mockStatus = 'processing';
const fieldOnChange = jest.fn();
let selectCustomer: (value: string) => void = () => undefined;

const mockWatch = (name: string) => (name === 'status' ? mockStatus : draft[name]);

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
	handleSubmit: (callback: (data: { status: string }) => unknown) => () =>
		callback({ status: mockStatus }),
};

jest.mock('react-hook-form', () => ({
	useForm: (options: { values?: unknown }) => (options.values ? statusForm : form),
	useWatch: ({ name }: { name: string }) => mockWatch(name),
}));

jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservablePickState: (_observable: unknown, projector: () => unknown) => projector(),
}));

jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => <>{children}</>,
	FormCombobox: ({ onChange }: { onChange: (value: string) => void }) => {
		selectCustomer = onChange;
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
	useFormChangeHandler: (options: { onChange: typeof capturedChange }) => {
		capturedChange = options.onChange;
		return { flush: mockFlush };
	},
	FormInput: () => null,
	FormSelect: () => null,
	FormTextarea: () => null,
}));

jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
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
	useStoreSession: () => ({ store: null }),
}));
jest.mock('../../components/currency-select', () => ({ CurrencySelect: () => null }));
jest.mock('../../components/customer-select', () => ({ CustomerSelect: () => null }));
jest.mock('../../components/customer/tax-ids-form', () => ({
	TaxIdsForm: () => null,
	taxIdsFormSchema: {},
}));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../components/meta-data-form', () => ({
	MetaDataForm: () => null,
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
	customer_id: 1,
	billing: { first_name: 'Previous' },
	shipping: { first_name: 'Previous' },
	meta_data: [],
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
	mockStatus = 'processing';
	draft = { ...orderPayload };
	capturedChange = undefined;
	modalActions.clear();
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
		expect(mockLocalPatch).toHaveBeenCalledWith({ document: order, data: patch });
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
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: {
				customer_id: 0,
				billing: { first_name: undefined, last_name: undefined, email: undefined },
				shipping: {},
				tax_ids: [],
			},
		});
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
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: { customer_note: 'Leave at reception' },
		});
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
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: { billing: { first_name: 'Previous', city: 'Madrid' } },
		});
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
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: { meta_data: [{ key: 'custom', value: 'edited' }] },
		});
	});

	it('writes tax_ids without blank rows', async () => {
		draft.tax_ids = [
			{ type: 'vat', value: 'ABC' },
			{ type: 'vat', value: '' },
		];
		render(<EditOrderForm order={order} />);
		await editField('tax_ids.0.value', 'ABC');
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: { tax_ids: [{ type: 'vat', value: 'ABC' }] },
		});
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
	it('flushes, writes only the changed status and pushes without closing the modal', async () => {
		render(<EditOrderForm order={order} />);
		await updateStatus();
		expect(mockFlush.mock.invocationCallOrder[0]).toBeLessThan(
			mockLocalPatch.mock.invocationCallOrder[0]
		);
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: order,
			data: { status: 'processing' },
		});
		expect(mockLocalPatch.mock.invocationCallOrder[0]).toBeLessThan(
			mockPushDocument.mock.invocationCallOrder[0]
		);
		expect(mockPushDocument).toHaveBeenCalledTimes(1);
		expect(testLogger.success).toHaveBeenCalledWith('orders.status_updated', {
			showToast: true,
			context: { orderId: 50, status: 'processing' },
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
		expect(mockLocalPatch).toHaveBeenNthCalledWith(2, {
			document: order,
			data: { status: 'pending' },
		});
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
