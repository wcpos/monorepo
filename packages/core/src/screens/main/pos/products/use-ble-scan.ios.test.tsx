/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';

import { type ScanEvent, type ScanHub, scannerDeviceKey } from '@wcpos/scanner';

import { useBleScan } from './use-ble-scan.ios';

import type { Observable, Subscription as RxSubscription } from 'rxjs';

const FFF0_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
const FFF1_NOTIFY = '0000fff1-0000-1000-8000-00805f9b34fb';
const SERVICE_18F0 = '000018f0-0000-1000-8000-00805f9b34fb';
const FF00_SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';

type ScanListener = (error: Error | null, device: FakeDevice | null) => void;
type MonitorListener = (
	error: Error | null,
	characteristic: { value: string | null } | null
) => void;

const mockStartDeviceScan = jest.fn();
const mockStopDeviceScan = jest.fn(async () => undefined);
const mockDevices = jest.fn(async (): Promise<FakeDevice[]> => []);
const mockConnectToDevice = jest.fn();
const mockOnStateChange = jest.fn();
const mockCancelDeviceConnection = jest.fn(async () => undefined);
const mockDestroy = jest.fn(async () => undefined);
const mockUpsert = jest.fn();
const mockMonitorRemove = jest.fn();
const mockStateSubscriptionRemove = jest.fn();
let mockProfiles: Record<string, unknown>[] = [];
let mockBleState = 'PoweredOn';
let mockStateListener: ((state: string) => void) | undefined;
let scanListener: ScanListener | undefined;
let monitorListener: MonitorListener | undefined;
let mockCollection: {
	find: () => { exec: () => Promise<Record<string, unknown>[]> };
	upsert: (row: Record<string, unknown>) => Promise<void>;
};

jest.mock('react-native', () => ({
	NativeModules: { BlePlx: {} },
	Platform: { OS: 'ios' },
}));

jest.mock('react-native-ble-plx', () => ({
	BleManager: jest.fn(() => ({
		startDeviceScan: mockStartDeviceScan,
		stopDeviceScan: mockStopDeviceScan,
		devices: mockDevices,
		connectToDevice: mockConnectToDevice,
		onStateChange: mockOnStateChange,
		cancelDeviceConnection: mockCancelDeviceConnection,
		destroy: mockDestroy,
	})),
	State: { Unknown: 'Unknown', PoweredOn: 'PoweredOn' },
}));

jest.mock('@wcpos/query', () => ({
	useDocField: (_store: unknown, selector: (value: Record<string, unknown>) => unknown) =>
		selector({
			barcode_scanning_min_chars: 3,
			barcode_scanning_prefix: '',
			barcode_scanning_suffix: '',
		}),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: {} }),
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => ({
		collection: mockCollection,
	}),
}));

interface FakeDevice {
	id: string;
	name: string | null;
	localName: string | null;
	serviceUUIDs: string[] | null;
	connect: jest.Mock<Promise<FakeDevice>>;
	cancelConnection: jest.Mock<Promise<FakeDevice>>;
	discoverAllServicesAndCharacteristics: jest.Mock<Promise<FakeDevice>>;
	characteristicsForService: jest.Mock<Promise<Record<string, unknown>[]>>;
	monitorCharacteristicForService: jest.Mock;
}

function device(overrides: Partial<FakeDevice> = {}): FakeDevice {
	const value = {
		id: 'peripheral-1',
		name: 'Netum Scanner',
		localName: null,
		serviceUUIDs: [FFF0_SERVICE],
		connect: jest.fn<Promise<FakeDevice>, []>(),
		cancelConnection: jest.fn<Promise<FakeDevice>, []>(),
		discoverAllServicesAndCharacteristics: jest.fn<Promise<FakeDevice>, []>(),
		characteristicsForService: jest.fn(async () => [{ uuid: FFF1_NOTIFY, isNotifiable: true }]),
		monitorCharacteristicForService: jest.fn(
			(_service: string, _characteristic: string, listener: MonitorListener) => {
				monitorListener = listener;
				return { remove: mockMonitorRemove };
			}
		),
		...overrides,
	} as FakeDevice;
	value.connect.mockResolvedValue(value);
	value.cancelConnection.mockResolvedValue(value);
	value.discoverAllServicesAndCharacteristics.mockResolvedValue(value);
	return value;
}

function hubHarness() {
	const events: ScanEvent[] = [];
	let subscription: RxSubscription | undefined;
	const unregister = jest.fn(() => subscription?.unsubscribe());
	const registerSource = jest.fn((source$: Observable<ScanEvent>) => {
		subscription = source$.subscribe({
			next: (event) => events.push(event),
			error: () => undefined,
		});
		return unregister;
	});
	return {
		events,
		unregister,
		hub: {
			events$: {} as Observable<ScanEvent>,
			emit: jest.fn(),
			registerSource,
		} as ScanHub,
	};
}

async function waitUntilAvailable(result: { current: { available: boolean } }) {
	await waitFor(() => expect(result.current.available).toBe(true));
}

async function connectDiscovered(
	result: { current: { connect: () => Promise<void> } },
	discovered: FakeDevice
) {
	let pending: Promise<void>;
	act(() => {
		pending = result.current.connect();
	});
	await waitFor(() => expect(scanListener).toBeDefined());
	await act(async () => {
		scanListener?.(null, discovered);
		await pending!;
	});
}

describe('useBleScan (iOS)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockProfiles = [];
		mockBleState = 'PoweredOn';
		mockStateListener = undefined;
		scanListener = undefined;
		monitorListener = undefined;
		mockCollection = {
			find: () => ({ exec: async () => mockProfiles }),
			upsert: async (row: Record<string, unknown>) => {
				mockUpsert(row);
			},
		};
		mockOnStateChange.mockImplementation(
			(listener: (state: string) => void, emitCurrentState: boolean) => {
				mockStateListener = listener;
				if (emitCurrentState) listener(mockBleState);
				return { remove: mockStateSubscriptionRemove };
			}
		);
		mockStartDeviceScan.mockImplementation(
			async (_services: string[], _options: null, listener: ScanListener) => {
				scanListener = listener;
			}
		);
		mockUpsert.mockImplementation(async (row: Record<string, unknown>) => {
			mockProfiles.push(row);
		});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('cancels a connected device when its attach request becomes stale', async () => {
		const harness = hubHarness();
		const discovered = device();
		let finishConnection: ((value: FakeDevice) => void) | undefined;
		discovered.connect.mockImplementation(
			() => new Promise((resolve) => (finishConnection = resolve))
		);
		const { result } = renderHook(() => useBleScan(harness.hub));
		await waitUntilAvailable(result);

		let pending: Promise<void>;
		act(() => {
			pending = result.current.connect();
		});
		await waitFor(() => expect(scanListener).toBeDefined());
		act(() => scanListener?.(null, discovered));
		await waitFor(() => expect(discovered.connect).toHaveBeenCalled());
		await act(async () => result.current.disconnect());
		await act(async () => {
			finishConnection?.(discovered);
			await pending!;
		});

		expect(discovered.cancelConnection).toHaveBeenCalledTimes(1);
	});

	it('waits for PoweredOn before starting an explicit scan', async () => {
		mockBleState = 'Unknown';
		const harness = hubHarness();
		const discovered = device();
		const { result } = renderHook(() => useBleScan(harness.hub));
		await waitUntilAvailable(result);

		let pending: Promise<void>;
		act(() => {
			pending = result.current.connect();
		});
		await waitFor(() => expect(mockStateListener).toBeDefined());
		expect(mockStartDeviceScan).not.toHaveBeenCalled();
		act(() => mockStateListener?.('PoweredOn'));
		await waitFor(() => expect(scanListener).toBeDefined());
		await act(async () => {
			scanListener?.(null, discovered);
			await pending!;
		});
	});

	it('waits for PoweredOn before reconnecting a saved profile', async () => {
		mockBleState = 'Unknown';
		mockProfiles = [
			{
				deviceKey: scannerDeviceKey({
					connectionType: 'bluetooth-le',
					peripheralId: 'saved-peripheral',
				}),
				connectionType: 'bluetooth-le',
				peripheralId: 'saved-peripheral',
				serviceUuid: FFF0_SERVICE,
			},
		];
		const known = device({ id: 'saved-peripheral' });
		mockConnectToDevice.mockResolvedValue(known);

		renderHook(() => useBleScan(hubHarness().hub));
		await waitFor(() => expect(mockStateListener).toBeDefined());
		expect(mockConnectToDevice).not.toHaveBeenCalled();
		act(() => mockStateListener?.('PoweredOn'));

		await waitFor(() => expect(mockConnectToDevice).toHaveBeenCalledWith('saved-peripheral'));
	});

	it('stops discovery after the connection timeout', async () => {
		const harness = hubHarness();
		const { result } = renderHook(() => useBleScan(harness.hub));
		await waitUntilAvailable(result);
		jest.useFakeTimers();

		let pending: Promise<void>;
		act(() => {
			pending = result.current.connect();
		});
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(scanListener).toBeDefined();
		await act(async () => {
			jest.advanceTimersByTime(30_000);
			await pending!;
		});

		expect(mockStopDeviceScan).toHaveBeenCalled();
	});

	it('restarts saved-profile reconnect when the profile collection changes', async () => {
		mockProfiles = [
			{
				deviceKey: scannerDeviceKey({
					connectionType: 'bluetooth-le',
					peripheralId: 'first-peripheral',
				}),
				connectionType: 'bluetooth-le',
				peripheralId: 'first-peripheral',
				serviceUuid: FFF0_SERVICE,
			},
		];
		const first = device({ id: 'first-peripheral' });
		const second = device({ id: 'second-peripheral' });
		mockConnectToDevice.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
		const harness = hubHarness();
		const { rerender } = renderHook(() => useBleScan(harness.hub));
		await waitFor(() => expect(mockConnectToDevice).toHaveBeenCalledWith('first-peripheral'));

		mockProfiles = [
			{
				deviceKey: scannerDeviceKey({
					connectionType: 'bluetooth-le',
					peripheralId: 'second-peripheral',
				}),
				connectionType: 'bluetooth-le',
				peripheralId: 'second-peripheral',
				serviceUuid: FFF0_SERVICE,
			},
		];
		mockCollection = {
			find: () => ({ exec: async () => mockProfiles }),
			upsert: async (row: Record<string, unknown>) => {
				mockUpsert(row);
			},
		};
		rerender();

		await waitFor(() => expect(mockConnectToDevice).toHaveBeenCalledWith('second-peripheral'));
		expect(mockCancelDeviceConnection).toHaveBeenCalledWith('first-peripheral');
	});

	it('scans the three-service allowlist and ignores a non-matching advertisement', async () => {
		const harness = hubHarness();
		const matching = device();
		const nonMatching = device({
			id: 'other',
			serviceUUIDs: ['0000180f-0000-1000-8000-00805f9b34fb'],
		});
		const { result } = renderHook(() => useBleScan(harness.hub));
		await waitUntilAvailable(result);

		let pending: Promise<void>;
		act(() => {
			pending = result.current.connect();
		});
		await waitFor(() => expect(scanListener).toBeDefined());
		scanListener?.(null, nonMatching);
		expect(nonMatching.connect).not.toHaveBeenCalled();
		await act(async () => {
			scanListener?.(null, matching);
			await pending!;
		});

		expect(mockStartDeviceScan).toHaveBeenCalledWith(
			[FFF0_SERVICE, SERVICE_18F0, FF00_SERVICE],
			null,
			expect.any(Function)
		);
	});

	it('decodes split base64 notifications and deduplicates a rapid repeat', async () => {
		const harness = hubHarness();
		const { result } = renderHook(() => useBleScan(harness.hub));
		await waitUntilAvailable(result);
		await connectDiscovered(result, device());

		act(() => {
			monitorListener?.(null, { value: Buffer.from('12').toString('base64') });
			monitorListener?.(null, { value: Buffer.from('345\r').toString('base64') });
			monitorListener?.(null, { value: Buffer.from('12345\r').toString('base64') });
		});

		expect(harness.events).toHaveLength(1);
		expect(harness.events[0]).toMatchObject({
			code: '12345',
			source: {
				kind: 'ble',
				profileId: scannerDeviceKey({
					connectionType: 'bluetooth-le',
					peripheralId: 'peripheral-1',
				}),
				deviceName: 'Netum Scanner',
			},
			timestamp: expect.any(Number),
		});
	});

	it('saves one BLE profile per peripheral id', async () => {
		const harness = hubHarness();
		const discovered = device();
		const { result } = renderHook(() => useBleScan(harness.hub));
		await waitUntilAvailable(result);

		await connectDiscovered(result, discovered);
		const deviceKey = scannerDeviceKey({
			connectionType: 'bluetooth-le',
			peripheralId: 'peripheral-1',
		});
		expect(result.current.connectedDeviceKey).toBe(deviceKey);
		expect(mockUpsert).toHaveBeenCalledWith({
			deviceKey,
			name: '',
			connectionType: 'bluetooth-le',
			deviceName: 'Netum Scanner',
			peripheralId: 'peripheral-1',
			serviceUuid: FFF0_SERVICE,
			createdAt: expect.any(String),
		});

		await connectDiscovered(result, discovered);
		expect(mockUpsert).toHaveBeenCalledTimes(1);
	});

	it('silently reconnects exactly one saved BLE profile by peripheral id', async () => {
		const deviceKey = scannerDeviceKey({
			connectionType: 'bluetooth-le',
			peripheralId: 'saved-peripheral',
		});
		const saved = {
			deviceKey,
			connectionType: 'bluetooth-le',
			deviceName: 'Saved Scanner',
			peripheralId: 'saved-peripheral',
			serviceUuid: FFF0_SERVICE,
		};
		mockProfiles = [saved];
		const known = device({ id: 'saved-peripheral' });
		mockDevices.mockResolvedValue([known]);
		mockConnectToDevice.mockResolvedValue(known);

		const { result } = renderHook(() => useBleScan(hubHarness().hub));

		await waitFor(() => expect(mockDevices).toHaveBeenCalledWith(['saved-peripheral']));
		expect(mockConnectToDevice).toHaveBeenCalledWith('saved-peripheral');
		await waitFor(() => expect(result.current.connectedDeviceKey).toBe(deviceKey));
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it('waits for explicit Connect when saved BLE profiles are ambiguous', async () => {
		mockProfiles = [
			{
				deviceKey: scannerDeviceKey({
					connectionType: 'bluetooth-le',
					peripheralId: 'one',
				}),
				connectionType: 'bluetooth-le',
				peripheralId: 'one',
				serviceUuid: FFF0_SERVICE,
			},
			{
				deviceKey: scannerDeviceKey({
					connectionType: 'bluetooth-le',
					peripheralId: 'two',
				}),
				connectionType: 'bluetooth-le',
				peripheralId: 'two',
				serviceUuid: FF00_SERVICE,
			},
		];

		renderHook(() => useBleScan(hubHarness().hub));
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(mockConnectToDevice).not.toHaveBeenCalled();
	});

	it('disconnects state and unregisters the source after a monitor error', async () => {
		const harness = hubHarness();
		const { result } = renderHook(() => useBleScan(harness.hub));
		await waitUntilAvailable(result);
		await connectDiscovered(result, device());
		expect(result.current.connected).toBe(true);
		expect(result.current.connectedDeviceKey).toBe(
			scannerDeviceKey({ connectionType: 'bluetooth-le', peripheralId: 'peripheral-1' })
		);

		act(() => monitorListener?.(new Error('monitor failed'), null));

		await waitFor(() => expect(result.current.connected).toBe(false));
		expect(result.current.connectedDeviceKey).toBeNull();
		expect(harness.unregister).toHaveBeenCalled();
	});
});
