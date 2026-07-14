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
const onOpenChange = jest.fn();
const customerFindOne = jest.fn();
const manager = {
	engine: {
		active: jest.fn(() => ({
			database: { collections: { customers: { findOne: customerFindOne } } },
		})),
	},
};

const currentOrder = {
	customer_id$: new BehaviorSubject(42),
	billing$: new BehaviorSubject(formValues.billing),
	shipping$: new BehaviorSubject(formValues.shipping),
	tax_ids$: new BehaviorSubject(formValues.tax_ids),
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
	useQueryManager: () => manager,
}));

jest.mock('@wcpos/query/engine-adapter/document-proxy', () => ({
	wrapEngineDocument: (_collection: string, document: unknown) => document,
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
	DialogFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
	useRootContext: () => ({ onOpenChange }),
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
	return { ShippingAddressForm: () => null, shippingAddressSchema: z.object({}) };
});
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));
jest.mock('../../hooks/mutations/use-mutation', () => ({
	useMutation: () => ({ patch: patchCustomer }),
}));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Ada' }),
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrder }),
}));

describe('EditCartCustomerForm', () => {
	beforeEach(() => {
		jest.clearAllMocks();
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
		expect(customerFindOne).toHaveBeenCalledWith({ selector: { wooCustomerId: 42 } });
		expect(patchCustomer).not.toHaveBeenCalled();

		await act(async () => resolveLookup(customer));

		await waitFor(() =>
			expect(patchCustomer).toHaveBeenCalledWith({ document: customer, data: formValues })
		);
	});
});
