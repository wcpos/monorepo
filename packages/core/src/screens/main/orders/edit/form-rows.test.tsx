/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { EngineRecord } from '@wcpos/query';

import { EditOrderForm } from './form';

// Paid on has its own integration suite; keep this form harness focused on its existing rows.
jest.mock('./paid-on', () => ({ PaidOn: () => null }));

type Pressable = React.PropsWithChildren<{
	onPress?: () => void;
	testID?: string;
	disabled?: boolean;
}>;
type Picker = { name: string; value: unknown; onChange: (value: string) => void };
type Autosave = { persist: (data: Record<string, unknown>) => Promise<unknown> };

const mockHarness: { autosave?: Autosave } = {};
type Fields = object | ((payload: Record<string, unknown>) => object);
const mockSaveOrderFields = jest.fn(async (_record: unknown, _data: Fields) => true);
const mockStore = { currency: 'USD', store_country: 'US' };
let mockCanReassign = false;
let mockStoresPending = false;
const mockPickers = new Map<string, Picker>();
const mockStores = [
	{ id: 3, name: 'Main' },
	{ id: 4, name: 'Annex' },
];

jest.mock('@wcpos/components/form', () => {
	const { FormProvider, Controller } = jest.requireActual('react-hook-form');
	function Wrap({ children }: React.PropsWithChildren) {
		return <>{children}</>;
	}
	return {
		Form: FormProvider,
		FormField: Controller,
		FormItem: Wrap,
		FormInput: () => null,
		FormMessage: () => null,
		FormSelect: (props: Picker) => {
			mockPickers.set(props.name, props);
			return null;
		},
		FormCombobox: (props: Picker) => {
			mockPickers.set(props.name, props);
			return null;
		},
		FormTextarea: ({ placeholder }: { placeholder?: string }) => (
			<textarea placeholder={placeholder} />
		),
		SavedFieldProvider: Wrap,
		SavedMark: () => null,
		useSavedName: () => '',
		useMarkSaved: () => jest.fn(),
		useMarkFailed: () => jest.fn(),
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID, onPress, disabled }: Pressable) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/collapsible', () => ({}));
jest.mock('@wcpos/components/icon-button', () => ({}));
jest.mock('@wcpos/components/tooltip', () => ({}));
jest.mock('@wcpos/components/select', () => ({
	OptionSelect: () => null,
	Select: () => null,
	SelectTrigger: () => null,
	SelectValue: () => null,
	SelectContent: () => null,
	SelectGroup: () => null,
	SelectItem: () => null,
	SelectSeparator: () => null,
}));
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useDocField: (value: unknown, select: (value: unknown) => unknown) =>
		value ? select(value) : undefined,
}));
// One resource for every render: a fresh one each render would resubscribe the lookup forever.
const mockCustomerResource = { valueRef$$: new BehaviorSubject({ current: null }) };
jest.mock('@wcpos/query/record-readers', () => ({
	useEngineRecordByWooId: () => mockCustomerResource,
}));
jest.mock('../../../../lib/tax-id', () => ({
	suggestTaxIdTypes: () => [],
	splitTaxIdTypesForCountry: () => ({ suggested: [], rest: [] }),
	isValidTaxIdFormat: () => true,
	TAX_ID_DEFAULT_COUNTRIES: {},
	useTaxIdLabels: () => ({}),
	TAX_ID_PLACEHOLDERS: {},
	TAX_ID_TYPES: ['eu_vat'],
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: mockStore }),
	useStoreSession: () => ({ store: mockStore, wpCredentials: {} }),
}));
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: () => {
		if (mockStoresPending) throw new Promise(() => {});
		return mockStores;
	},
}));
jest.mock('../../components/cashier-select', () => ({ CashierSelect: () => null }));
jest.mock('../../hooks/store-list-resource', () => ({ storeListResource: () => ({}) }));
jest.mock('../../hooks/use-cashier-label', () => ({
	useCashierLabel: (id: string) => ({ label: id ? `Cashier ${id}` : '' }),
}));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ known: true, caps: { canReassignSales: mockCanReassign } }),
}));
jest.mock('../../hooks/use-server-feature', () => ({ useServerFeature: () => true }));
jest.mock('@wcpos/components/editable-field', () => ({ EditableField: () => null }));
jest.mock('../../components/country-state-select/country-combobox', () => ({
	CountryCombobox: () => null,
}));
jest.mock('../../components/country-state-select/state-forminput', () => ({
	StateFormInput: () => null,
}));
jest.mock('../../components/currency-select', () => ({ CurrencySelect: () => null }));
jest.mock('../../components/customer-select', () => ({ CustomerSelect: () => null }));
jest.mock('../../components/order/order-status-select', () => ({ OrderStatusSelect: () => null }));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../components/use-record-autosave', () => ({
	useRecordAutosave: (options: Autosave) => {
		mockHarness.autosave = options;
		return { flush: async () => true };
	},
}));
jest.mock('../commands/use-order-record', () => ({
	useOrderRecord: () => ({ saveOrderFields: mockSaveOrderFields }),
}));
jest.mock('../../contexts/use-push-document', () => ({ usePushDocument: () => jest.fn() }));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Ada' }),
}));
jest.mock('../../hooks/use-guest-customer', () => ({ useGuestCustomer: () => ({}) }));
jest.mock('../../hooks/use-storage-health', () => ({
	useStorageMoneyPathGuard: () => ({ storageDegraded: false, blockIfDegraded: () => false }),
}));

const address = { first_name: 'Ada', address_1: '1 Main St', city: 'Springfield', country: 'US' };

function order(overrides: Record<string, unknown> = {}) {
	const payload = {
		id: 50,
		status: 'processing',
		customer_id: 1,
		customer_note: '',
		currency: 'USD',
		billing: { ...address, email: 'ada@example.com' },
		shipping: { ...address },
		payment_method: 'pos_cash',
		payment_method_title: 'Cash',
		transaction_id: 'txn-1',
		meta_data: [],
		tax_ids: [],
		...overrides,
	};
	const record = {
		uuid: 'order-50',
		payload,
		$: new BehaviorSubject({ toJSON: () => ({ payload }) }),
		getLatest: () => record,
		toMutableJSON: () => ({ payload }),
		collection: { name: 'orders' },
	};
	return record as unknown as EngineRecord<'orders'>;
}
const row = (id: string) => screen.queryByTestId(`order-row-${id}`);
const offered = () => screen.getAllByTestId(/^order-add-/).map((add) => add.textContent);

beforeEach(() => {
	mockSaveOrderFields.mockClear();
	mockCanReassign = false;
	mockStoresPending = false;
	mockPickers.clear();
});

it('is property rows: Customer, Status, Customer note, Billing, Shipping, a locked Payment', () => {
	render(<EditOrderForm order={order()} />);
	for (const id of ['customer', 'status', 'customer_note', 'billing']) expect(row(id)).toBeTruthy();
	expect(row('status')!.contains(screen.getByTestId('order-edit-update-status'))).toBe(true);
	expect(row('shipping')!.textContent).toContain('pos_cart.same_as_billing');
	expect(row('shipping')!.textContent).toContain('pos_cart.use_different_address');
	expect(row('payment')!.textContent).toContain('Cash · txn-1');
	expect(row('payment')!.textContent).toContain('orders.set_at_checkout');
	expect(row('payment')!.querySelector('button')).toBeNull();
	expect(screen.queryByText('orders.parent_id')).toBeNull();
	expect(screen.queryByText('orders.payment_method_id')).toBeNull();
	expect(row('currency')).toBeNull();
	expect(offered()).toEqual(['tax_id.tax_id', 'common.currency', 'common.custom_field']);
});

it('a billing with only a name and an email is a Billing row, never an add button (Codex, #2975)', () => {
	render(
		<EditOrderForm
			order={order({ billing: { first_name: 'Ada', email: 'ada@example.com' }, shipping: {} })}
		/>
	);
	expect(row('billing')).toBeTruthy();
	expect(screen.queryByTestId('order-add-billing')).toBeNull();
	expect(mockSaveOrderFields).not.toHaveBeenCalled();
});

it('a currency other than the store’s is a row; an added Currency is a row with no Remove', () => {
	const view = render(<EditOrderForm order={order({ currency: 'EUR' })} />);
	expect(row('currency')).toBeTruthy();
	expect(screen.queryByTestId('order-add-currency')).toBeNull();
	view.unmount();
	render(<EditOrderForm order={order()} />);
	fireEvent.click(screen.getByTestId('order-add-currency'));
	expect(row('currency')).toBeTruthy();
	expect(row('currency')!.querySelector('button')).toBeNull();
	expect(offered()).toEqual(['tax_id.tax_id', 'common.custom_field']);
});

it('a billing write carries shipping as its copy while linked, and alone once not', async () => {
	const billing = { ...address, email: 'ada@example.com', city: 'Shelbyville' };
	const linked = order();
	const view = render(<EditOrderForm order={linked} />);
	await act(async () => {
		await mockHarness.autosave!.persist({ billing });
	});
	expect(mockSaveOrderFields).toHaveBeenLastCalledWith(linked, {
		billing,
		shipping: { ...address, city: 'Shelbyville' },
	});
	view.unmount();
	const own = order({ shipping: { ...address, address_1: '2 Side St' } });
	render(<EditOrderForm order={own} />);
	await act(async () => {
		await mockHarness.autosave!.persist({ billing });
	});
	expect(mockSaveOrderFields).toHaveBeenLastCalledWith(own, { billing });
});

it('a sale has Cashier then Store after Status and before Customer note, each with its verb', () => {
	mockCanReassign = true;
	const meta_data = [
		{ key: '_pos_user', value: '7' },
		{ key: '_pos_store', value: '3' },
	];
	render(<EditOrderForm order={order({ meta_data })} />);
	const ids = ['status', 'cashier', 'store', 'customer_note'];
	const rows = ids.map((id) => row(id)!);
	rows.slice(1).forEach((next, index) => {
		expect(
			rows[index].compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});
	expect(row('cashier')!.contains(screen.getByTestId('order-edit-update-cashier'))).toBe(true);
	expect(row('store')!.contains(screen.getByTestId('order-edit-update-store'))).toBe(true);
});

it('without the reassign capability Cashier and Store are locked rows set at the sale', () => {
	const meta_data = [
		{ key: '_pos_user', value: '7' },
		{ key: '_pos_store', value: '4' },
	];
	render(<EditOrderForm order={order({ meta_data })} />);
	expect(row('cashier')!.textContent).toContain('Cashier 7');
	expect(row('cashier')!.textContent).toContain('orders.set_at_sale');
	expect(row('store')!.textContent).toContain('Annex');
	expect(row('store')!.querySelector('button')).toBeNull();
});

it('draws the rest of the Edit tab while the store list is still loading', () => {
	mockCanReassign = true;
	mockStoresPending = true;
	render(<EditOrderForm order={order({ meta_data: [{ key: '_pos_user', value: '7' }] })} />);
	for (const id of ['customer', 'status', 'cashier', 'customer_note']) expect(row(id)).toBeTruthy();
	expect(row('store')).toBeNull();
});

it('a store update keeps the cashier picked but not yet sent', async () => {
	mockCanReassign = true;
	const sale = order({
		meta_data: [
			{ key: '_pos_user', value: '7' },
			{ key: '_pos_store', value: '3' },
		],
	});
	// The write lands on the record, as the engine's would.
	mockSaveOrderFields.mockImplementationOnce(async (record, data) => {
		const target = record as EngineRecord<'orders'>;
		// A resolver write is applied to the payload it lands on.
		const changes = typeof data === 'function' ? data(target.payload) : data;
		const payload = { ...target.payload, ...changes };
		Object.assign(target, { payload });
		(target.$ as BehaviorSubject<unknown>).next({ toJSON: () => ({ payload }) });
		return true;
	});
	render(<EditOrderForm order={sale} />);
	await act(async () => mockPickers.get('cashier_id')!.onChange('9'));
	await act(async () => mockPickers.get('store_id')!.onChange('4'));
	await act(async () => {
		fireEvent.click(screen.getByTestId('order-edit-update-store'));
	});
	expect(mockSaveOrderFields).toHaveBeenCalledTimes(1);
	expect(sale.payload.meta_data).toContainEqual({ key: '_pos_store', value: '4' });
	expect(mockPickers.get('store_id')!.value).toBe('4');
	expect(mockPickers.get('cashier_id')!.value).toEqual(expect.objectContaining({ value: '9' }));
	expect(screen.getByTestId('order-edit-update-cashier')).toHaveProperty('disabled', false);
	expect(screen.getByTestId('order-edit-update-store')).toHaveProperty('disabled', true);
});
