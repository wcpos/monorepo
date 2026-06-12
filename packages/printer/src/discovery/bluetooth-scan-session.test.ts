import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	BT_CONNECT_TIMEOUT_MS,
	BT_DISCOVERY_TIMEOUT_MS,
	createBluetoothScanSession,
} from './bluetooth-scan-session';

import type { PosConnectedDevice } from '../types/point-of-sale-connectors';

describe('createBluetoothScanSession', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const device = { type: 'bluetooth', id: 'dev-1', name: 'TM-P20' } as PosConnectedDevice;

	function setup() {
		const sendSelection = vi.fn();
		let connectedHandler: ((d: PosConnectedDevice) => void) | undefined;
		const startChooser = vi.fn((onConnected: (d: PosConnectedDevice) => void) => {
			connectedHandler = onConnected;
		});
		const onScanningChange = vi.fn();
		const onError = vi.fn();
		const onConnected = vi.fn();
		const session = createBluetoothScanSession(
			{ sendSelection, startChooser },
			{ onScanningChange, onError, onConnected }
		);
		return {
			session,
			sendSelection,
			startChooser,
			onScanningChange,
			onError,
			onConnected,
			emitConnected: (d: PosConnectedDevice) => connectedHandler?.(d),
		};
	}

	it('start() opens the chooser and reports scanning', () => {
		const s = setup();
		s.session.start();
		expect(s.startChooser).toHaveBeenCalledTimes(1);
		expect(s.onScanningChange).toHaveBeenLastCalledWith(true);
		expect(s.onError).toHaveBeenLastCalledWith(null);
		expect(s.session.isActive()).toBe(true);
	});

	it('start() while active is a no-op (no second chooser, no cancel error)', () => {
		const s = setup();
		s.session.start();
		s.session.start();
		expect(s.startChooser).toHaveBeenCalledTimes(1);
	});

	it('discovery timeout cancels the chooser and reports bt-none-found', () => {
		const s = setup();
		s.session.start();
		vi.advanceTimersByTime(BT_DISCOVERY_TIMEOUT_MS);
		expect(s.sendSelection).toHaveBeenCalledWith('');
		expect(s.onScanningChange).toHaveBeenLastCalledWith(false);
		expect(s.onError).toHaveBeenLastCalledWith({ code: 'bt-none-found' });
		expect(s.session.isActive()).toBe(false);
	});

	it('select() replies with the device id and arms the connect timeout', () => {
		const s = setup();
		s.session.start();
		s.session.select('dev-1');
		expect(s.sendSelection).toHaveBeenCalledWith('dev-1');
		// discovery timeout must no longer fire
		vi.advanceTimersByTime(BT_DISCOVERY_TIMEOUT_MS);
		expect(s.onError).not.toHaveBeenCalledWith({ code: 'bt-none-found' });
		// connect timeout fires instead
		vi.advanceTimersByTime(BT_CONNECT_TIMEOUT_MS);
		expect(s.onError).toHaveBeenLastCalledWith({ code: 'bt-connect-failed' });
		expect(s.session.isActive()).toBe(false);
	});

	it('connected event completes the session without errors', () => {
		const s = setup();
		s.session.start();
		s.session.select('dev-1');
		s.emitConnected(device);
		expect(s.onConnected).toHaveBeenCalledWith(device);
		expect(s.onScanningChange).toHaveBeenLastCalledWith(false);
		vi.runAllTimers();
		expect(s.onError).not.toHaveBeenCalledWith({ code: 'bt-connect-failed' });
		expect(s.onError).not.toHaveBeenCalledWith({ code: 'bt-none-found' });
	});

	it('connected event after the session ended is ignored', () => {
		const s = setup();
		s.session.start();
		vi.advanceTimersByTime(BT_DISCOVERY_TIMEOUT_MS);
		s.emitConnected(device);
		expect(s.onConnected).not.toHaveBeenCalled();
	});

	it('cancel() during discovery ends the chooser quietly', () => {
		const s = setup();
		s.session.start();
		s.session.cancel();
		expect(s.sendSelection).toHaveBeenCalledWith('');
		expect(s.onScanningChange).toHaveBeenLastCalledWith(false);
		expect(s.onError).toHaveBeenLastCalledWith(null);
		vi.runAllTimers();
		expect(s.onError).not.toHaveBeenCalledWith({ code: 'bt-none-found' });
	});

	it('select() when idle does nothing', () => {
		const s = setup();
		s.session.select('dev-1');
		expect(s.sendSelection).not.toHaveBeenCalled();
	});
});
