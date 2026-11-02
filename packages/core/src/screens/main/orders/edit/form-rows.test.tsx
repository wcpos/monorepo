/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { EngineRecord } from '@wcpos/query';

import { EditOrderForm } from './form';

type Pressable = React.PropsWithChildren<{ onPress?: () => void; testID?: string }>;
type Autosave = { persist: (data: Record<string, unknown>) => Promise<unknown> };

const mockHarness: { autosave?: Autosave } = {};
const mockSaveOrderFields = jest.fn(async () => true);
const mockStore = { currency: 'USD', store_country: 'US' };

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
		FormSelect: () => null,
		FormCombobox: () => null,
		FormTextarea: ({ placeholder }: { placeholder?: string }) => (
			<textarea placeholder={placeholder} />
		),
		SavedFieldProvider: Wrap,
		SavedMark: () => null,
		useSavedName: () => '',
		useMarkSaved: () => jest.fn(),
	};
});
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID }: Pressable) => <button data-testid={testID}>{children}</button>,
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: () => null,
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
	useStoreSession: () => ({ store: mockStore }),
}));
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

beforeEach(() => mockSaveOrderFields.mockClear());

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
