/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { scannerDeviceKey } from '@wcpos/scanner';
import { getLogger } from '@wcpos/utils/logger';

import { InputSources } from './input-sources';

const mockToastShow = jest.fn();
const mockSave = jest.fn();
const mockRemove = jest.fn();
const mockUpsert = jest.fn();
const mockOpenExternalURL = jest.fn();

// The row's destructive action lives in a ⋮ menu; render the menu flat so the item is reachable.
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => children,
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => children,
	DropdownMenuItem: ({
		children,
		onPress,
		testID,
		disabled,
	}: {
		children: React.ReactNode;
		onPress?: () => void;
		testID?: string;
		disabled?: boolean;
	}) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ testID }: { testID?: string }) => <button data-testid={testID} />,
}));
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
	TextClassContext: jest.requireActual('react').createContext(''),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('./scanner-device-chooser', () => ({
	ScannerDeviceChooser: () => <div data-testid="scanner-device-chooser" />,
}));
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));

/** A sheet that is really closed until opened: the direct controls must not be in the tree. */
jest.mock('@wcpos/components/dialog', () => {
	function Wrap({ children }: React.PropsWithChildren) {
		return <div>{children}</div>;
	}
	const Ctx = React.createContext<{ open: boolean; onOpenChange: (open: boolean) => void }>({
		open: false,
		onOpenChange: () => {},
	});
	return {
		Dialog: ({
			open,
			onOpenChange,
			children,
		}: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) => (
			<Ctx.Provider value={{ open, onOpenChange }}>{children}</Ctx.Provider>
		),
		DialogTrigger: ({ children }: { children: React.ReactElement<{ onPress?: () => void }> }) => {
			const { onOpenChange } = React.useContext(Ctx);
			return React.cloneElement(children, { onPress: () => onOpenChange(true) });
		},
		DialogContent: ({ children }: React.PropsWithChildren) => {
			const { open } = React.useContext(Ctx);
			return open ? <div data-testid="scanner-direct-sheet">{children}</div> : null;
		},
		DialogHeader: Wrap,
		DialogTitle: Wrap,
		DialogBody: Wrap,
		DialogFooter: () => null,
	};
});

const KEYBOARD_KEY = scannerDeviceKey({
	connectionType: 'keyboard',
	vendorId: 1234,
	productId: 5678,
	deviceName: 'ACME Scanner',
});
const SPP_UUID = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const SPP_KEY = scannerDeviceKey({ connectionType: 'bluetooth-spp', serviceUuid: SPP_UUID });
const USB_KEY = scannerDeviceKey({ connectionType: 'usb-serial', vendorId: 1234, productId: 5678 });

const keyboardProfile = {
	deviceKey: KEYBOARD_KEY,
	name: 'Front counter',
	connectionType: 'keyboard',
	deviceName: 'ACME Scanner',
	vendorId: 1234,
	productId: 5678,
	getLatest: () => ({ remove: mockRemove }),
};

let mockProfiles: Record<string, unknown>[] = [keyboardProfile];
const collection = {
	find: () => ({ $: of(mockProfiles.map((row) => ({ toJSON: () => row }))) }),
	findOne: (deviceKey: string) => ({
		exec: async () => {
			const row = mockProfiles.find((profile) => profile.deviceKey === deviceKey);
			return row ? { remove: mockRemove } : null;
		},
	}),
	upsert: (...args: unknown[]) => mockUpsert(...args),
};

const mockStoreDB = { collections: { scanner_profiles: collection } };
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ storeDB: mockStoreDB }),
}));
const CANDIDATE = { deviceName: 'ACME Scanner', vendorId: 1234, productId: 5678 };
// The capture flow deliberately replaces the list while it is running, so most
// tests need it idle; the registration tests opt in.
let mockRegistration: {
	available: boolean;
	capturing: boolean;
	candidate: typeof CANDIDATE | null;
} = { available: true, capturing: false, candidate: null };
jest.mock('../../hooks/barcodes/use-scanner-registration', () => ({
	useScannerRegistration: () => ({
		...mockRegistration,
		register: mockSave,
		stop: jest.fn(),
		start: jest.fn(),
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
	connectedDeviceKey: null as string | null,
	connect: jest.fn(),
	disconnect: jest.fn(),
};
let mockSerialControl = unavailableControl;
let mockHidControl = unavailableControl;
let mockBleControl = unavailableControl;
jest.mock('../../hooks/barcodes/scan-hub-context', () => ({
	useDeviceScanControls: () => ({
		serial: mockSerialControl,
		hid: mockHidControl,
		ble: mockBleControl,
	}),
}));

function resetControls() {
	mockSerialControl = unavailableControl;
	mockHidControl = unavailableControl;
	mockBleControl = unavailableControl;
	mockProfiles = [keyboardProfile];
	mockRegistration = { available: true, capturing: false, candidate: null };
}

describe('InputSources — quiet by default', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetControls();
	});
	afterEach(resetControls);

	it('leads with "no setup needed" when nothing is registered', () => {
		mockProfiles = [];
		mockSerialControl = { ...unavailableControl, available: true };
		render(<InputSources />);

		expect(screen.getByTestId('scanner-no-setup-needed')).toBeTruthy();
		expect(screen.getByText(/WCPOS recognises the scan automatically/)).toBeTruthy();
	});

	it('keeps every direct-connection control in the sheet until its row verb opens it', () => {
		// The whole point of the redesign: a merchant who pairs a keyboard-mode
		// scanner must not be shown connect buttons that read as required steps.
		mockProfiles = [];
		mockSerialControl = { ...unavailableControl, available: true };
		mockHidControl = { ...unavailableControl, available: true };
		render(<InputSources />);

		expect(screen.queryByTestId('scanner-advanced-content')).toBeNull();
		expect(screen.queryByTestId('serial-connect-button')).toBeNull();
		expect(screen.queryByTestId('hid-connect-button')).toBeNull();
		expect(screen.queryByTestId('bluetooth-service-class-id-input')).toBeNull();
		expect(screen.getByTestId('scanner-row-direct').textContent).toContain('None');

		fireEvent.click(screen.getByTestId('scanner-advanced-trigger'));

		expect(screen.getByTestId('scanner-direct-sheet')).toBeTruthy();
		expect(screen.getByTestId('scanner-advanced-content')).toBeTruthy();
		expect(screen.getByTestId('serial-connect-button')).toBeTruthy();
		expect(screen.getByTestId('hid-connect-button')).toBeTruthy();
	});

	it('hosts the Electron device chooser inside the sheet whose connect press it answers (Codex, #2978)', () => {
		mockProfiles = [];
		mockSerialControl = { ...unavailableControl, available: true };
		render(<InputSources />);

		expect(screen.queryByTestId('scanner-device-chooser')).toBeNull();
		fireEvent.click(screen.getByTestId('scanner-advanced-trigger'));
		expect(
			screen
				.getByTestId('scanner-advanced-content')
				.querySelector('[data-testid="scanner-device-chooser"]')
		).toBeTruthy();
	});

	it('shows the raw UUID field unfolded at the end of the sheet, never on the page', () => {
		mockProfiles = [];
		mockSerialControl = { ...unavailableControl, available: true };
		render(<InputSources />);

		expect(screen.queryByTestId('bluetooth-service-class-id-input')).toBeNull();
		fireEvent.click(screen.getByTestId('scanner-advanced-trigger'));

		expect(screen.getByTestId('bluetooth-service-class-id-control').textContent).toContain(
			'isn’t in the list'
		);
		expect(screen.getByTestId('bluetooth-service-class-id-input')).toBeTruthy();
		expect(screen.queryByTestId('scanner-uuid-trigger')).toBeNull();
	});

	it('closes the sheet when a registration started from it takes over the section', () => {
		const { rerender } = render(<InputSources />);
		fireEvent.click(screen.getByTestId('scanner-advanced-trigger'));
		expect(screen.getByTestId('register-scanner-button')).toBeTruthy();

		mockRegistration = { available: true, capturing: true, candidate: null };
		rerender(<InputSources />);
		expect(screen.queryByTestId('scanner-direct-sheet')).toBeNull();

		// The capture ends: the list returns with the sheet still closed.
		mockRegistration = { available: true, capturing: false, candidate: null };
		rerender(<InputSources />);
		expect(screen.getByTestId('scanner-advanced-trigger')).toBeTruthy();
		expect(screen.queryByTestId('scanner-direct-sheet')).toBeNull();
	});

	it('shows saved scanners without needing the sheet opened', () => {
		// Adding is advanced; seeing and removing what you already have is not.
		render(<InputSources />);

		expect(screen.getByTestId('scanner-profile-row')).toBeTruthy();
		expect(screen.queryByTestId('scanner-advanced-content')).toBeNull();
	});

	it('drops the "no setup needed" lead once a scanner is registered', () => {
		render(<InputSources />);
		expect(screen.queryByTestId('scanner-no-setup-needed')).toBeNull();
		expect(screen.getByTestId('scanner-registered-hint')).toBeTruthy();
	});

	it('explains the operating-system keyboard-mode wall inside the sheet', () => {
		mockSerialControl = { ...unavailableControl, available: true };
		render(<InputSources />);

		expect(screen.queryByTestId('scanner-keyboard-wall-note')).toBeNull();
		fireEvent.click(screen.getByTestId('scanner-advanced-trigger'));
		expect(screen.getByTestId('scanner-keyboard-wall-note')).toBeTruthy();
	});

	it('opens the setup guide through the external URL helper', () => {
		render(<InputSources />);

		fireEvent.click(screen.getByTestId('scanner-setup-guide-link'));

		expect(mockOpenExternalURL).toHaveBeenCalledWith(
			'https://docs.wcpos.com/hardware/scanner-setup-wizard'
		);
	});
});

describe('InputSources — per-device status', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetControls();
	});
	afterEach(resetControls);

	it('reports a live link only for the profile that is actually open', () => {
		// The failure this guards: a registered-but-unreachable scanner rendering
		// identically to a working one.
		mockProfiles = [
			{
				deviceKey: USB_KEY,
				name: 'Counter scanner',
				connectionType: 'usb-serial',
				deviceName: 'Serial 1234:5678',
				vendorId: 1234,
				productId: 5678,
				getLatest: () => ({ remove: mockRemove }),
			},
			{
				deviceKey: SPP_KEY,
				name: 'Stockroom scanner',
				connectionType: 'bluetooth-spp',
				deviceName: 'Bluetooth serial',
				serviceUuid: SPP_UUID,
				getLatest: () => ({ remove: mockRemove }),
			},
		];
		mockSerialControl = {
			...unavailableControl,
			available: true,
			connected: true,
			connectedDeviceKey: USB_KEY,
		};
		render(<InputSources />);

		const statuses = screen.getAllByTestId('scanner-profile-status').map((el) => el.textContent);
		expect(statuses).toEqual(['Connected', 'Not in range']);
	});

	it('says "not plugged in" for a cable and "not in range" for a radio', () => {
		mockProfiles = [
			{
				deviceKey: USB_KEY,
				name: 'Counter scanner',
				connectionType: 'usb-serial',
				deviceName: 'Serial 1234:5678',
				getLatest: () => ({ remove: mockRemove }),
			},
			{
				deviceKey: SPP_KEY,
				name: 'Stockroom scanner',
				connectionType: 'bluetooth-spp',
				deviceName: 'Bluetooth serial',
				getLatest: () => ({ remove: mockRemove }),
			},
		];
		mockSerialControl = { ...unavailableControl, available: true };
		render(<InputSources />);

		const statuses = screen.getAllByTestId('scanner-profile-status').map((el) => el.textContent);
		expect(statuses).toEqual(['Not plugged in', 'Not in range']);
	});

	it('never claims a keyboard-mode scanner is connected — there is no link to report', () => {
		render(<InputSources />);

		expect(screen.getByTestId('scanner-profile-status').textContent).toBe('Registered');
	});
});

describe('InputSources — direct connection controls', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetControls();
	});
	afterEach(resetControls);

	it('connects and disconnects an available BLE scanner', () => {
		const connect = jest.fn();
		const disconnect = jest.fn();
		mockBleControl = { ...unavailableControl, available: true, connect, disconnect };
		const { rerender } = render(<InputSources />);

		fireEvent.click(screen.getByTestId('scanner-advanced-trigger'));
		fireEvent.click(screen.getByTestId('ble-connect-button'));
		expect(connect).toHaveBeenCalledTimes(1);

		mockBleControl = { ...mockBleControl, connected: true };
		rerender(<InputSources />);
		fireEvent.click(screen.getByTestId('ble-connect-button'));
		expect(disconnect).toHaveBeenCalledTimes(1);
	});

	it('renders the Bluetooth-serial type label for an SPP profile with no name', () => {
		mockProfiles = [
			{
				deviceKey: SPP_KEY,
				name: '',
				connectionType: 'bluetooth-spp',
				deviceName: 'Bluetooth serial',
				serviceUuid: SPP_UUID,
				getLatest: () => ({ remove: mockRemove }),
			},
		];
		render(<InputSources />);

		expect(screen.getByText(`Bluetooth serial · ${SPP_UUID}`)).toBeTruthy();
	});
});

describe('InputSources manual Bluetooth service UUID', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetControls();
		mockSerialControl = { ...unavailableControl, available: true };
	});
	afterEach(resetControls);

	function openUuidField() {
		render(<InputSources />);
		fireEvent.click(screen.getByTestId('scanner-advanced-trigger'));
	}

	it('adds a Bluetooth-SPP profile keyed on the normalized canonical UUID', async () => {
		openUuidField();

		fireEvent.change(screen.getByTestId('bluetooth-service-class-id-input'), {
			target: { value: ' 49535343-FE7D-4AE5-8FA9-9FAFD205E455 ' },
		});
		await act(async () => {
			fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));
		});

		await waitFor(() =>
			expect(mockUpsert).toHaveBeenCalledWith({
				deviceKey: SPP_KEY,
				name: '',
				connectionType: 'bluetooth-spp',
				deviceName: '',
				serviceUuid: SPP_UUID,
				createdAt: expect.any(String),
			})
		);
		expect((screen.getByTestId('bluetooth-service-class-id-input') as HTMLInputElement).value).toBe(
			''
		);
	});

	it('rejects a non-canonical UUID without writing a profile', () => {
		openUuidField();

		fireEvent.change(screen.getByTestId('bluetooth-service-class-id-input'), {
			target: { value: '1101' },
		});
		fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));

		expect(screen.getByTestId('bluetooth-service-class-id-error')).toBeTruthy();
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it('cannot create a second profile from a double Add press', async () => {
		// This used to need an in-flight ref guard. deviceKey is now the primary
		// key, so both writes address the same row — the property is enforced by
		// the schema rather than by a hand-rolled mutex. Assert the mechanism that
		// now carries it: whatever the timing, every write targets one key.
		let resolveUpsert: (value?: unknown) => void = () => {};
		mockUpsert.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveUpsert = resolve;
				})
		);
		openUuidField();

		fireEvent.change(screen.getByTestId('bluetooth-service-class-id-input'), {
			target: { value: SPP_UUID },
		});
		fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));
		fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));

		resolveUpsert();
		await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
		const keys = mockUpsert.mock.calls.map(([doc]) => (doc as { deviceKey: string }).deviceKey);
		expect(new Set(keys).size).toBe(1);
		expect(keys[0]).toBe(SPP_KEY);
	});

	it('does not re-add a service UUID that is already registered', () => {
		mockProfiles = [
			{
				deviceKey: SPP_KEY,
				name: '',
				connectionType: 'bluetooth-spp',
				deviceName: 'Bluetooth serial',
				serviceUuid: SPP_UUID,
				getLatest: () => ({ remove: mockRemove }),
			},
		];
		openUuidField();

		fireEvent.change(screen.getByTestId('bluetooth-service-class-id-input'), {
			target: { value: '49535343-FE7D-4AE5-8FA9-9FAFD205E455' },
		});
		fireEvent.click(screen.getByTestId('bluetooth-service-class-id-add'));

		expect(mockUpsert).not.toHaveBeenCalled();
		expect(mockToastShow).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'info', title: expect.any(String) })
		);
	});
});

describe('InputSources write failures', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetControls();
	});
	afterEach(resetControls);

	it.each([
		['saving', 'scanner-save-button', mockSave, 'save failed', true],
		['removing', 'scanner-profile-delete', mockRemove, 'remove failed', false],
	])(
		'reports one SYNC101 row and toast when %s a scanner fails',
		async (_action, testID, write, message, needsCandidate) => {
			write.mockRejectedValueOnce(new Error(message));
			if (needsCandidate) {
				mockRegistration = { available: true, capturing: false, candidate: CANDIDATE };
			}
			render(<InputSources />);

			fireEvent.click(screen.getByTestId(testID));

			// A local write: SYNC101's own summary and hint are the toast, never a bare
			// "Error" over the raw RxDB message, which stays in the row.
			await waitFor(() =>
				expect(getLogger([]).error).toHaveBeenCalledWith('Scanner setting could not be saved', {
					code: 'SYNC101',
					showToast: true,
					context: expect.objectContaining({ error: message }),
				})
			);
			expect(mockToastShow).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
		}
	);

	it('replaces the scanner list while a capture is running', () => {
		mockRegistration = { available: true, capturing: true, candidate: null };
		render(<InputSources />);

		expect(screen.queryByTestId('scanner-profile-row')).toBeNull();
		expect(screen.queryByTestId('scanner-advanced-trigger')).toBeNull();
	});
});
