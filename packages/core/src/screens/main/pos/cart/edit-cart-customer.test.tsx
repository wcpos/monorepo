/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { EditCartCustomerForm } from './edit-cart-customer';

const formValues = {
	billing: { first_name: 'Ada' },
	shipping: { first_name: 'Ada' },
	tax_ids: [{ type: 'vat', value: 'ES123' }],
};
const localPatch = jest.fn(() => Promise.resolve());
const patchCustomer = jest.fn(() => Promise.resolve(null));
const mockUseMutationProps = jest.fn();
const mockClose = jest.fn();
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

jest.mock('react-hook-form', () => ({
	useForm: () => ({
		handleSubmit: (callback: (data: typeof formValues) => Promise<void>) => () =>
			callback(formValues),
		getValues: () => formValues,
		setValue: jest.fn(),
	}),
}));

jest.mock('@wcpos/query', () => ({
	OPEN_ORDER_STATUSES: jest.requireActual('@wcpos/query').OPEN_ORDER_STATUSES,
	readStorePaymentsContract: jest.requireActual('@wcpos/query').readStorePaymentsContract,
	useQueryRuntime: () => manager,
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
	DialogClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
	useDialog: () => ({ close: mockClose }),
}));

jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
	return { BillingAddressForm: () => null, billingAddressSchema: z.object({}) };
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
		shippingAddressSchema: z.object({}),
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
		return { patch: patchCustomer, patchRecord: patchCustomer };
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

	it('updates the selected customer when save is clicked before the lookup resolves', async () => {
		const customer = { id: 42, first_name: 'Ada' };
		let resolveLookup: (value: typeof customer) => void = () => undefined;
		const lookup = new Promise<typeof customer>((resolve) => {
			resolveLookup = resolve;
		});
		customerFindOne.mockReturnValue({ exec: () => lookup });

		render(<EditCartCustomerForm />);
		fireEvent.click(screen.getByTestId('pos_cart.save_to_order_customer'));

		await waitFor(() => expect(localPatch).toHaveBeenCalled());
		// The customer stays who it is: the edit writes the addresses and tax ids, never the id.
		const written = (localPatch as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
		expect('customer_id' in written.data).toBe(false);
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
		// The form toasts "Saved {name}" itself, so the hook's generic toast stays off.
		expect(mockUseMutationProps).toHaveBeenCalledWith(
			expect.objectContaining({ collectionName: 'customers', showSuccessToast: false })
		);
	});

	it('keeps save-to-order available but hides save-to-customer without edit permission', () => {
		canEditCustomers = false;

		render(<EditCartCustomerForm />);

		expect(screen.getByTestId('pos_cart.save_to_order')).toBeTruthy();
		expect(screen.queryByTestId('pos_cart.save_to_order_customer')).toBeNull();
	});

	it('hides save-to-customer when the order has no customer ID', () => {
		currentOrder.customer_id$.next(null);

		render(<EditCartCustomerForm />);

		expect(screen.getByTestId('pos_cart.save_to_order')).toBeTruthy();
		expect(screen.queryByTestId('pos_cart.save_to_order_customer')).toBeNull();
	});
});

jest.mock('../hooks/use-cart-config', () => jest.requireActual('../../../../../jest/cart-write'));

jest.mock('../commands/use-boundary-commit', () => ({
	useBoundaryCommit: () => jest.fn(),
}));
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({}) }));
