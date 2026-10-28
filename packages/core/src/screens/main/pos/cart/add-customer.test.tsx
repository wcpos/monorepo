/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { AddCustomerDialog, AddNewCustomer } from './add-customer';

const mockCreate = jest.fn();
const mockUseMutationProps = jest.fn();
const mockLocalPatch = jest.fn();
const mockFormat = jest.fn(() => 'Ada Lovelace');
const mockLoggerSuccess = jest.fn();
const mockLoggerError = jest.fn();
const mockReset = jest.fn();
const mockOnOpenChange = jest.fn();
const mockRecordCustomerLink = jest.fn();
const mockStoreDB = { name: 'store-db' };

const currentOrderRecord = {
	uuid: 'order-1',
	payload: { customer_id: 7 } as Record<string, unknown>,
	getLatest: () => currentOrderRecord,
};

// No provider is mounted here; avoid loading the settings provider's ESM-only dependencies.
// The form's error band is a Notice, which loads ESM uniwind and expo-linking.
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
jest.mock('../../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../contexts/ui-settings', () => ({ useUISettings: jest.fn() }));

jest.mock('@hookform/resolvers/zod', () => ({
	zodResolver: () => undefined,
}));

jest.mock('react-hook-form', () => ({
	useForm: () => ({
		reset: mockReset,
		handleSubmit: (submit: (data: Record<string, unknown>) => Promise<void>) => () =>
			submit({ first_name: 'Ada', email: 'ada@example.com', billing: {} }),
	}),
}));

jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => String(error),
	isErrorReported: () => false,
	getLogger: () => ({
		error: (...args: unknown[]) => mockLoggerError(...args),
		success: (...args: unknown[]) => mockLoggerSuccess(...args),
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockStoreDB }),
}));

jest.mock('@wcpos/query', () => ({
	OPEN_ORDER_STATUSES: jest.requireActual('@wcpos/query').OPEN_ORDER_STATUSES,
	useQueryRuntime: () => ({ engine: { status: () => ({ activeScopeId: 'scope-1' }) } }),
}));

jest.mock('@wcpos/query/store-local', () => ({
	...jest.requireActual('@wcpos/query/store-local'),
	recordCustomerLink: (...args: unknown[]) => mockRecordCustomerLink(...args),
}));

jest.mock('../../components/customer/customer-form', () => ({
	...jest.requireActual('../../components/customer/customer-form'),
	CustomerForm: ({ footer }: { footer: import('@wcpos/components/dialog').DialogFooterProps }) => {
		const { DialogFooter } = jest.requireActual('../../../../../jest/footer.test-utils');
		return <DialogFooter {...footer} />;
	},
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({
		localPatch: jest
			.requireActual('../../../../../jest/cart-write')
			.resolveCartWrite(mockLocalPatch),
	}),
}));

jest.mock('../../hooks/mutations/use-mutation', () => ({
	useMutation: (props: unknown) => {
		mockUseMutationProps(props);
		return { create: mockCreate };
	},
}));

jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: mockFormat }),
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

describe.each([
	['button dialog', () => <AddNewCustomer />],
	['controlled dialog', () => <AddCustomerDialog open onOpenChange={mockOnOpenChange} />],
])('%s customer creation', (_name, renderComponent) => {
	beforeEach(() => {
		jest.clearAllMocks();
		// The attach mocks write into this record; start each case from the same order.
		currentOrderRecord.payload = { customer_id: 7 };
	});

	// #1523: a born-local customer (no Woo id yet, as offline) is attached at once.
	it('attaches a new customer immediately, as a guest with its addresses, without waiting on the network', async () => {
		const payload = {
			first_name: 'Ada',
			billing: {
				first_name: 'Ada',
				last_name: 'Lovelace',
				email: 'ada@example.com',
				city: 'London',
			},
			shipping: { city: 'Oxford' },
		};
		const toJSON = jest.fn(() => ({ payload }));
		mockCreate.mockResolvedValue({
			uuid: 'customer-1',
			payload,
			getLatest: () => ({ uuid: 'customer-1', payload }),
			toJSON,
		});
		// The order carries what was written, as it does in the app.
		mockLocalPatch.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
			Object.assign(currentOrderRecord.payload, data);
			return { changes: data, document: currentOrderRecord };
		});

		render(renderComponent());

		await act(async () => {
			fireEvent.click(screen.getByTestId('customer-form-add'));
		});

		// The cart's own "{name} saved" is the one toast (the hook is built with showSuccessToast: false).
		expect(mockCreate).toHaveBeenCalledWith({
			data: expect.objectContaining({ first_name: 'Ada' }),
		});
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: currentOrderRecord,
			data: expect.objectContaining({
				customer_id: 0,
				billing: payload.billing,
				shipping: payload.shipping,
			}),
		});
		expect(mockRecordCustomerLink).toHaveBeenCalledWith(mockStoreDB, 'order-1', {
			customerUuid: 'customer-1',
			scopeId: 'scope-1',
			identity: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
			at: expect.any(String),
		});
		// The link is recorded only once the order carries the copied identity.
		expect(mockLocalPatch.mock.invocationCallOrder[0]).toBeLessThan(
			mockRecordCustomerLink.mock.invocationCallOrder[0]!
		);
		expect(mockFormat).toHaveBeenCalledWith(payload);
		expect(mockLoggerError).not.toHaveBeenCalled();
		expect(toJSON).not.toHaveBeenCalled();
		// The form toasts "Saved {name}" itself, so the hook's generic toast stays off.
		expect(mockUseMutationProps).toHaveBeenCalledWith(
			expect.objectContaining({ collectionName: 'customers', showSuccessToast: false })
		);
	});

	it('says the created customer was not attached, with the customer-specific next step', async () => {
		const payload = { id: 37, first_name: 'Ada', billing: {}, shipping: {} };
		mockCreate.mockResolvedValue({ payload, getLatest: () => ({ payload }) });
		mockLocalPatch.mockRejectedValueOnce(new Error('cart write failed'));

		render(renderComponent());
		await act(async () => {
			fireEvent.click(screen.getByTestId('customer-form-add'));
		});

		expect(mockLoggerError).toHaveBeenCalledWith(
			'Customer created but not added to the cart',
			expect.objectContaining({
				toast: {
					title: 'pos_cart.customer_saved_not_attached',
					text2: 'pos_cart.customer_saved_not_attached_hint',
				},
			})
		);
	});

	it('leaves a refused create to the one report useMutation already made', async () => {
		mockCreate.mockRejectedValue(new Error('write-rejected for mutation "mutation-1"'));

		render(renderComponent());
		await act(async () => {
			fireEvent.click(screen.getByTestId('customer-form-add'));
		});

		expect(mockLoggerError).not.toHaveBeenCalled();
		expect(mockLocalPatch).not.toHaveBeenCalled();
	});

	it('a new customer with no shipping address leaves the order shipping alone', async () => {
		const payload = { first_name: 'Ada', billing: { first_name: 'Ada', email: 'ada@example.com' } };
		mockCreate.mockResolvedValue({
			uuid: 'customer-1',
			payload,
			getLatest: () => ({ uuid: 'customer-1', payload }),
			toJSON: () => ({ payload }),
		});
		// The order carries what was written, as it does in the app.
		mockLocalPatch.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
			Object.assign(currentOrderRecord.payload, data);
			return { changes: data, document: currentOrderRecord };
		});
		render(renderComponent());
		await act(async () => {
			fireEvent.click(screen.getByTestId('customer-form-add'));
		});
		const { data } = mockLocalPatch.mock.calls[0][0];
		expect(data).toMatchObject({ customer_id: 0, billing: payload.billing, shipping: undefined });
	});

	it('keeps the form open and records no link when the create could not be queued', async () => {
		// create() reports its own failure and resolves undefined.
		mockCreate.mockResolvedValue(undefined);

		render(renderComponent());
		await act(async () => {
			fireEvent.click(screen.getByTestId('customer-form-add'));
		});

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockRecordCustomerLink).not.toHaveBeenCalled();
		expect(mockOnOpenChange).not.toHaveBeenCalled();
	});
});

it('closes the controlled dialog as soon as the customer is attached', async () => {
	const payload = { first_name: 'Ada', billing: { first_name: 'Ada' }, shipping: {} };
	mockCreate.mockResolvedValue({
		uuid: 'customer-1',
		payload,
		getLatest: () => ({ uuid: 'customer-1', payload }),
	});
	mockLocalPatch.mockResolvedValue({ changes: {}, document: currentOrderRecord });

	render(<AddCustomerDialog open onOpenChange={mockOnOpenChange} />);
	await act(async () => {
		fireEvent.click(screen.getByTestId('customer-form-add'));
	});

	expect(mockOnOpenChange).toHaveBeenCalledWith(false);
});

// monorepo#2284: a root `style={{ display: 'none' }}` landed on the panel and the dialog opened hidden.
it('the controlled dialog opens a panel that is not hidden', () => {
	render(<AddCustomerDialog open onOpenChange={mockOnOpenChange} />);
	expect(screen.getByTestId('add-customer-dialog').style.display).not.toBe('none');
});

jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));
// The v2 root has no wrapper: a single-child root is `asChild`, so its own props land on the panel.
jest.mock('@wcpos/components/dialog', () => ({
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
	Dialog: ({
		children,
		open: _open,
		onOpenChange: _onOpenChange,
		...rootProps
	}: React.PropsWithChildren<{ open?: boolean; onOpenChange?: (open: boolean) => void }>) =>
		React.Children.count(children) === 1 && React.isValidElement(children) ? (
			React.cloneElement(children, rootProps)
		) : (
			<>{children}</>
		),
	DialogContent: ({
		children,
		testID,
		style,
	}: React.PropsWithChildren<{ testID?: string; style?: React.CSSProperties }>) => (
		<div role="dialog" data-testid={testID} style={style}>
			{children}
		</div>
	),
}));

jest.mock('../hooks/use-cart-config', () => jest.requireActual('../../../../../jest/cart-write'));

jest.mock('../commands/use-boundary-commit', () => ({
	useBoundaryCommit: () => jest.fn(),
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress: () => void; testID: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Keep the billing helper real while excluding platform-only field controls.
jest.mock('@wcpos/components/collapsible', () => ({}));
jest.mock('@wcpos/components/form', () => ({}));
jest.mock('../../components/country-state-select/country-combobox', () => ({}));
jest.mock('../../components/country-state-select/state-forminput', () => ({}));
jest.mock('../../components/meta-data-form', () => ({ metaDataSchema: {} }));
jest.mock('../../components/customer/tax-ids-form', () => ({ taxIdsFormSchema: {} }));
