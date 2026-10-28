/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useFormControlAria } from '@wcpos/components/form/aria';

import { EditCartCustomerForm } from './edit-cart-customer';

type Pressable = { onPress?: () => void; testID?: string };
const formValues = {
	billing: { first_name: 'Ada' },
	shipping: { first_name: 'Grace' },
	tax_ids: [{ type: 'eu_vat', value: 'ES123' }],
};
const localPatch = jest.fn((): Promise<unknown> => Promise.resolve({ changes: {}, document: {} }));
const patchCustomer = jest.fn(() => Promise.resolve(null));
const mockUseMutationProps = jest.fn();
const mockClose = jest.fn();
const mockMarkSaved = jest.fn();
let mockSavedName = '';
const customerFindOne = jest.fn();
let canEditCustomers = true;
const activeScope = () => ({
	database: { collections: { customers: { findOne: customerFindOne } } },
});
const manager = {
	engine: {
		active: jest.fn(activeScope),
		whenActive: jest.fn(async () => activeScope()),
	},
};

const currentOrder = {
	customer_id$: new BehaviorSubject<number | null>(42),
	billing$: new BehaviorSubject(formValues.billing),
	shipping$: new BehaviorSubject(formValues.shipping),
	tax_ids$: new BehaviorSubject(formValues.tax_ids),
};
const currentOrderRecord = {
	uuid: 'order-uuid',
	get payload() {
		return {
			customer_id: currentOrder.customer_id$.value,
			billing: currentOrder.billing$.value,
			shipping: currentOrder.shipping$.value,
			tax_ids: currentOrder.tax_ids$.value,
		};
	},
	getLatest() {
		return currentOrderRecord;
	},
};

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (observable: BehaviorSubject<unknown>) => observable.value,
}));

jest.mock('@wcpos/query', () => ({
	OPEN_ORDER_STATUSES: jest.requireActual('@wcpos/query').OPEN_ORDER_STATUSES,
	useQueryRuntime: () => manager,
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
	useDocField: (_store: unknown, select: (value: unknown) => unknown) =>
		select({ store_country: 'CA' }),
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, onPress, testID }: React.PropsWithChildren<Pressable>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: (props: import('@wcpos/components/dialog').DialogFooterProps) => {
		const Footer = jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter;
		return (
			<footer>
				<Footer {...props} />
			</footer>
		);
	},
	useDialog: () => ({ close: mockClose }),
}));

jest.mock('@wcpos/components/form', () => ({
	Form: jest.requireActual('react-hook-form').FormProvider,
	FormField: jest.requireActual('react-hook-form').Controller,
	// The real item: its context is what the country and state controls adopt their name from.
	FormItem: jest.requireActual('@wcpos/components/form/common').FormItem,
	// Like the real input: the field hears every change, so a draft reaches the form as it is typed.
	FormInput: ({
		value,
		onChange,
		placeholder,
		autoFocus,
		testID,
	}: {
		value: string;
		onChange: (value: string) => void;
		placeholder: string;
		autoFocus?: boolean;
		testID?: string;
	}) => (
		<input
			data-testid={testID}
			aria-label={placeholder}
			value={value}
			autoFocus={autoFocus}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
	FormMessage: () => null,
	FormSelect: () => null,
	useFormChangeHandler: jest.requireActual('@wcpos/components/form/use-form-change-handler')
		.useFormChangeHandler,
	SavedFieldProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SavedMark: ({ name }: { name: string }) =>
		mockSavedName === name ? <span data-testid={`saved-${name}`} /> : null,
	useMarkSaved: () => mockMarkSaved,
	useSavedName: () => mockSavedName,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, onPress }: React.PropsWithChildren<{ onPress?: () => void }>) => (
		<span onClick={onPress}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
// The real TaxIdsForm renders its property rows; its controls are not under test here.
jest.mock('@wcpos/components/collapsible', () => ({}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/select', () => ({ OptionSelect: () => null }));
jest.mock('@wcpos/components/tooltip', () => ({}));
jest.mock('../../../../lib/tax-id', () => ({
	isValidTaxIdFormat: () => true,
	TAX_ID_DEFAULT_COUNTRIES: {},
	useTaxIdLabels: () => ({}),
	TAX_ID_PLACEHOLDERS: {},
	TAX_ID_TYPES: ['eu_vat', 'gb_vat'],
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, options?: { label?: string }) =>
		options?.label ? `${key}:${options.label}` : key,
}));
// Factories run before this file's constants exist, so each builds its own schema.
function mockAddressSchema(root: 'billing' | 'shipping') {
	const z = jest.requireActual('zod') as typeof import('zod');
	const keys = ['first_name', 'last_name', 'company', 'phone', 'address_1', 'address_2', 'city'];
	keys.push('state', 'postcode', 'country', ...(root === 'billing' ? ['email'] : []));
	const address = z.object(Object.fromEntries(keys.map((key) => [key, z.string().optional()])));
	return z.object({ [root]: address.optional() });
}
/** A select part named the way the real field wrappers name it: by the enclosing item's label. */
function MockPartControl() {
	const { ariaProps } = useFormControlAria({});
	return <button aria-labelledby={ariaProps['aria-labelledby']} />;
}
jest.mock('../../components/customer/address', () => ({
	AddressCountryField: MockPartControl,
	AddressStateField: MockPartControl,
	billingAddressSchema: mockAddressSchema('billing'),
	shippingAddressSchema: mockAddressSchema('shipping'),
}));
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({
		localPatch: jest.requireActual('../../../../../jest/cart-write').resolveCartWrite(localPatch),
	}),
}));
jest.mock('../../hooks/mutations/use-mutation', () => ({
	useMutation: (props: unknown) => {
		mockUseMutationProps(props);
		return { patchRecord: patchCustomer };
	},
}));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Ada' }),
}));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canEditCustomers }, known: true }),
}));
const mockActionLog = jest.fn();
jest.mock('../hooks/use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: mockActionLog,
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: async () => null, paymentMethod: () => null },
			register: { resolveSession: async () => ({ registerId: null, sessionId: null }) },
			store: { preventOverselling: false, priceDecimals: 2 },
		},
		actor: { userId: 7, registerId: 'till', sessionId: null },
	}),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord }),
}));

/** The order the dialog opens on. */
function open({ billing = {}, shipping = {}, tax_ids = [] }: Partial<Record<string, unknown>>) {
	currentOrder.billing$.next(billing as typeof formValues.billing);
	currentOrder.shipping$.next(shipping as typeof formValues.shipping);
	currentOrder.tax_ids$.next(tax_ids as typeof formValues.tax_ids);
}
const ADDRESS = { first_name: 'Ada', address_1: '12 High Street', city: 'Leeds', country: 'GB' };
const lastWrite = () =>
	(localPatch as jest.Mock).mock.calls.at(-1)?.[0].data as Record<string, unknown>;
const rows = () => screen.queryAllByTestId(/^cart-address-row-/).map((row) => row.dataset.testid);
const adds = () =>
	Array.from(screen.getByTestId('add-row').querySelectorAll('button')).map(
		(button) => button.dataset.testid
	);

describe('EditCartCustomerForm', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		canEditCustomers = true;
		mockSavedName = '';
		currentOrder.customer_id$.next(42);
		open(formValues);
	});

	it('updates only the selected customer without closing, even before the lookup resolves', async () => {
		const customer = { id: 42, first_name: 'Ada' };
		let resolveLookup: (value: typeof customer) => void = () => undefined;
		const lookup = new Promise<typeof customer>((resolve) => {
			resolveLookup = resolve;
		});
		customerFindOne.mockReturnValue({ exec: () => lookup });

		render(<EditCartCustomerForm />);
		expect(screen.getByRole('contentinfo').textContent).toBe('Closepos_cart.update_customer_too');
		fireEvent.click(screen.getByRole('button', { name: 'pos_cart.update_customer_too' }));

		await waitFor(() => expect(customerFindOne).toHaveBeenCalled());
		expect(localPatch).not.toHaveBeenCalled();
		expect(customerFindOne).toHaveBeenCalledWith({
			selector: { remoteId: '42' },
		});
		expect(patchCustomer).not.toHaveBeenCalled();

		await act(async () => resolveLookup(customer));

		await waitFor(() =>
			expect(patchCustomer).toHaveBeenCalledWith({
				document: customer,
				data: formValues,
			})
		);
		expect(mockClose).not.toHaveBeenCalled();
		// The form toasts "Saved {name}" itself, so the hook's generic toast stays off.
		expect(mockUseMutationProps).toHaveBeenCalledWith(
			expect.objectContaining({ collectionName: 'customers', showSuccessToast: false })
		);
	});

	it('Update customer too saves the draft still being typed, with no blur', async () => {
		const customer = { id: 42, first_name: 'Ada' };
		customerFindOne.mockReturnValue({ exec: () => Promise.resolve(customer) });
		render(<EditCartCustomerForm />);
		// A change without a blur: on native a footer press does not blur the editor.
		fireEvent.change(screen.getByRole('textbox', { name: 'common.first_name' }), {
			target: { value: 'Grace' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'pos_cart.update_customer_too' }));
		await waitFor(() =>
			expect(patchCustomer).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({
						billing: expect.objectContaining({ first_name: 'Grace' }),
					}),
				})
			)
		);
	});

	it.each([true, false])(
		'autosaves an address edit and acknowledges only a successful write (%s)',
		async (success) => {
			if (!success) localPatch.mockResolvedValueOnce(undefined);
			render(<EditCartCustomerForm />);
			fireEvent.change(screen.getByRole('textbox', { name: 'common.first_name' }), {
				target: { value: 'Grace' },
			});
			await waitFor(() => expect(localPatch).toHaveBeenCalled());
			const written = (localPatch as jest.Mock).mock.calls[0][0] as {
				data: Record<string, unknown>;
			};
			expect(written.data).toMatchObject({
				billing: { first_name: 'Grace' },
				shipping: formValues.shipping,
				tax_ids: formValues.tax_ids,
			});
			expect(written.data).not.toHaveProperty('customer_id');
			if (success) await waitFor(() => expect(mockMarkSaved).toHaveBeenCalledWith(['billing']));
			else expect(mockMarkSaved).not.toHaveBeenCalled();
			expect(customerFindOne).not.toHaveBeenCalled();
			expect(mockClose).not.toHaveBeenCalled();
		}
	);

	it('a guest opens on the asked rows and offers the rest, with no fold', () => {
		open({});
		render(<EditCartCustomerForm />);
		expect(rows()).toEqual([
			'cart-address-row-name',
			'cart-address-row-email',
			'cart-address-row-phone',
		]);
		expect(adds()).toEqual([
			'cart-address-add-company',
			'cart-address-add-billing',
			'cart-address-add-shipping',
			'cart-address-add-tax_id',
		]);
		expect(screen.getByRole('textbox', { name: 'common.add_value:common.email' })).toBeTruthy();
		const source = jest
			.requireActual('fs')
			.readFileSync(require.resolve('./edit-cart-customer'), 'utf8');
		expect(source).not.toMatch(/Collapsible|Accordion/);
	});

	it('every text part carries a stable testID, so the two name parts are told apart', () => {
		render(<EditCartCustomerForm />);
		expect(screen.getByTestId('cart-address-field-billing-first_name')).toBeTruthy();
		expect(screen.getByTestId('cart-address-field-billing-last_name')).toBeTruthy();
		expect(screen.getByTestId('cart-address-field-billing-email')).toBeTruthy();
	});

	it('adding a billing address opens its parts in place with Address 1 focused', () => {
		open({});
		render(<EditCartCustomerForm />);
		fireEvent.click(screen.getByTestId('cart-address-add-billing'));
		expect(rows()).toEqual([
			'cart-address-row-name',
			'cart-address-row-email',
			'cart-address-row-phone',
			'cart-address-row-billing',
			'cart-address-row-shipping',
		]);
		const street = screen.getByRole('textbox', { name: 'common.add_value:common.address_1' });
		expect(document.activeElement).toBe(street);
		expect(screen.getByTestId('cart-address-remove-billing')).toBeTruthy();
		expect(adds()).toEqual(['cart-address-add-company', 'cart-address-add-tax_id']);
	});

	it('an added address starts in the store country', async () => {
		open({});
		render(<EditCartCustomerForm />);
		fireEvent.click(screen.getByTestId('cart-address-add-billing'));
		await waitFor(() => expect(lastWrite()?.billing).toMatchObject({ country: 'CA' }));
	});

	it('an own shipping address starts in the store country when billing has none', async () => {
		open({});
		render(<EditCartCustomerForm />);
		fireEvent.click(screen.getByTestId('cart-address-add-shipping'));
		await waitFor(() => expect(lastWrite()?.shipping).toMatchObject({ country: 'CA' }));
	});

	it('the country and state controls are named by their row keys', () => {
		open({});
		render(<EditCartCustomerForm />);
		fireEvent.click(screen.getByTestId('cart-address-add-billing'));
		expect(screen.getByRole('button', { name: 'common.country' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'common.state' })).toBeTruthy();
	});

	it('a verb and the SavedMark never share the line', () => {
		open({ billing: ADDRESS, shipping: { address_1: 'Unit 4', city: 'Leeds' }, tax_ids: [{}] });
		mockSavedName = 'shipping';
		const { rerender } = render(<EditCartCustomerForm />);
		expect(screen.getByTestId('saved-shipping')).toBeTruthy();
		expect(screen.queryByTestId('cart-address-edit-shipping')).toBeNull();
		expect(screen.queryByTestId('cart-address-shipping-same')).toBeNull();
		mockSavedName = 'tax_ids';
		rerender(<EditCartCustomerForm />);
		expect(screen.getByTestId('saved-tax_ids')).toBeTruthy();
		expect(screen.queryByTestId('cart-address-remove-tax_id-0')).toBeNull();
		mockSavedName = '';
		rerender(<EditCartCustomerForm />);
		expect(screen.queryByTestId('saved-shipping')).toBeNull();
		expect(screen.getByTestId('cart-address-edit-shipping')).toBeTruthy();
		expect(screen.getByTestId('cart-address-shipping-same')).toBeTruthy();
		expect(screen.getByTestId('cart-address-remove-tax_id-0')).toBeTruthy();
	});

	it('a billing address reads as one line with Edit, and shipping as Same as billing', () => {
		open({ billing: ADDRESS });
		render(<EditCartCustomerForm />);
		expect(screen.getByTestId('cart-address-row-billing').textContent).toBe(
			'common.billing_address12 High Street, Leeds, United Kingdom (UK)common.edit'
		);
		expect(screen.getByTestId('cart-address-row-shipping').textContent).toBe(
			'common.shipping_addresspos_cart.same_as_billingpos_cart.use_different_address'
		);
		fireEvent.click(screen.getByTestId('cart-address-edit-billing'));
		expect(screen.getByDisplayValue('12 High Street')).toBeTruthy();
	});

	it('Use a different address copies billing into shipping and opens its parts', async () => {
		open({ billing: ADDRESS });
		render(<EditCartCustomerForm />);
		fireEvent.click(screen.getByTestId('cart-address-shipping-different'));
		await waitFor(() => expect(localPatch).toHaveBeenCalled());
		expect(lastWrite().shipping).toEqual(ADDRESS);
		expect(screen.getByDisplayValue('12 High Street')).toBeTruthy();
		expect(screen.getByTestId('cart-address-shipping-same')).toBeTruthy();
	});

	it('Same as billing writes billing to shipping, then every billing edit carries it', async () => {
		open({ billing: ADDRESS, shipping: { address_1: 'Unit 4', city: 'Leeds' } });
		render(<EditCartCustomerForm />);
		expect(screen.getByTestId('cart-address-row-shipping').textContent).toBe(
			'common.shipping_addressUnit 4, Leedscommon.editpos_cart.same_as_billing'
		);
		fireEvent.click(screen.getByTestId('cart-address-shipping-same'));
		await waitFor(() => expect(localPatch).toHaveBeenCalled());
		expect(lastWrite().shipping).toEqual(ADDRESS);
		expect(screen.getByTestId('cart-address-row-shipping').textContent).toContain(
			'pos_cart.same_as_billing'
		);
		fireEvent.change(screen.getByRole('textbox', { name: 'common.first_name' }), {
			target: { value: 'Grace' },
		});
		await waitFor(() => expect(lastWrite().shipping).toEqual({ ...ADDRESS, first_name: 'Grace' }));
	});

	it('Remove on Company clears it and returns its add button', async () => {
		open({ billing: { company: 'Acme' } });
		render(<EditCartCustomerForm />);
		expect(adds()).not.toContain('cart-address-add-company');
		fireEvent.click(screen.getByTestId('cart-address-remove-company'));
		await waitFor(() => expect(localPatch).toHaveBeenCalled());
		expect(lastWrite().billing).toMatchObject({ company: '' });
		expect(screen.queryByTestId('cart-address-row-company')).toBeNull();
		expect(adds()[0]).toBe('cart-address-add-company');
	});

	it('a tax ID is a row with its Remove; the add row appends another', async () => {
		render(<EditCartCustomerForm />);
		expect(screen.getByTestId('cart-address-row-tax_id-0')).toBeTruthy();
		fireEvent.click(screen.getByTestId('cart-address-add-tax_id'));
		expect(screen.getByTestId('cart-address-row-tax_id-1')).toBeTruthy();
		fireEvent.click(screen.getByTestId('cart-address-remove-tax_id-0'));
		await waitFor(() => expect(lastWrite().tax_ids).toEqual([]));
		expect(screen.queryByTestId('cart-address-row-tax_id-1')).toBeNull();
	});

	it('shows only Close in the footer without customer edit permission', () => {
		canEditCustomers = false;

		render(<EditCartCustomerForm />);

		expect(screen.getByRole('contentinfo').textContent).toBe('Close');
	});

	it.each([null, 0])('shows only Close for a missing or guest customer (%s)', (customerId) => {
		currentOrder.customer_id$.next(customerId);

		render(<EditCartCustomerForm />);

		expect(screen.getByRole('contentinfo').textContent).toBe('Close');
	});
});

jest.mock('../hooks/use-cart-config', () => jest.requireActual('../../../../../jest/cart-write'));

jest.mock('../commands/use-boundary-commit', () => ({
	useBoundaryCommit: () => jest.fn(),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
	useStoreSession: () => ({}),
}));
