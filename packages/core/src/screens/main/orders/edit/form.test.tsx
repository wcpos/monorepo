/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import {
	clearStorageDegradation,
	wrappedErrorHandlerStorage,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { getLogger } from '@wcpos/utils/logger';

import { EditOrderForm } from './form';

const testLogger = getLogger(['test']);

const mockPushDocument = jest.fn();
const mockLocalPatch = jest.fn();
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

type CustomerValueRef = { current: Customer | null };

const customerResources = new Map<number, { valueRef$$: Subject<CustomerValueRef> }>();
const setValue = jest.fn();
const fieldOnChange = jest.fn();
let selectCustomer: (value: string) => void = () => undefined;

const form = {
	control: {},
	handleSubmit: jest.fn((callback: unknown) => callback),
	setValue,
	watch: jest.fn((name: string) => {
		if (name === 'customer_id') return 1;
		if (name === 'billing') return { first_name: 'Previous' };
		if (name === 'shipping') return { first_name: 'Previous' };
		return undefined;
	}),
};

jest.mock('react-hook-form', () => ({
	useForm: () => form,
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
	FormInput: () => null,
	FormSelect: () => null,
	FormTextarea: () => null,
}));

jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: React.PropsWithChildren) => <>{children}</>,
	CollapsibleContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	CollapsibleTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/modal', () => ({
	ModalAction: ({
		children,
		onPress,
		disabled,
		testID,
	}: React.PropsWithChildren<{
		onPress?: () => unknown;
		disabled?: boolean;
		testID?: string;
	}>) => {
		if (testID) {
			modalActions.set(testID, { onPress, disabled: !!disabled });
		}
		return <>{children}</>;
	},
	ModalClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('../../components/billing-address-form', () => ({
	BillingAddressForm: () => null,
	billingAddressSchema: { shape: {} },
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
jest.mock('../../components/shipping-address-form', () => ({
	ShippingAddressForm: () => null,
	shippingAddressSchema: { shape: {} },
}));

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
jest.mock('../../hooks/use-engine-document', () => ({
	useEngineDocumentByWooId: (_collection: string, wooId: number) => customerResources.get(wooId),
}));
jest.mock('../../hooks/use-guest-customer', () => ({
	useGuestCustomer: () => ({ billing: {}, shipping: {}, tax_ids: [] }),
}));

const order = {
	id: 50,
	$: new BehaviorSubject({}),
	getLatest: () => ({
		status: 'pending',
		customer_id: 1,
		billing: { first_name: 'Previous' },
		shipping: { first_name: 'Previous' },
		meta_data: [],
		tax_ids: [],
	}),
} as unknown as import('@wcpos/database').OrderDocument;

function customer(id: number): Customer {
	return {
		id,
		first_name: `Customer ${id}`,
		last_name: '',
		email: `${id}@example.com`,
		billing: { first_name: `Billing ${id}` },
		shipping: { first_name: `Shipping ${id}` },
		tax_ids: [{ id }],
	};
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

describe('EditOrderForm customer lookup', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		customerResources.clear();
		const initialCustomer$ = new BehaviorSubject<CustomerValueRef>({ current: null });
		customerResources.set(0, { valueRef$$: initialCustomer$ });
	});

	it('waits for the selected customer result instead of consuming the previous lookup value', () => {
		const selectedCustomer$ = new Subject<CustomerValueRef>();
		customerResources.set(2, { valueRef$$: selectedCustomer$ });
		render(<EditOrderForm order={order} />);

		act(() => selectCustomer('2'));

		expect(fieldOnChange).toHaveBeenCalledWith(2);
		expect(setValue).not.toHaveBeenCalledWith('billing', expect.anything(), expect.anything());
		expect(testLogger.error).not.toHaveBeenCalled();

		act(() => selectedCustomer$.next({ current: customer(2) }));

		expect(setValue).toHaveBeenCalledWith(
			'billing',
			expect.objectContaining({ first_name: 'Billing 2', email: '2@example.com' }),
			{ shouldValidate: true }
		);
		expect(setValue).toHaveBeenCalledWith(
			'shipping',
			{ first_name: 'Shipping 2' },
			{ shouldValidate: true }
		);
		expect(setValue).toHaveBeenCalledWith('tax_ids', [{ id: 2 }], { shouldValidate: true });
		expect(setValue).toHaveBeenCalledWith('customer_id', 2);
	});

	it('reports a missing customer only when the selected lookup resolves null', () => {
		const selectedCustomer$ = new Subject<CustomerValueRef>();
		customerResources.set(3, { valueRef$$: selectedCustomer$ });
		render(<EditOrderForm order={order} />);

		act(() => selectCustomer('3'));
		expect(testLogger.error).not.toHaveBeenCalled();

		act(() => selectedCustomer$.next({ current: null }));

		expect(testLogger.error).toHaveBeenCalledWith('Error fetching customer', {
			code: 'SYNC999',
			context: expect.objectContaining({ customerId: 3, error: 'orders.customer_not_found' }),
		});
		expect(setValue).not.toHaveBeenCalledWith('billing', expect.anything(), expect.anything());
	});
});

/**
 * #163 ruling R5: the Orders-screen edit form is an order save. `localPatch`
 * swallows storage failures, so without the guard the push would go out built on
 * a local patch that never landed.
 */
describe('EditOrderForm while storage is degraded', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		modalActions.clear();
		customerResources.clear();
		customerResources.set(0, {
			valueRef$$: new BehaviorSubject<CustomerValueRef>({ current: null }),
		});
	});

	afterEach(() => {
		act(() => clearStorageDegradation());
	});

	it('disables save and refuses the write', async () => {
		render(<EditOrderForm order={order} />);
		expect(modalActions.get('order-edit-save-button')?.disabled).toBe(false);

		await degradeStorage('degraded-order-edit');

		expect(modalActions.get('order-edit-save-button')?.disabled).toBe(true);

		await act(async () => {
			await modalActions.get('order-edit-save-button')!.onPress!();
		});

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockPushDocument).not.toHaveBeenCalled();
	});

	it('stops before pushing when storage degrades during the local patch', async () => {
		let resolveLocalPatch!: () => void;
		mockLocalPatch.mockImplementation(
			() => new Promise<void>((resolve) => (resolveLocalPatch = resolve))
		);
		mockPushDocument.mockResolvedValue(undefined);
		render(<EditOrderForm order={order} />);

		let savePromise!: Promise<unknown>;
		act(() => {
			savePromise = modalActions.get('order-edit-save-button')!.onPress!() as Promise<unknown>;
		});
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);

		await degradeStorage('degraded-order-edit-during-patch');
		await act(async () => {
			resolveLocalPatch();
			await savePromise;
		});

		expect(mockPushDocument).not.toHaveBeenCalled();
	});
});
