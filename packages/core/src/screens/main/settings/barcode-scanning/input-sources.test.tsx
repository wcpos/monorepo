/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { InputSources } from './input-sources';

const mockToastShow = jest.fn();
const mockSave = jest.fn();
const mockRemove = jest.fn();
const mockOpenExternalURL = jest.fn();

jest.mock('@wcpos/utils/open-external-url', () => ({
	openExternalURL: (...args: unknown[]) => mockOpenExternalURL(...args),
}));

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
let mockProfiles: Record<string, unknown>[] = [profile];
const collection = { find: () => ({ $: of(mockProfiles) }) };

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
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../jest/translate')>(
				'../../../../../jest/translate'
			)
			.createTestT(),
}));

const unavailableControl = {
	available: false,
	connected: false,
	connect: jest.fn(),
	disconnect: jest.fn(),
};
let mockSerialControl = unavailableControl;
jest.mock('../../hooks/barcodes/device-scan-context', () => ({
	useDeviceScanControls: () => ({ serial: mockSerialControl, hid: unavailableControl }),
}));

describe('InputSources mode explainer', () => {
	afterEach(() => {
		mockSerialControl = unavailableControl;
		mockProfiles = [profile];
	});

	it('shows the keyboard-mode note when a direct connection is available', () => {
		mockSerialControl = { ...unavailableControl, available: true };
		render(<InputSources />);
		expect(screen.getByTestId('scanner-mode-note')).toBeTruthy();
	});

	it('hides the note when no direct connection is available', () => {
		render(<InputSources />);
		expect(screen.queryByTestId('scanner-mode-note')).toBeNull();
	});

	it('opens the mode guide through the external URL helper', () => {
		mockSerialControl = { ...unavailableControl, available: true };
		render(<InputSources />);

		fireEvent.click(screen.getByTestId('scanner-mode-docs-link'));

		expect(mockOpenExternalURL).toHaveBeenCalledWith(
			'https://docs.wcpos.com/hardware/scanner-setup-wizard'
		);
	});

	it('translates the fallback name for a Bluetooth serial profile', () => {
		mockProfiles = [
			{
				...profile,
				label: '',
				deviceName: 'bluetooth-serial',
				vendorId: undefined,
				productId: undefined,
				bluetoothServiceClassId: '00001101-0000-1000-8000-00805f9b34fb',
			},
		];

		render(<InputSources />);

		expect(screen.getByText('Bluetooth serial')).toBeTruthy();
	});
});

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
