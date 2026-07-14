/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';

import { EditOrderForm } from './form';

const testLogger = getLogger(['test']);

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
	ModalAction: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
jest.mock('../../contexts/use-push-document', () => ({ usePushDocument: () => jest.fn() }));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: jest.fn() }),
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
			context: expect.objectContaining({ customerId: 3, error: 'orders.customer_not_found' }),
		});
		expect(setValue).not.toHaveBeenCalledWith('billing', expect.anything(), expect.anything());
	});
});
