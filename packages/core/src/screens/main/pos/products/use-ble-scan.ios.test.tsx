/** @jest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';

import type { ScanEvent, ScanHub } from '@wcpos/scanner';

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
const mockCancelDeviceConnection = jest.fn(async () => undefined);
const mockDestroy = jest.fn(async () => undefined);
const mockInsert = jest.fn();
const mockMonitorRemove = jest.fn();
const mockUuid = jest.fn(() => 'new-profile-id');
let mockProfiles: Record<string, unknown>[] = [];
let scanListener: ScanListener | undefined;
let monitorListener: MonitorListener | undefined;

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
		cancelDeviceConnection: mockCancelDeviceConnection,
		destroy: mockDestroy,
	})),
}));

jest.mock('uuid', () => ({ v4: () => mockUuid() }));

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
		collection: {
			find: () => ({ exec: async () => mockProfiles }),
			insert: (row: Record<string, unknown>) => mockInsert(row),
		},
	}),
}));

interface FakeDevice {
	id: string;
	name: string | null;
	localName: string | null;
	serviceUUIDs: string[] | null;
	connect: jest.Mock<Promise<FakeDevice>>;
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
		hub: { events$: {} as Observable<ScanEvent>, emit: jest.fn(), registerSource } as ScanHub,
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
		scanListener = undefined;
		monitorListener = undefined;
		mockStartDeviceScan.mockImplementation(
			async (_services: string[], _options: null, listener: ScanListener) => {
				scanListener = listener;
			}
		);
		mockInsert.mockImplementation(async (row: Record<string, unknown>) => {
			mockProfiles.push(row);
		});
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
				profileId: 'new-profile-id',
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
		expect(mockInsert).toHaveBeenCalledWith({
			id: 'new-profile-id',
			label: '',
			connectionType: 'ble',
			deviceName: 'Netum Scanner',
			blePeripheralId: 'peripheral-1',
			bleServiceUuid: FFF0_SERVICE,
			createdAt: expect.any(String),
		});

		await connectDiscovered(result, discovered);
		expect(mockInsert).toHaveBeenCalledTimes(1);
	});

	it('silently reconnects exactly one saved BLE profile by peripheral id', async () => {
		const saved = {
			id: 'saved-profile',
			connectionType: 'ble',
			deviceName: 'Saved Scanner',
			blePeripheralId: 'saved-peripheral',
			bleServiceUuid: FFF0_SERVICE,
		};
		mockProfiles = [saved];
		const known = device({ id: 'saved-peripheral' });
		mockDevices.mockResolvedValue([known]);
		mockConnectToDevice.mockResolvedValue(known);

		renderHook(() => useBleScan(hubHarness().hub));

		await waitFor(() => expect(mockDevices).toHaveBeenCalledWith(['saved-peripheral']));
		expect(mockConnectToDevice).toHaveBeenCalledWith('saved-peripheral');
		expect(mockInsert).not.toHaveBeenCalled();
	});

	it('waits for explicit Connect when saved BLE profiles are ambiguous', async () => {
		mockProfiles = [
			{ connectionType: 'ble', blePeripheralId: 'one', bleServiceUuid: FFF0_SERVICE },
			{ connectionType: 'ble', blePeripheralId: 'two', bleServiceUuid: FF00_SERVICE },
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

		act(() => monitorListener?.(new Error('monitor failed'), null));

		await waitFor(() => expect(result.current.connected).toBe(false));
		expect(harness.unregister).toHaveBeenCalled();
	});
});
