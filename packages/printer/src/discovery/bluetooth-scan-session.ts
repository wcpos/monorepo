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
 *
 * A per-session `generation` counter is used to invalidate timers and closures from
 * ended sessions — `phase` alone cannot distinguish WHICH session a stale closure
 * belongs to after a restart.
 */
export function createBluetoothScanSession(
	deps: BluetoothScanSessionDeps,
	callbacks: BluetoothScanSessionCallbacks
): BluetoothScanSession {
	const discoveryTimeoutMs = deps.discoveryTimeoutMs ?? BT_DISCOVERY_TIMEOUT_MS;
	const connectTimeoutMs = deps.connectTimeoutMs ?? BT_CONNECT_TIMEOUT_MS;

	let phase: Phase = 'idle';
	let timer: ReturnType<typeof setTimeout> | null = null;
	// Incremented on each start() and on finish() so stale closures/timers from a
	// previous session are always invalidated before they can act.
	let generation = 0;

	const clearTimer = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};

	const finish = () => {
		clearTimer();
		// Invalidate all outstanding closures/timers that captured an earlier generation.
		generation++;
		phase = 'idle';
		callbacks.onScanningChange(false);
	};

	const start = () => {
		if (phase !== 'idle') return;
		phase = 'discovering';
		// Capture the generation for this session so timers and the onConnected closure
		// can verify they still belong to the current run.
		const gen = ++generation;
		callbacks.onError(null);
		callbacks.onScanningChange(true);

		try {
			deps.startChooser((device) => {
				// Stale closure from a finished session — ignore.
				if (gen !== generation) return;
				if (phase === 'idle') return;

				// Still in 'discovering' (auto-reconnect fired before an explicit select):
				// the main-process chooser is still pending — dismiss it.
				if (phase === 'discovering') {
					deps.sendSelection('');
				}

				finish();
				callbacks.onConnected(device);
			});
		} catch (err) {
			// Web Bluetooth can be unavailable (no navigator.bluetooth, disabled by policy)
			// and the connector constructor throws synchronously — without this the session
			// would stay 'discovering' forever with the scan button disabled.
			finish();
			callbacks.onError({
				code: 'discovery-failed',
				detail: err instanceof Error ? err.message : String(err),
			});
			return;
		}

		// Bail before arming the discovery timer if the startChooser callback already
		// fired synchronously and ended the session.
		if (gen !== generation || phase !== 'discovering') return;

		timer = setTimeout(() => {
			// Generation guard: a restarted session's new timer must not be pre-empted
			// by this stale one.
			if (gen !== generation) return;
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
		// Capture the current generation at arm time; select() is part of the same
		// session as the preceding start(), so no need to increment here.
		const gen = generation;
		timer = setTimeout(() => {
			if (gen !== generation) return;
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
