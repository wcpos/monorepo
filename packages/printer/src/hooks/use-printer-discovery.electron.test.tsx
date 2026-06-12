import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BT_DISCOVERY_TIMEOUT_MS } from '../discovery/bluetooth-scan-session';
import { usePrinterDiscovery } from './use-printer-discovery.electron';

import type { BluetoothCandidate } from '../types';
import type { PosConnectedDevice } from '../types/point-of-sale-connectors';

// vi.mock is hoisted by vitest to the top of the module, so the connectMock /
// addEventListenerMock references inside the factory are valid even though the
// const declarations appear below.
const connectMock = vi.fn();
const addEventListenerMock = vi.fn();
vi.mock('@point-of-sale/webbluetooth-receipt-printer', () => ({
	default: class MockPrinter {
		addEventListener = addEventListenerMock;
		connect = connectMock;
	},
}));

// ---------------------------------------------------------------------------
// IPC stub
// ---------------------------------------------------------------------------

type IpcListener = (...args: unknown[]) => void;

let listeners: Map<string, IpcListener>;
let unsubscribeMock: ReturnType<typeof vi.fn>;

function installIpc(invokeImpl?: (channel: string) => Promise<unknown>) {
	listeners = new Map();
	unsubscribeMock = vi.fn();
	(window as unknown as Record<string, unknown>).ipcRenderer = {
		send: vi.fn(),
		invoke: invokeImpl ? vi.fn().mockImplementation(invokeImpl) : vi.fn().mockResolvedValue([]),
		on: (channel: string, cb: IpcListener) => {
			listeners.set(channel, cb);
			return unsubscribeMock;
		},
	};
}

function removeIpc() {
	delete (window as unknown as Record<string, unknown>).ipcRenderer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire the 'connected' handler captured by addEventListenerMock (call index 0 by default). */
function emitConnected(device: PosConnectedDevice, callIdx = 0) {
	const call = addEventListenerMock.mock.calls[callIdx] as
		| [string, (device: PosConnectedDevice) => void]
		| undefined;
	if (!call) throw new Error(`No addEventListener call at index ${callIdx}`);
	call[1](device);
}

const btDevice: PosConnectedDevice = {
	type: 'bluetooth',
	id: 'dev-1',
	name: 'TM-P20',
	language: 'esc-pos',
	codepageMapping: 'epson',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePrinterDiscovery (electron)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		connectMock.mockReset();
		addEventListenerMock.mockReset();
		installIpc();
	});

	afterEach(() => {
		removeIpc();
		vi.useRealTimers();
	});

	// 1. bluetooth-devices IPC event → bluetoothCandidates
	it('subscribes to bluetooth-devices and exposes candidates', () => {
		const { result } = renderHook(() => usePrinterDiscovery());

		const candidates: BluetoothCandidate[] = [{ id: 'a', name: 'Printer A' }];
		act(() => {
			listeners.get('bluetooth-devices')?.(...[candidates]);
		});

		expect(result.current.bluetoothCandidates).toEqual(candidates);
	});

	// 2. connectBluetoothDevice starts ONE chooser session; second call while active is no-op
	it('connectBluetoothDevice starts one chooser session; second call while active is a no-op', () => {
		const { result } = renderHook(() => usePrinterDiscovery());

		act(() => {
			result.current.connectBluetoothDevice?.();
		});

		expect(connectMock).toHaveBeenCalledTimes(1);
		expect(result.current.isBluetoothScanning).toBe(true);

		// Second call while session is active — should be a no-op.
		act(() => {
			result.current.connectBluetoothDevice?.();
		});

		expect(connectMock).toHaveBeenCalledTimes(1);
	});

	// 3. selectBluetoothCandidate sends ipc.send; connected event adds printer
	it('selectBluetoothCandidate sends bluetooth-device-selected and connected event adds printer', async () => {
		const { result } = renderHook(() => usePrinterDiscovery());

		act(() => {
			result.current.connectBluetoothDevice?.();
		});

		act(() => {
			result.current.selectBluetoothCandidate?.('dev-1');
		});

		const ipc = (window as unknown as Record<string, unknown>).ipcRenderer as {
			send: ReturnType<typeof vi.fn>;
		};
		expect(ipc.send).toHaveBeenCalledWith('bluetooth-device-selected', 'dev-1');

		// Fire connected event.
		await act(async () => {
			emitConnected(btDevice);
		});

		expect(result.current.isBluetoothScanning).toBe(false);
		expect(result.current.printers).toHaveLength(1);
		expect(result.current.printers[0].connectionType).toBe('bluetooth');
	});

	// 4. discovery timeout → ipc.send('', ''), scanning false, error bt-none-found
	it('discovery timeout sends empty selection, sets bt-none-found error, clears candidates', () => {
		const { result } = renderHook(() => usePrinterDiscovery());

		// Push some candidates first.
		act(() => {
			listeners.get('bluetooth-devices')?.(...[[{ id: 'x', name: 'X' }]]);
		});

		act(() => {
			result.current.connectBluetoothDevice?.();
		});

		act(() => {
			vi.advanceTimersByTime(BT_DISCOVERY_TIMEOUT_MS);
		});

		const ipc = (window as unknown as Record<string, unknown>).ipcRenderer as {
			send: ReturnType<typeof vi.fn>;
		};
		expect(ipc.send).toHaveBeenCalledWith('bluetooth-device-selected', '');
		expect(result.current.isBluetoothScanning).toBe(false);
		expect(result.current.error).toEqual({ code: 'bt-none-found' });
		expect(result.current.bluetoothCandidates).toEqual([]);
	});

	// 5. unmount with active session → cancel sends '' and ipc.on unsubscribe is called
	it('unmount with active session cancels the session and unsubscribes ipc.on', () => {
		const { result, unmount } = renderHook(() => usePrinterDiscovery());

		act(() => {
			result.current.connectBluetoothDevice?.();
		});

		expect(result.current.isBluetoothScanning).toBe(true);

		unmount();

		const ipc = (window as unknown as Record<string, unknown>).ipcRenderer as {
			send: ReturnType<typeof vi.fn>;
		};
		expect(ipc.send).toHaveBeenCalledWith('bluetooth-device-selected', '');
		expect(unsubscribeMock).toHaveBeenCalledTimes(1);
	});

	// 6. connectUsbDevice with empty result → isUsbScanning false, error usb-none-found
	it('connectUsbDevice with empty device list sets usb-none-found error', async () => {
		const { result } = renderHook(() => usePrinterDiscovery());

		await act(async () => {
			result.current.connectUsbDevice?.();
		});

		expect(result.current.isUsbScanning).toBe(false);
		expect(result.current.error).toEqual({ code: 'usb-none-found' });
	});
});
