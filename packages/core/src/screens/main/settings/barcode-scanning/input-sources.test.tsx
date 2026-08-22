/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { InputSources } from './input-sources';

const mockToastShow = jest.fn();
const mockSave = jest.fn();
const mockRemove = jest.fn();
const mockInsert = jest.fn();
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
	Input: (props: {
		testID?: string;
		value?: string;
		placeholder?: string;
		onChangeText?: (value: string) => void;
	}) => (
		<input
			data-testid={props.testID}
			value={props.value}
			placeholder={props.placeholder}
			onChange={(event) => props.onChangeText?.(event.target.value)}
		/>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
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
const collection = {
	find: () => ({ $: of(mockProfiles) }),
	insert: (...args: unknown[]) => mockInsert(...args),
};

jest.mock('uuid', () => ({ v4: () => 'manual-profile-uuid' }));

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
let mockBleControl = unavailableControl;
jest.mock('../../hooks/barcodes/scan-hub-context', () => ({
	useDeviceScanControls: () => ({
		serial: mockSerialControl,
		hid: unavailableControl,
		ble: mockBleControl,
	}),
}));

describe('InputSources mode explainer', () => {
	afterEach(() => {
		mockSerialControl = unavailableControl;
		mockBleControl = unavailableControl;
		mockProfiles = [profile];
	});

	it('connects and disconnects an available BLE scanner', () => {
		const connect = jest.fn();
		const disconnect = jest.fn();
		mockBleControl = { available: true, connected: false, connect, disconnect };
		const { rerender } = render(<InputSources />);

		fireEvent.click(screen.getByTestId('ble-connect-button'));
		expect(connect).toHaveBeenCalledTimes(1);

		mockBleControl = { ...mockBleControl, connected: true };
		rerender(<InputSources />);
		fireEvent.click(screen.getByTestId('ble-connect-button'));
		expect(disconnect).toHaveBeenCalledTimes(1);
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

describe('InputSources manual Bluetooth service UUID', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSerialControl = { ...unavailableControl, available: true };
		mockProfiles = [profile];
	});

	afterEach(() => {
		mockSerialControl = unavailableControl;
		mockProfiles = [profile];
	});

	it('adds a serial profile with a normalized canonical UUID', async () => {
		render(<InputSources />);

		fireEvent.change(screen.getByTestId('bluetooth-service-class-id-input'), {
			target: { value: ' 49535343-FE7D-4AE5-8FA9-9FAFD205E455 ' },
		});
		fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));

		await waitFor(() =>
			expect(mockInsert).toHaveBeenCalledWith({
				id: 'manual-profile-uuid',
				label: '',
				connectionType: 'serial',
				deviceName: 'bluetooth-serial',
				bluetoothServiceClassId: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
				createdAt: expect.any(String),
			})
		);
		expect((screen.getByTestId('bluetooth-service-class-id-input') as HTMLInputElement).value).toBe(
			''
		);
	});

	it('rejects a non-canonical UUID without inserting a profile', () => {
		render(<InputSources />);

		fireEvent.change(screen.getByTestId('bluetooth-service-class-id-input'), {
			target: { value: '1101' },
		});
		fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));

		expect(screen.getByTestId('bluetooth-service-class-id-error')).toBeTruthy();
		expect(mockInsert).not.toHaveBeenCalled();
	});

	it('ignores a second Add press while the first insert is pending', async () => {
		let resolveInsert: (value?: unknown) => void = () => {};
		mockInsert.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveInsert = resolve;
				})
		);
		render(<InputSources />);

		fireEvent.change(screen.getByTestId('bluetooth-service-class-id-input'), {
			target: { value: '49535343-fe7d-4ae5-8fa9-9fafd205e455' },
		});
		fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));
		fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));

		resolveInsert();
		await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
	});

	it('does not insert a duplicate serial service UUID', () => {
		mockProfiles = [
			{
				...profile,
				connectionType: 'serial',
				bluetoothServiceClassId: '49535343-FE7D-4AE5-8FA9-9FAFD205E455',
			},
		];
		render(<InputSources />);

		fireEvent.change(screen.getByTestId('bluetooth-service-class-id-input'), {
			target: { value: '49535343-fe7d-4ae5-8fa9-9fafd205e455' },
		});
		fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));

		expect(mockInsert).not.toHaveBeenCalled();
		expect(mockToastShow).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'info', title: expect.any(String) })
		);
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
