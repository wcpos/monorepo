import type { DiscoveryError } from '../types';
import type { PosConnectedDevice } from '../types/point-of-sale-connectors';

export const BT_DISCOVERY_TIMEOUT_MS = 20_000;
// GATT connect + service discovery can take 10-20s on slow printers, and the library
// gives us no way to abort an in-flight connect — be generous before declaring failure.
export const BT_CONNECT_TIMEOUT_MS = 30_000;

export interface BluetoothScanSessionDeps {
	/** Reply to the main-process chooser ('' cancels it). */
	sendSelection: (deviceId: string) => void;
	/** Open the Web Bluetooth chooser; `onConnected` fires when the library connects. */
	startChooser: (onConnected: (device: PosConnectedDevice) => void) => void;
	discoveryTimeoutMs?: number;
	connectTimeoutMs?: number;
}

export interface BluetoothScanSessionCallbacks {
	onScanningChange: (scanning: boolean) => void;
	onError: (error: DiscoveryError | null) => void;
	onConnected: (device: PosConnectedDevice) => void;
}

export interface BluetoothScanSession {
	start: () => void;
	select: (deviceId: string) => void;
	cancel: () => void;
	isActive: () => boolean;
}

type Phase = 'idle' | 'discovering' | 'connecting';

/**
 * Owns one Web Bluetooth chooser session. The chooser has no completion signal of its
 * own (the connector library swallows requestDevice rejections), so this machine is the
 * single source of truth: discovery timeout ends an empty chooser, connect timeout ends
 * a selection the library never confirmed, cancel ends it on user request or unmount.
 */
export function createBluetoothScanSession(
	deps: BluetoothScanSessionDeps,
	callbacks: BluetoothScanSessionCallbacks
): BluetoothScanSession {
	const discoveryTimeoutMs = deps.discoveryTimeoutMs ?? BT_DISCOVERY_TIMEOUT_MS;
	const connectTimeoutMs = deps.connectTimeoutMs ?? BT_CONNECT_TIMEOUT_MS;

	let phase: Phase = 'idle';
	let timer: ReturnType<typeof setTimeout> | null = null;

	const clearTimer = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};

	const finish = () => {
		clearTimer();
		phase = 'idle';
		callbacks.onScanningChange(false);
	};

	const start = () => {
		if (phase !== 'idle') return;
		phase = 'discovering';
		callbacks.onError(null);
		callbacks.onScanningChange(true);
		deps.startChooser((device) => {
			if (phase === 'idle') return;
			finish();
			callbacks.onConnected(device);
		});
		timer = setTimeout(() => {
			if (phase !== 'discovering') return;
			deps.sendSelection('');
			finish();
			callbacks.onError({ code: 'bt-none-found' });
		}, discoveryTimeoutMs);
	};

	const select = (deviceId: string) => {
		if (phase !== 'discovering') return;
		clearTimer();
		phase = 'connecting';
		deps.sendSelection(deviceId);
		timer = setTimeout(() => {
			if (phase !== 'connecting') return;
			finish();
			callbacks.onError({ code: 'bt-connect-failed' });
		}, connectTimeoutMs);
	};

	const cancel = () => {
		if (phase === 'idle') return;
		if (phase === 'discovering') deps.sendSelection('');
		finish();
	};

	return { start, select, cancel, isActive: () => phase !== 'idle' };
}
