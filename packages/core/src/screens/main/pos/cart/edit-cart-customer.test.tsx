/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { EditCartCustomerForm } from './edit-cart-customer';

const formValues = {
	billing: { first_name: 'Ada' },
	shipping: { first_name: 'Grace' },
	tax_ids: [{ type: 'vat', value: 'ES123' }],
};
const localPatch = jest.fn((): Promise<unknown> => Promise.resolve({ changes: {}, document: {} }));
const patchCustomer = jest.fn(() => Promise.resolve(null));
const mockUseMutationProps = jest.fn();
const mockClose = jest.fn();
const mockMarkSaved = jest.fn();
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
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, onPress }: React.PropsWithChildren<{ onPress?: () => void }>) => (
		<button onClick={onPress}>{children}</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/collapsible', () => ({
	Collapsible: ({ children }: React.PropsWithChildren) => <>{children}</>,
	CollapsibleContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	CollapsibleTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/dialog', () => ({
	DialogAction: ({ children, onPress }: React.PropsWithChildren<{ onPress?: () => void }>) => (
		<button type="button" data-testid={String(children)} onClick={onPress}>
			{children}
		</button>
	),
	DialogClose: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({ children }: React.PropsWithChildren) => <footer>{children}</footer>,
	useDialog: () => ({ close: mockClose }),
}));

jest.mock('@wcpos/components/form', () => ({
	Form: jest.requireActual('react-hook-form').FormProvider,
	useFormChangeHandler: jest.requireActual('@wcpos/components/form/use-form-change-handler')
		.useFormChangeHandler,
	SavedFieldProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SavedMark: () => null,
	useMarkSaved: () => mockMarkSaved,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../components/billing-address-form', () => {
	const z = jest.requireActual('zod') as typeof import('zod');
	return {
		BillingAddressForm: () => {
			const { Controller, useFormContext } = jest.requireActual('react-hook-form');
			return (
				<Controller
					control={useFormContext().control}
					name="billing.first_name"
					render={({ field }: { field: { value: string; onChange: (value: string) => void } }) => (
						<input
							aria-label="First name"
							value={field.value}
							onChange={(event) => field.onChange(event.target.value)}
						/>
					)}
				/>
			);
		},
		billingAddressSchema: z.object({ billing: z.object({ first_name: z.string() }) }),
	};
});
jest.mock('../../components/customer/tax-ids-form', () => {
	const z = jest.requireActual('zod') as typeof import('zod');
	return { TaxIdsForm: () => null, taxIdsFormSchema: z.array(z.unknown()) };
});
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../components/shipping-address-form', () => {
	const z = jest.requireActual('zod') as typeof import('zod');
	return {
		ShippingAddressForm: () => null,
		shippingAddressSchema: z.object({ shipping: z.object({ first_name: z.string() }) }),
	};
});
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

describe('EditCartCustomerForm', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		canEditCustomers = true;
		currentOrder.customer_id$.next(42);
	});

	it('updates only the selected customer without closing, even before the lookup resolves', async () => {
		const customer = { id: 42, first_name: 'Ada' };
		let resolveLookup: (value: typeof customer) => void = () => undefined;
		const lookup = new Promise<typeof customer>((resolve) => {
			resolveLookup = resolve;
		});
		customerFindOne.mockReturnValue({ exec: () => lookup });

		render(<EditCartCustomerForm />);
		expect(screen.getByRole('contentinfo').textContent).toBe(
			'common.closepos_cart.update_customer_too'
		);
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

	it.each([true, false])(
		'autosaves an address edit and acknowledges only a successful write (%s)',
		async (success) => {
			if (!success) localPatch.mockResolvedValueOnce(undefined);
			render(<EditCartCustomerForm />);
			fireEvent.change(screen.getByRole('textbox', { name: 'First name' }), {
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

	it('copies billing to shipping and writes the order', async () => {
		render(<EditCartCustomerForm />);
		fireEvent.click(
			screen.getByRole('button', { name: 'common.copy_billing_address_to_shipping_address' })
		);
		await waitFor(() => expect(localPatch).toHaveBeenCalled());
		expect((localPatch as jest.Mock).mock.calls[0][0].data.shipping).toEqual(formValues.billing);
	});

	it('shows only Close in the footer without customer edit permission', () => {
		canEditCustomers = false;

		render(<EditCartCustomerForm />);

		expect(screen.getByRole('contentinfo').textContent).toBe('common.close');
	});

	it.each([null, 0])('shows only Close for a missing or guest customer (%s)', (customerId) => {
		currentOrder.customer_id$.next(customerId);

		render(<EditCartCustomerForm />);

		expect(screen.getByRole('contentinfo').textContent).toBe('common.close');
	});
});

jest.mock('../hooks/use-cart-config', () => jest.requireActual('../../../../../jest/cart-write'));

jest.mock('../commands/use-boundary-commit', () => ({
	useBoundaryCommit: () => jest.fn(),
}));
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({}) }));
