/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { AddCustomerDialog, AddNewCustomer } from './add-customer';

type SubmitCustomer = (data: Record<string, unknown>) => Promise<void>;

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
let mockSubmitCustomer: SubmitCustomer | undefined;

const currentOrderRecord = {
	uuid: 'order-1',
	payload: { customer_id: 7 } as Record<string, unknown>,
	getLatest: () => currentOrderRecord,
};

// No provider is mounted here; avoid loading the settings provider's ESM-only dependencies.
jest.mock('../../contexts/ui-settings', () => ({ useUISettings: jest.fn() }));

jest.mock('@hookform/resolvers/zod', () => ({
	zodResolver: () => undefined,
}));

jest.mock('react-hook-form', () => ({
	useForm: () => ({ reset: mockReset }),
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
	useQueryRuntime: () => ({ engine: { status: () => ({ activeScopeId: 'scope-1' }) } }),
}));

jest.mock('./new-customer-link', () => ({
	...jest.requireActual('./new-customer-link'),
	recordCustomerLink: (...args: unknown[]) => mockRecordCustomerLink(...args),
}));

jest.mock('../../components/customer/customer-form', () => ({
	CustomerForm: ({ onSubmit }: { onSubmit: SubmitCustomer }) => {
		mockSubmitCustomer = onSubmit;
		return null;
	},
	customerFormSchema: {},
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
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
		mockSubmitCustomer = undefined;
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
		expect(mockSubmitCustomer).toBeDefined();

		await act(async () => {
			await mockSubmitCustomer?.({ first_name: 'Ada' });
		});

		// The cart's own "{name} saved" is the one toast (the hook is built with showSuccessToast: false).
		expect(mockCreate).toHaveBeenCalledWith({ data: { first_name: 'Ada' } });
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: currentOrderRecord,
			data: {
				customer_id: 0,
				billing: payload.billing,
				shipping: payload.shipping,
			},
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

	it('leaves a refused create to the one report useMutation already made', async () => {
		mockCreate.mockRejectedValue(new Error('write-rejected for mutation "mutation-1"'));

		render(renderComponent());
		await act(async () => {
			await mockSubmitCustomer?.({ first_name: 'Ada' });
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
			await mockSubmitCustomer?.({ first_name: 'Ada' });
		});
		const { data } = mockLocalPatch.mock.calls[0][0];
		expect(data).toEqual({ customer_id: 0, billing: payload.billing, shipping: undefined });
	});

	it('keeps the form open and records no link when the create could not be queued', async () => {
		// create() reports its own failure and resolves undefined.
		mockCreate.mockResolvedValue(undefined);

		render(renderComponent());
		await act(async () => {
			await mockSubmitCustomer?.({ first_name: 'Ada' });
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
		await mockSubmitCustomer?.({ first_name: 'Ada' });
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
