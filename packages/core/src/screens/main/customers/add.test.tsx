/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { AddCustomerScreen } from './add';

type SubmitCustomer = (data: Record<string, unknown>) => Promise<void>;

const mockCreate = jest.fn();
const mockFormat = jest.fn(() => 'Ada Lovelace');
const mockLoggerSuccess = jest.fn();
const mockLoggerError = jest.fn();
const mockRouterBack = jest.fn();
let mockSubmitCustomer: SubmitCustomer | undefined;

jest.mock('@hookform/resolvers/zod', () => ({
	zodResolver: () => undefined,
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({ back: mockRouterBack }),
}));

jest.mock('react-hook-form', () => ({
	useForm: () => ({}),
}));

jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/modal', () => ({
	Modal: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	ModalTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => String(error),
	getLogger: () => ({
		error: (...args: unknown[]) => mockLoggerError(...args),
		success: (...args: unknown[]) => mockLoggerSuccess(...args),
	}),
}));

jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../components/customer/customer-form', () => ({
	CustomerForm: ({ onSubmit }: { onSubmit: SubmitCustomer }) => {
		mockSubmitCustomer = onSubmit;
		return null;
	},
	customerFormSchema: {},
}));

jest.mock('../hooks/mutations/use-mutation', () => ({
	useMutation: () => ({ create: mockCreate }),
}));

jest.mock('../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: mockFormat }),
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockSubmitCustomer = undefined;
});

it('formats the newly created customer from the raw record payload', async () => {
	const payload = { id: 37, first_name: 'Ada', last_name: 'Lovelace' };
	const toJSON = jest.fn(() => ({ payload }));
	mockCreate.mockResolvedValue({
		payload,
		getLatest: () => ({ payload }),
		toJSON,
	});

	render(<AddCustomerScreen />);
	expect(mockSubmitCustomer).toBeDefined();

	await act(async () => {
		await mockSubmitCustomer?.({ first_name: 'Ada' });
	});

	expect(mockFormat).toHaveBeenCalledWith(payload);
	expect(mockLoggerSuccess).toHaveBeenCalledWith('common.saved', {
		showToast: true,
		context: {
			customerId: payload.id,
			customerName: 'Ada Lovelace',
		},
	});
	expect(toJSON).not.toHaveBeenCalled();
	expect(mockRouterBack).toHaveBeenCalledTimes(1);
});
