/**
 * @jest-environment jsdom
 */
import { TextDecoder as NodeTextDecoder } from 'node:util';

import { act, renderHook, waitFor } from '@testing-library/react';

import { useSerialScan } from './use-serial-scan.web';

// jsdom does not ship TextDecoder; the hook's read loop constructs one.
if (typeof globalThis.TextDecoder === 'undefined') {
	(globalThis as { TextDecoder: unknown }).TextDecoder = NodeTextDecoder;
}

const STANDARD_SPP = '00001101-0000-1000-8000-00805f9b34fb';
const CUSTOM_SERVICE_CLASS = '49535343-fe7d-4ae5-8fa9-9fafd205e455';

const mockInsert = jest.fn();
const mockRequestPort = jest.fn();
const mockGetPorts = jest.fn(async (): Promise<unknown[]> => []);
let mockProfiles: Record<string, unknown>[] = [];

const minCharsObs = {};
const prefixObs = {};
const suffixObs = {};

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		success: jest.fn(),
	}),
}));

jest.mock('@wcpos/scanner', () => ({
	createScanSession: () => ({ offer: jest.fn(), reset: jest.fn() }),
	createSerialLineDecoder: () => ({ push: jest.fn(), reset: jest.fn() }),
	isWebSerialSupported: () => true,
}));

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (observable: unknown) => {
		if (observable === minCharsObs) return 3;
		if (observable === prefixObs) return '';
		if (observable === suffixObs) return '\n';
		return undefined;
	},
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			barcode_scanning_min_chars$: minCharsObs,
			barcode_scanning_prefix$: prefixObs,
			barcode_scanning_suffix$: suffixObs,
		},
	}),
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => ({
		collection: {
			find: () => ({ exec: async () => mockProfiles }),
			insert: (...args: unknown[]) => mockInsert(...args),
		},
	}),
}));

function fakePort(info: Record<string, unknown>) {
	return {
		open: jest.fn(async () => undefined),
		close: jest.fn(async () => undefined),
		readable: null,
		getInfo: () => info,
	};
}

function stubNavigatorSerial() {
	Object.defineProperty(navigator, 'serial', {
		configurable: true,
		value: { requestPort: mockRequestPort, getPorts: mockGetPorts },
	});
}

describe('useSerialScan (web) — Bluetooth RFCOMM support', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockProfiles = [];
		mockGetPorts.mockResolvedValue([]);
		stubNavigatorSerial();
	});

	it('auto-reconnects a saved Bluetooth scanner by service class id on mount', async () => {
		const btPort = fakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
		mockGetPorts.mockResolvedValue([btPort]);
		mockProfiles = [{ connectionType: 'serial', bluetoothServiceClassId: CUSTOM_SERVICE_CLASS }];

		const { result } = renderHook(() => useSerialScan(jest.fn()));

		await waitFor(() => expect(btPort.open).toHaveBeenCalled());
		await waitFor(() => expect(result.current.connected).toBe(true));
		// Silent re-open must not create a duplicate profile.
		expect(mockInsert).not.toHaveBeenCalled();
	});

	it('does not auto-reconnect when multiple granted Bluetooth ports share a service class', async () => {
		const firstPort = fakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
		const secondPort = fakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
		mockGetPorts.mockResolvedValue([firstPort, secondPort]);
		mockProfiles = [{ connectionType: 'serial', bluetoothServiceClassId: CUSTOM_SERVICE_CLASS }];

		renderHook(() => useSerialScan(jest.fn()));

		await act(async () => {
			await Promise.resolve();
		});
		expect(firstPort.open).not.toHaveBeenCalled();
		expect(secondPort.open).not.toHaveBeenCalled();
	});

	it('does not auto-connect a granted Bluetooth port with no matching profile', async () => {
		const btPort = fakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
		mockGetPorts.mockResolvedValue([btPort]);
		mockProfiles = [{ connectionType: 'serial', vendorId: 1234, productId: 5678 }];

		renderHook(() => useSerialScan(jest.fn()));

		// The mount effect must settle without attaching.
		await act(async () => {
			await Promise.resolve();
		});
		expect(btPort.open).not.toHaveBeenCalled();
	});

	it('requests ports with the standard SPP id plus saved custom service classes', async () => {
		mockProfiles = [{ connectionType: 'serial', bluetoothServiceClassId: CUSTOM_SERVICE_CLASS }];
		mockRequestPort.mockRejectedValue(new Error('cancelled'));

		const { result } = renderHook(() => useSerialScan(jest.fn()));
		await act(async () => {
			await result.current.connect();
		});

		expect(mockRequestPort).toHaveBeenCalledWith({
			allowedBluetoothServiceClassIds: expect.arrayContaining([STANDARD_SPP, CUSTOM_SERVICE_CLASS]),
		});
	});

	it('saves a Bluetooth port profile with its service class id', async () => {
		const btPort = fakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS });
		mockRequestPort.mockResolvedValue(btPort);

		const { result } = renderHook(() => useSerialScan(jest.fn()));
		await act(async () => {
			await result.current.connect();
		});

		await waitFor(() =>
			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					connectionType: 'serial',
					deviceName: 'bluetooth-serial',
					bluetoothServiceClassId: CUSTOM_SERVICE_CLASS,
					vendorId: undefined,
					productId: undefined,
				})
			)
		);
	});

	it('does not save a duplicate Bluetooth profile for the same service class id', async () => {
		const btPort = fakePort({ bluetoothServiceClassId: CUSTOM_SERVICE_CLASS.toUpperCase() });
		mockProfiles = [{ connectionType: 'serial', bluetoothServiceClassId: CUSTOM_SERVICE_CLASS }];
		mockRequestPort.mockResolvedValue(btPort);

		const { result } = renderHook(() => useSerialScan(jest.fn()));
		await act(async () => {
			await result.current.connect();
		});

		await waitFor(() => expect(btPort.open).toHaveBeenCalled());
		expect(mockInsert).not.toHaveBeenCalled();
	});
});
