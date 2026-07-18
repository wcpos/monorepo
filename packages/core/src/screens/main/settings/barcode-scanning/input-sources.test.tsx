/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { InputSources } from './input-sources';

const mockToastShow = jest.fn();
const mockSave = jest.fn();
const mockRemove = jest.fn();

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string }>) => (
		<button type="button" data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/input', () => ({
	Input: (props: { testID?: string }) => <input data-testid={props.testID} />,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));

const profile = {
	id: 'profile-1',
	label: 'Front counter',
	deviceName: 'ACME Scanner',
	vendorId: 1234,
	productId: 5678,
	getLatest: () => ({ remove: mockRemove }),
};
const collection = { find: () => ({ $: of([profile]) }) };

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => ({ collection }),
}));
jest.mock('../../hooks/barcodes/use-scanner-registration', () => ({
	useScannerRegistration: () => ({
		available: true,
		capturing: false,
		candidate: { deviceName: 'ACME Scanner', vendorId: 1234, productId: 5678 },
		save: mockSave,
		discard: jest.fn(),
	}),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
}));

describe('InputSources write failures', () => {
	beforeEach(() => jest.clearAllMocks());

	it.each([
		['saving', 'scanner-save-button', mockSave, 'insert failed'],
		['removing', 'scanner-profile-delete', mockRemove, 'remove failed'],
	])('shows an error toast when %s a scanner fails', async (_action, testID, write, message) => {
		write.mockRejectedValueOnce(new Error(message));
		render(<InputSources />);

		fireEvent.click(screen.getByTestId(testID));

		await waitFor(() =>
			expect(mockToastShow).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'error', description: message })
			)
		);
	});
});
