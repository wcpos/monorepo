/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { AddCustomerDialog, AddNewCustomer } from './add-customer';

type SubmitCustomer = (data: Record<string, unknown>) => Promise<void>;

const mockCreate = jest.fn();
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
	useMutation: () => ({ create: mockCreate }),
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
		const payload = {
			id: 37,
			first_name: 'Ada',
			billing: { city: 'London' },
			shipping: { city: 'Oxford' },
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
			},
		});
		expect(mockFormat).toHaveBeenCalledWith(payload);
		expect(toJSON).not.toHaveBeenCalled();
	});
});
