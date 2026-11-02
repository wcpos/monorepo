/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { AddCustomerScreen } from './add';

const mockCreate = jest.fn();
const mockUseMutationProps = jest.fn();
const mockFormat = jest.fn(() => 'Ada Lovelace');
const mockLoggerSuccess = jest.fn();
const mockLoggerError = jest.fn();
const mockRouterBack = jest.fn();

// The form's error band is a Notice, which loads ESM uniwind and expo-linking.
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../jest/property-row.test-utils')
);
jest.mock('../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('@hookform/resolvers/zod', () => ({
	zodResolver: () => undefined,
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({ back: mockRouterBack }),
}));

jest.mock('react-hook-form', () => ({
	useForm: () => ({
		handleSubmit: (submit: (data: Record<string, unknown>) => Promise<void>) => () =>
			submit({ first_name: 'Ada', email: 'ada@example.com', billing: {} }),
	}),
}));

jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogBody: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
	...jest.requireActual('../components/customer/customer-form'),
	CustomerForm: ({ footer }: { footer: import('@wcpos/components/dialog').DialogFooterProps }) => {
		const { DialogFooter } = jest.requireActual('../../../../jest/footer.test-utils');
		return <DialogFooter {...footer} />;
	},
}));

jest.mock('../hooks/mutations/use-mutation', () => ({
	useMutation: (props: unknown) => {
		mockUseMutationProps(props);
		return { create: mockCreate };
	},
}));

jest.mock('../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: jest.fn() }),
}));

jest.mock('../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: mockFormat }),
}));

beforeEach(() => {
	jest.clearAllMocks();
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

	await act(async () => {
		fireEvent.click(screen.getByTestId('customer-form-add'));
	});

	expect(mockCreate).toHaveBeenCalledWith({
		data: expect.objectContaining({
			first_name: 'Ada',
			billing: expect.objectContaining({ first_name: 'Ada' }),
		}),
	});
	expect(mockFormat).toHaveBeenCalledWith(payload);
	// The screen toasts "Saved {name}" itself, so the hook's generic toast stays off.
	expect(mockUseMutationProps).toHaveBeenCalledWith(
		expect.objectContaining({ collectionName: 'customers', showSuccessToast: false })
	);
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
jest.mock('../components/country-state-select/country-combobox', () => ({}));
jest.mock('../components/country-state-select/state-forminput', () => ({}));
jest.mock('../components/meta-data-form', () => ({ metaDataSchema: {} }));
jest.mock('../components/customer/tax-ids-form', () => ({
	useNewTaxIdRow: () => () => ({ type: 'eu_vat', value: '', country: '' }),
	taxIdsFormSchema: {},
}));
// The form's address rows read the store country; its app-state chain loads ESM uuid.
jest.mock('../hooks/use-base-tax-location', () => ({ useBaseTaxLocation: () => ({}) }));
