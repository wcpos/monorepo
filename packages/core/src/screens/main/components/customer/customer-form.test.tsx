/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { CustomerForm, type CustomerFormValues, fillBillingFromIdentity } from './customer-form';

type Pressable = { onPress?: () => void; testID?: string };

jest.mock('@wcpos/components/form', () => ({
	Form: jest.requireActual('react-hook-form').FormProvider,
	FormField: jest.requireActual('react-hook-form').Controller,
	FormItem: jest.requireActual('@wcpos/components/form/common').FormItem,
	FormInput: ({
		testID,
		value,
		onChange,
		placeholder,
		secureTextEntry,
		autoComplete,
	}: {
		testID?: string;
		value: string;
		onChange: (value: string) => void;
		placeholder?: string;
		secureTextEntry?: boolean;
		autoComplete?: string;
	}) => (
		<input
			data-testid={testID}
			type={secureTextEntry ? 'password' : 'text'}
			autoComplete={autoComplete}
			placeholder={placeholder}
			value={value}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
	FormMessage: () => null,
	SavedMark: () => null,
	useSavedName: () => '',
}));
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: () => null,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, onPress }: React.PropsWithChildren<{ onPress?: () => void }>) => (
		<span onClick={onPress}>{children}</span>
	),
}));
jest.mock('@wcpos/components/property-row', () => ({
	PropertyList: ({ children }: React.PropsWithChildren) => <>{children}</>,
	PropertyRow: ({
		label,
		children,
		trailing,
		testID,
	}: React.PropsWithChildren<{ label: string; trailing?: React.ReactNode; testID?: string }>) => (
		<div data-testid={testID}>
			<span>{label}</span>
			{children}
			{trailing}
		</div>
	),
	PropertyVerb: ({ children, onPress, testID }: React.PropsWithChildren<Pressable>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	PropertyAddRow: ({ children }: React.PropsWithChildren) => (
		<div data-testid="add-row">{children}</div>
	),
	PropertyAdd: ({ label, onPress, testID }: Pressable & { label: string }) => (
		<button data-testid={testID} onClick={onPress}>
			{label}
		</button>
	),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, options?: { label?: string }) =>
		options?.label ? `${key}:${options.label}` : key,
}));
jest.mock('../../hooks/use-base-tax-location', () => ({
	useBaseTaxLocation: () => ({ country: 'CA' }),
}));
function mockAddressSchema(root: 'billing' | 'shipping') {
	const z = jest.requireActual('zod') as typeof import('zod');
	const keys = ['first_name', 'last_name', 'company', 'phone', 'address_1', 'address_2', 'city'];
	keys.push('state', 'postcode', 'country', ...(root === 'billing' ? ['email'] : []));
	const address = z.object(Object.fromEntries(keys.map((key) => [key, z.string().optional()])));
	return z.object({ [root]: address.optional() });
}
jest.mock('./address', () => ({
	AddressCountryField: ({ prefix }: { prefix: string }) => (
		<button data-testid={`${prefix}-country-select`} />
	),
	AddressStateField: () => null,
	billingAddressSchema: mockAddressSchema('billing'),
	shippingAddressSchema: mockAddressSchema('shipping'),
}));
jest.mock('../form-errors', () => ({ FormErrors: () => null }));
jest.mock('../meta-data-form', () => ({
	MetaDataForm: () => null,
	META_DATA_DEFAULT_ROW: { key: '', value: '' },
	metaDataSchema: jest.requireActual('zod').array(jest.requireActual('zod').any()).optional(),
}));
jest.mock('./tax-ids-form', () => ({
	TaxIdsForm: () => null,
	TAX_ID_DEFAULT_ROW: { type: 'eu_vat', value: '' },
	taxIdsFormSchema: jest.requireActual('zod').array(jest.requireActual('zod').any()).optional(),
}));

const harness: { form?: UseFormReturn<CustomerFormValues> } = {};
const onShippingLink = jest.fn();
function Harness({ values }: { values: Partial<CustomerFormValues> & { id?: number } }) {
	const form = useForm<CustomerFormValues>({ defaultValues: values as CustomerFormValues });
	React.useEffect(() => {
		harness.form = form;
	});
	return <CustomerForm form={form} footer={{}} onShippingLink={onShippingLink} />;
}
const value = (name: string) => harness.form!.getValues(name as never);
const rows = () => screen.queryAllByTestId(/^customer-row-/).map((row) => row.dataset.testid);
const adds = () =>
	Array.from(screen.getByTestId('add-row').querySelectorAll('button')).map(
		(button) => button.dataset.testid
	);
const ADDRESS = { address_1: '12 High Street', city: 'Leeds', country: 'GB' };

describe('CustomerForm', () => {
	it('creation asks Name, Email, Phone and Username, and offers the rest', () => {
		render(<Harness values={{}} />);
		expect(rows()).toEqual([
			'customer-row-name',
			'customer-row-email',
			'customer-row-phone',
			'customer-row-username',
		]);
		expect(screen.getByTestId('customer-first-name-input').tagName).toBe('INPUT');
		expect(screen.getByTestId('customer-last-name-input').tagName).toBe('INPUT');
		expect(screen.getByTestId('customer-email-input').tagName).toBe('INPUT');
		expect(screen.queryByTestId('customer-row-role')).toBeNull();
		expect(adds()).toEqual([
			'customer-add-company',
			'customer-billing-address-toggle',
			'customer-add-shipping',
			'customer-add-password',
			'customer-add-tax_id',
			'customer-add-meta_data',
		]);
	});

	it('the billing toggle adds billing and opens its parts', () => {
		render(<Harness values={{}} />);
		fireEvent.click(screen.getByTestId('customer-billing-address-toggle'));
		expect(screen.getByTestId('customer-field-billing-address_1').tagName).toBe('INPUT');
		expect(screen.getByTestId('billing-country-select')).toBeTruthy();
		expect(value('billing.country')).toBe('CA');
	});

	it('an edit shows Username and Role locked, with where they are set', () => {
		render(<Harness values={{ id: 7, username: 'ada', role: 'customer' }} />);
		expect(screen.getByTestId('customer-row-username').textContent).toBe(
			'common.usernameadacustomers.set_at_creation'
		);
		expect(screen.getByTestId('customer-row-role').textContent).toBe(
			'common.rolecustomercustomers.set_in_wordpress'
		);
		expect(screen.getByTestId('customer-row-username').querySelector('input')).toBeNull();
		expect(screen.getByTestId('customer-row-role').querySelector('input')).toBeNull();
	});

	it('a billing address reads as one line with Edit', () => {
		render(<Harness values={{ id: 7, billing: ADDRESS }} />);
		expect(screen.getByTestId('customer-row-billing').textContent).toBe(
			'common.billing_address12 High Street, Leeds, United Kingdom (UK)common.edit'
		);
		expect(screen.getByTestId('customer-edit-billing')).toBeTruthy();
	});

	it('Use a different address copies billing into shipping', () => {
		render(<Harness values={{ id: 7, billing: ADDRESS }} />);
		fireEvent.click(screen.getByTestId('customer-shipping-different'));
		expect(value('shipping')).toEqual(ADDRESS);
		expect(screen.getByTestId('customer-shipping-same')).toBeTruthy();
	});

	it("reports the Shipping row's link to its writer as the verbs change it", () => {
		render(<Harness values={{ id: 7, billing: ADDRESS }} />);
		expect(onShippingLink).toHaveBeenLastCalledWith(true);
		fireEvent.click(screen.getByTestId('customer-shipping-different'));
		expect(onShippingLink).toHaveBeenLastCalledWith(false);
		fireEvent.click(screen.getByTestId('customer-shipping-same'));
		expect(onShippingLink).toHaveBeenLastCalledWith(true);
	});
	it('adding Password renders a secure input', () => {
		render(<Harness values={{ id: 7 }} />);
		fireEvent.click(screen.getByTestId('customer-add-password'));
		expect(screen.getByTestId('customer-password-input').getAttribute('type')).toBe('password');
		expect(adds()).not.toContain('customer-add-password');
	});

	it('Remove on Company clears billing.company and returns its add button', () => {
		render(<Harness values={{ billing: { company: 'Acme' } }} />);
		expect(adds()).not.toContain('customer-add-company');
		fireEvent.click(screen.getByTestId('customer-remove-company'));
		expect(value('billing.company')).toBe('');
		expect(screen.queryByTestId('customer-row-company')).toBeNull();
		expect(adds()[0]).toBe('customer-add-company');
	});
	it("an open billing address shows billing's own name and email parts", () => {
		render(<Harness values={{ id: 7, billing: { ...ADDRESS, first_name: 'Bill' } }} />);
		fireEvent.click(screen.getByTestId('customer-edit-billing'));
		expect(screen.getByTestId('customer-field-billing-first_name')).toBeTruthy();
		expect(screen.getByTestId('customer-field-billing-email')).toBeTruthy();
	});
	it('a reset with a different shipping address (Sync) breaks the Same as billing link', async () => {
		render(<Harness values={{ id: 7, billing: ADDRESS, shipping: ADDRESS }} />);
		expect(screen.getByTestId('customer-shipping-different')).toBeTruthy();
		await act(async () => {
			harness.form!.reset({
				id: 7,
				billing: ADDRESS,
				shipping: { ...ADDRESS, city: 'York' },
			} as never);
		});
		expect(screen.queryByTestId('customer-shipping-different')).toBeNull();
		expect(screen.getByTestId('customer-edit-shipping')).toBeTruthy();
	});
	it('the password row never takes the cashier’s saved login', () => {
		render(<Harness values={{}} />);
		fireEvent.click(screen.getByTestId('customer-add-password'));
		expect(screen.getByTestId('customer-password-input').getAttribute('autocomplete')).toBe(
			'new-password'
		);
	});
});

describe('fillBillingFromIdentity', () => {
	const identity = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@x.io' };
	const filled = { ...ADDRESS, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@x.io' };
	const fill = (values: Partial<CustomerFormValues>) =>
		fillBillingFromIdentity({ ...identity, ...values } as CustomerFormValues);
	it("an empty shipping is stored as the filled billing's copy", () => {
		const data = fill({ billing: ADDRESS, shipping: {} });
		expect(data.billing).toEqual(filled);
		expect(data.shipping).toEqual({ ...ADDRESS, first_name: 'Ada', last_name: 'Lovelace' });
		expect(fill({}).shipping).toEqual({ first_name: 'Ada', last_name: 'Lovelace' });
	});
	it('an own shipping address is kept', () => {
		const own = { address_1: 'Unit 4', city: 'York' };
		expect(fill({ billing: ADDRESS, shipping: own }).shipping).toEqual(own);
	});
	it("a shipping equal to billing's copy is derived again after the identity fill", () => {
		const data = fill({
			billing: { ...ADDRESS, first_name: 'Grace' },
			shipping: { ...ADDRESS, first_name: 'Grace' },
		});
		expect(data.billing).toEqual({ ...filled, first_name: 'Grace' });
		expect(data.shipping).toEqual({ ...ADDRESS, first_name: 'Grace', last_name: 'Lovelace' });
	});
});
