/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

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
let mockSubmitCustomer: SubmitCustomer | undefined;

const currentOrderRecord = { uuid: 'order-1' };

jest.mock('@hookform/resolvers/zod', () => ({
	zodResolver: () => undefined,
}));

jest.mock('react-hook-form', () => ({
	useForm: () => ({ reset: mockReset }),
}));

jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
	});

	it('attaches fields from the raw record payload to the current order', async () => {
		const taxId = {
			type: 'es_nif',
			value: 'B12345678',
			country: 'ES',
			verified: { status: 'verified', source: 'test' },
		};
		const payload = {
			id: 37,
			first_name: 'Ada',
			billing: { city: 'London' },
			shipping: { city: 'Oxford' },
			tax_ids: [taxId],
		};
		const toJSON = jest.fn(() => ({ payload }));
		mockCreate.mockResolvedValue({
			payload,
			getLatest: () => ({ payload }),
			toJSON,
		});

		render(renderComponent());
		expect(mockSubmitCustomer).toBeDefined();

		await act(async () => {
			await mockSubmitCustomer?.({ first_name: 'Ada' });
		});

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: currentOrderRecord,
			data: {
				customer_id: payload.id,
				billing: payload.billing,
				shipping: payload.shipping,
				tax_ids: [taxId],
			},
		});
		// The order owns its copy: the customer's rows are not written by reference.
		const written = mockLocalPatch.mock.calls[0][0].data.tax_ids;
		expect(written[0]).not.toBe(taxId);
		expect(written[0].verified).not.toBe(taxId.verified);
		expect(mockFormat).toHaveBeenCalledWith(payload);
		expect(toJSON).not.toHaveBeenCalled();
		// The form toasts "Saved {name}" itself, so the hook's generic toast stays off.
		expect(mockUseMutationProps).toHaveBeenCalledWith(
			expect.objectContaining({ collectionName: 'customers', showSuccessToast: false })
		);
	});

	it('writes an empty tax-ID snapshot for a customer created without one', async () => {
		const payload = { id: 37, first_name: 'Ada', billing: {}, shipping: {} };
		mockCreate.mockResolvedValue({ payload, getLatest: () => ({ payload }) });

		render(renderComponent());
		await act(async () => {
			await mockSubmitCustomer?.({ first_name: 'Ada' });
		});

		expect(mockLocalPatch.mock.calls[0][0].data.tax_ids).toEqual([]);
	});

	it('says the created customer was not attached, with the customer-specific next step', async () => {
		const payload = { id: 37, first_name: 'Ada', billing: {}, shipping: {} };
		mockCreate.mockResolvedValue({ payload, getLatest: () => ({ payload }) });
		mockLocalPatch.mockRejectedValueOnce(new Error('cart write failed'));

		render(renderComponent());
		await act(async () => {
			await mockSubmitCustomer?.({ first_name: 'Ada' });
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
			await mockSubmitCustomer?.({ first_name: 'Ada' });
		});

		expect(mockLoggerError).not.toHaveBeenCalled();
		expect(mockLocalPatch).not.toHaveBeenCalled();
	});
});
