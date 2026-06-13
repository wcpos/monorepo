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

	/**
	 * setup() captures every `startChooser` invocation's handler in `handlers[]` so
	 * tests can fire a specific session's onConnected independently (e.g. to verify
	 * that a stale closure from session 1 is ignored after session 2 has started).
	 *
	 * `emitConnected(d, index?)` fires the handler at `handlers[index ?? last]`.
	 */
	function setup(overrides?: { discoveryTimeoutMs?: number; connectTimeoutMs?: number }) {
		const sendSelection = vi.fn();
		const handlers: ((d: PosConnectedDevice) => void)[] = [];
		const startChooser = vi.fn((onConnected: (d: PosConnectedDevice) => void) => {
			handlers.push(onConnected);
		});
		const onScanningChange = vi.fn();
		const onError = vi.fn();
		const onConnected = vi.fn();
		const session = createBluetoothScanSession(
			{ sendSelection, startChooser, ...overrides },
			{ onScanningChange, onError, onConnected }
		);
		return {
			session,
			sendSelection,
			startChooser,
			onScanningChange,
			onError,
			onConnected,
			handlers,
			/** Fire the most-recently captured handler (or handlers[index] if given). */
			emitConnected: (d: PosConnectedDevice, index?: number) => {
				const h = handlers[index ?? handlers.length - 1];
				h?.(d);
			},
		};
	}

	// ── existing tests (8) ──────────────────────────────────────────────────────

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

	it('a synchronous startChooser throw ends the session with discovery-failed', () => {
		const sendSelection = vi.fn();
		const onScanningChange = vi.fn();
		const onError = vi.fn();
		const onConnected = vi.fn();
		const session = createBluetoothScanSession(
			{
				sendSelection,
				startChooser: () => {
					throw new Error('Web Bluetooth is not available');
				},
			},
			{ onScanningChange, onError, onConnected }
		);
		session.start();
		expect(onScanningChange).toHaveBeenLastCalledWith(false);
		expect(onError).toHaveBeenLastCalledWith({
			code: 'discovery-failed',
			detail: 'Web Bluetooth is not available',
		});
		expect(session.isActive()).toBe(false);
		// No discovery timer was armed — advancing time must not produce bt-none-found.
		vi.advanceTimersByTime(BT_DISCOVERY_TIMEOUT_MS);
		expect(onError).not.toHaveBeenCalledWith({ code: 'bt-none-found' });
		// The machine is reusable after the failure.
		session.start();
		expect(session.isActive()).toBe(false); // throws again, ends again
	});

	it('select() when idle does nothing', () => {
		const s = setup();
		s.session.select('dev-1');
		expect(s.sendSelection).not.toHaveBeenCalled();
	});

	// ── new tests (Fix 4) ───────────────────────────────────────────────────────

	it('Fix4-1: custom timeout overrides are honored', () => {
		const s = setup({ discoveryTimeoutMs: 500, connectTimeoutMs: 1000 });
		s.session.start();

		// Default timeout would be 20 s — should not fire yet at 499 ms.
		vi.advanceTimersByTime(499);
		expect(s.onError).not.toHaveBeenCalledWith({ code: 'bt-none-found' });

		// Custom 500 ms discovery timeout fires.
		vi.advanceTimersByTime(1);
		expect(s.onError).toHaveBeenLastCalledWith({ code: 'bt-none-found' });
		expect(s.session.isActive()).toBe(false);

		// Restart and verify the connect timeout override.
		s.session.start();
		s.session.select('dev-1');

		vi.advanceTimersByTime(999);
		expect(s.onError).not.toHaveBeenCalledWith({ code: 'bt-connect-failed' });

		vi.advanceTimersByTime(1);
		expect(s.onError).toHaveBeenLastCalledWith({ code: 'bt-connect-failed' });
	});

	it('Fix4-2: cancel() during connecting sends exactly one sendSelection (the select)', () => {
		const s = setup();
		s.session.start();
		s.session.select('dev-1');
		// sendSelection called once so far with the device id
		expect(s.sendSelection).toHaveBeenCalledTimes(1);
		expect(s.sendSelection).toHaveBeenCalledWith('dev-1');

		s.session.cancel();
		// cancel() during 'connecting' must NOT send a second sendSelection('')
		expect(s.sendSelection).toHaveBeenCalledTimes(1);
	});

	it('Fix4-3a: restart after discovery timeout — new session has its own full interval', () => {
		const s = setup({ discoveryTimeoutMs: 1000 });
		// First session — times out.
		s.session.start();
		vi.advanceTimersByTime(1000);
		expect(s.onError).toHaveBeenLastCalledWith({ code: 'bt-none-found' });
		expect(s.session.isActive()).toBe(false);

		// Second session — starts fresh; should not fire before its own full interval.
		s.session.start();
		expect(s.session.isActive()).toBe(true);

		vi.advanceTimersByTime(999);
		expect(s.session.isActive()).toBe(true);

		vi.advanceTimersByTime(1);
		expect(s.onError).toHaveBeenLastCalledWith({ code: 'bt-none-found' });
		expect(s.session.isActive()).toBe(false);
	});

	it('Fix4-3b: restart after sync-connected completion — no stale timer kills new session', () => {
		// startChooser variant that immediately invokes the callback (sync connect).
		const sendSelection = vi.fn();
		const onScanningChange = vi.fn();
		const onError = vi.fn();
		const onConnected = vi.fn();
		let callCount = 0;
		const startChooser = vi.fn((cb: (d: PosConnectedDevice) => void) => {
			callCount++;
			if (callCount === 1) {
				// First call: fire synchronously to complete session 1 immediately.
				cb(device);
			}
			// Second call: do nothing — simulate a fresh chooser waiting.
		});
		const session = createBluetoothScanSession(
			{ sendSelection, startChooser, discoveryTimeoutMs: 1000 },
			{ onScanningChange, onError, onConnected }
		);

		// Session 1: sync connect — should complete without arming a discovery timer.
		session.start();
		expect(onConnected).toHaveBeenCalledTimes(1);
		expect(session.isActive()).toBe(false);

		// Session 2: start after sync-completed session 1.
		session.start();
		expect(session.isActive()).toBe(true);

		// Advance less than the full discovery interval — must still be active.
		vi.advanceTimersByTime(999);
		expect(session.isActive()).toBe(true);
		expect(onError).not.toHaveBeenCalledWith({ code: 'bt-none-found' });

		// Full interval for session 2 — times out normally.
		vi.advanceTimersByTime(1);
		expect(onError).toHaveBeenLastCalledWith({ code: 'bt-none-found' });
		expect(session.isActive()).toBe(false);
	});

	it('Fix4-4: emitConnected during discovering accepts device and dismisses chooser', () => {
		const s = setup();
		s.session.start();
		// No select() — e.g. auto-reconnect path.
		s.emitConnected(device);

		// Connection accepted.
		expect(s.onConnected).toHaveBeenCalledWith(device);
		expect(s.onScanningChange).toHaveBeenLastCalledWith(false);
		expect(s.session.isActive()).toBe(false);

		// sendSelection('') must have been sent to dismiss the still-pending chooser.
		expect(s.sendSelection).toHaveBeenCalledWith('');

		// No spurious errors.
		vi.runAllTimers();
		expect(s.onError).not.toHaveBeenCalledWith({ code: 'bt-none-found' });
		expect(s.onError).not.toHaveBeenCalledWith({ code: 'bt-connect-failed' });
	});

	it('Fix4-5: stale onConnected closure from session 1 is ignored after session 2 starts', () => {
		const s = setup();

		// Session 1: start, select, then cancel (simulating a session that cannot be aborted).
		s.session.start();
		s.session.select('dev-1');
		s.session.cancel(); // ends session 1; phase → idle
		// handlers[0] is session 1's onConnected closure.

		// Session 2: start fresh.
		s.session.start();
		expect(s.session.isActive()).toBe(true);
		expect(s.startChooser).toHaveBeenCalledTimes(2);

		// Fire session 1's stale closure.
		s.emitConnected(device, 0);

		// Must be ignored — session 2 is still active, onConnected callback not triggered.
		expect(s.onConnected).not.toHaveBeenCalled();
		expect(s.session.isActive()).toBe(true);
	});

	it('Fix4-6: reentrancy — onError restart leaves a clean machine', () => {
		const sendSelection = vi.fn();
		const onScanningChange = vi.fn();
		const onError = vi.fn();
		const onConnected = vi.fn();
		const handlers: ((d: PosConnectedDevice) => void)[] = [];
		const startChooser = vi.fn((cb: (d: PosConnectedDevice) => void) => {
			handlers.push(cb);
		});

		// Only restart once (on the first bt-none-found) to avoid infinite restarts in test.
		let restarted = false;
		const session = createBluetoothScanSession(
			{ sendSelection, startChooser, discoveryTimeoutMs: 500 },
			{
				onScanningChange,
				onError: (err) => {
					onError(err);
					// Reentrant restart on error — but only once.
					if (err?.code === 'bt-none-found' && !restarted) {
						restarted = true;
						session.start();
					}
				},
				onConnected,
			}
		);

		// Session 1 starts; times out → onError fires → session.start() called inside handler.
		session.start();
		vi.advanceTimersByTime(500);

		// startChooser must have been called twice: once for session 1, once for the restart.
		expect(startChooser).toHaveBeenCalledTimes(2);
		// The restarted session is active.
		expect(session.isActive()).toBe(true);

		// No stale timer should prematurely end session 2 before its own interval.
		vi.advanceTimersByTime(499);
		expect(session.isActive()).toBe(true);

		vi.advanceTimersByTime(1);
		// Session 2's own discovery timeout fires.
		expect(session.isActive()).toBe(false);
	});
});
