/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import type { ScanEvent } from '@wcpos/scanner';

import { resetHeuristicTooShortRateLimit } from './too-short-feedback';
import { useBarcodeDetection } from './use-barcode-detection';

const minChars$ = new BehaviorSubject(8);
const prefix$ = new BehaviorSubject('');
const suffix$ = new BehaviorSubject('');
const avgThreshold$ = new BehaviorSubject(24);

const focusEffectCleanups: (() => void)[] = [];
const mockToastShow = jest.fn();
const mockMarkUserActivity = jest.fn();
const attributedEvents$ = new Subject<ScanEvent>();
const cameraEvents$ = new Subject<ScanEvent>();
const deviceEvents$ = new Subject<ScanEvent>();
const mockUseAttributedWedge = jest.fn((_enabled?: boolean) => ({
	scanEvents$: attributedEvents$,
	available: true,
	profiles: [],
}));
let mockIsFocused = true;

// Pass-through mock: the focus gate must use the layout-effect variant so a
// blur reaches the gate in the same commit (see the layout-phase test below).
jest.mock('observable-hooks', () => {
	const actual = jest.requireActual('observable-hooks');
	return {
		...actual,
		useLayoutObservable: jest.fn(actual.useLayoutObservable),
	};
});
jest.mock('expo-router', () => ({
	useFocusEffect: (callback: () => void | (() => void)) => {
		const cleanup = callback();
		if (cleanup) {
			focusEffectCleanups.push(cleanup);
		}
	},
}));
jest.mock('expo-router/react-navigation', () => ({
	useIsFocused: () => mockIsFocused,
}));
jest.mock('./use-attributed-wedge', () => ({
	useAttributedWedge: (enabled?: boolean) => mockUseAttributedWedge(enabled),
}));
jest.mock('./camera-scan-context', () => ({
	useCameraScanBus: () => ({ events$: cameraEvents$, emit: jest.fn() }),
}));
jest.mock('./device-scan-context', () => ({
	useDeviceScanBus: () => ({ events$: deviceEvents$ }),
}));

// Stable storeDB stub: the attributed-wedge source (merged into scanEvents$)
// reads scanner_profiles through useCollection.
const mockScannerProfiles = { find: () => ({ $: new BehaviorSubject([]) }) };
const mockStoreDB = {
	reset$: new Subject(),
	collections: { scanner_profiles: mockScannerProfiles },
};

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			barcode_scanning_min_chars$: minChars$,
			barcode_scanning_prefix$: prefix$,
			barcode_scanning_suffix$: suffix$,
			barcode_scanning_avg_time_input_threshold$: avgThreshold$,
		},
		storeDB: mockStoreDB,
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, values?: Record<string, unknown>) =>
		key === 'common.barcode_must_be_at_least_characters'
			? `Barcode must be at least ${values?.minLength} characters long`
			: key,
}));

jest.mock('@wcpos/utils/logger', () => {
	const barcodeLogger = { warn: jest.fn() };

	return {
		getLogger: () => barcodeLogger,
		__barcodeLogger: barcodeLogger,
	};
});

jest.mock('@wcpos/components/toast', () => ({
	// Lazy closure: the hoisted factory must not evaluate mockToastShow before init.
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));
jest.mock('@wcpos/utils/user-activity', () => ({
	markUserActivity: (...args: unknown[]) => mockMarkUserActivity(...args),
}));

const barcodeLogger = jest.requireMock('@wcpos/utils/logger').__barcodeLogger as {
	warn: jest.Mock;
};

const dispatchBarcode = (barcode: string) => {
	for (const key of barcode) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key }));
	}
};

describe('useBarcodeDetection', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		resetHeuristicTooShortRateLimit();
		minChars$.next(8);
		prefix$.next('');
		suffix$.next('');
		avgThreshold$.next(24);
		mockIsFocused = true;
	});

	afterEach(() => {
		jest.runOnlyPendingTimers();
		for (const cleanup of focusEffectCleanups.splice(0)) {
			cleanup();
		}
		jest.useRealTimers();
	});

	it('does not treat human-speed typing after mount as a barcode scan', () => {
		const detected: string[] = [];
		const { result } = renderHook(() => useBarcodeDetection());
		const subscription = result.current.barcode$.subscribe((barcode) =>
			detected.push(String(barcode))
		);

		act(() => {
			// 120ms between keys — human typing, well above the 24ms scanner threshold
			for (const key of 'dfgh') {
				document.dispatchEvent(new KeyboardEvent('keydown', { key }));
				jest.advanceTimersByTime(120);
			}
			jest.advanceTimersByTime(200);
		});

		expect(barcodeLogger.warn).not.toHaveBeenCalled();
		expect(detected).toEqual([]);

		subscription.unsubscribe();
	});

	it('does not emit the first keystroke after mount as a pseudo-scan', () => {
		const detected: string[] = [];
		const { result } = renderHook(() => useBarcodeDetection());
		const subscription = result.current.barcode$.subscribe((barcode) =>
			detected.push(String(barcode))
		);

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
			jest.advanceTimersByTime(500);
		});

		expect(barcodeLogger.warn).not.toHaveBeenCalled();
		expect(detected).toEqual([]);

		subscription.unsubscribe();
	});

	it('does not treat human-speed typing as a scan when earlier keystrokes exist', () => {
		const detected: string[] = [];
		const { result } = renderHook(() => useBarcodeDetection());
		const subscription = result.current.barcode$.subscribe((barcode) =>
			detected.push(String(barcode))
		);

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
			jest.advanceTimersByTime(500);
			for (const key of 'dfgh') {
				document.dispatchEvent(new KeyboardEvent('keydown', { key }));
				jest.advanceTimersByTime(120);
			}
			jest.advanceTimersByTime(200);
		});

		expect(barcodeLogger.warn).not.toHaveBeenCalled();
		expect(detected).toEqual([]);

		subscription.unsubscribe();
	});

	it('still detects a scanner burst immediately after mount, including the first character', () => {
		const detected: string[] = [];
		const { result } = renderHook(() => useBarcodeDetection());
		const subscription = result.current.barcode$.subscribe((barcode) =>
			detected.push(String(barcode))
		);

		act(() => {
			// scanner-speed input: 10ms between keys, below the 24ms threshold
			for (const key of '12345678') {
				document.dispatchEvent(new KeyboardEvent('keydown', { key }));
				jest.advanceTimersByTime(10);
			}
			jest.advanceTimersByTime(200);
		});

		expect(detected).toEqual(['12345678']);
		expect(barcodeLogger.warn).not.toHaveBeenCalled();

		subscription.unsubscribe();
	});

	it('uses the updated minimum length when scanner settings change after mount', () => {
		const detected: string[] = [];
		const { result } = renderHook(() => useBarcodeDetection());
		const subscription = result.current.barcode$.subscribe((barcode) =>
			detected.push(String(barcode))
		);

		act(() => {
			minChars$.next(4);
		});

		act(() => {
			dispatchBarcode('1234');
			jest.advanceTimersByTime(151);
		});

		expect(detected).toEqual(['1234']);
		expect(barcodeLogger.warn).not.toHaveBeenCalled();

		subscription.unsubscribe();
	});

	it('uses the latest minimum length when scanner settings change during scan timeout', () => {
		const detected: string[] = [];
		const callback = jest.fn();
		const { result } = renderHook(() => useBarcodeDetection(callback));
		const subscription = result.current.barcode$.subscribe((barcode) =>
			detected.push(String(barcode))
		);

		act(() => {
			dispatchBarcode('1234');
			jest.advanceTimersByTime(50);
			minChars$.next(4);
			jest.advanceTimersByTime(101);
		});

		expect(detected).toEqual(['1234']);
		expect(callback).toHaveBeenCalledWith('1234');
		expect(barcodeLogger.warn).not.toHaveBeenCalled();

		subscription.unsubscribe();
	});

	it('shows a warning toast and logs a short scan-shaped burst (all digits)', () => {
		const detected: string[] = [];
		const { result } = renderHook(() => useBarcodeDetection());
		const subscription = result.current.barcode$.subscribe((barcode) =>
			detected.push(String(barcode))
		);

		act(() => {
			dispatchBarcode('1234');
			jest.advanceTimersByTime(151);
		});

		expect(detected).toEqual([]);
		expect(mockToastShow).toHaveBeenCalledWith({
			type: 'warning',
			title: 'common.barcode_scanned',
			description: 'Barcode must be at least 8 characters long',
			duration: 6000,
		});
		expect(barcodeLogger.warn).toHaveBeenCalledWith(
			'Fast keystroke burst was shorter than the minimum length',
			expect.not.objectContaining({ showToast: expect.anything(), toast: expect.anything() })
		);

		subscription.unsubscribe();
	});

	it('suppresses the toast for a short typing-shaped burst (letters, no terminator)', () => {
		const detected: string[] = [];
		const { result } = renderHook(() => useBarcodeDetection());
		const subscription = result.current.barcode$.subscribe((barcode) =>
			detected.push(String(barcode))
		);

		act(() => {
			dispatchBarcode('sdafs');
			jest.advanceTimersByTime(151);
		});

		// Still rejected as too short — but a fast typist isn't scolded with a
		// toast; the rejection is only logged (and visible in the test panel).
		expect(detected).toEqual([]);
		expect(mockToastShow).not.toHaveBeenCalled();
		expect(barcodeLogger.warn).toHaveBeenCalledWith(
			'Fast keystroke burst was shorter than the minimum length',
			expect.objectContaining({
				context: expect.objectContaining({ terminated: false, toastShown: false }),
			})
		);

		subscription.unsubscribe();
	});

	it('bridges attributed scans to barcode$ without duplicating scanEvents$', () => {
		const barcodes: string[] = [];
		const events: ScanEvent[] = [];
		const { result } = renderHook(() => useBarcodeDetection());
		const barcodeSubscription = result.current.barcode$.subscribe((code) => barcodes.push(code));
		const eventSubscription = result.current.scanEvents$.subscribe((event) => events.push(event));
		const attributedEvent: ScanEvent = {
			code: '9310988001234',
			source: { kind: 'wedge-attributed', profileId: 'profile-1' },
			timestamp: 123,
		};

		act(() => attributedEvents$.next(attributedEvent));

		expect(barcodes).toEqual(['9310988001234']);
		expect(events).toEqual([attributedEvent]);
		barcodeSubscription.unsubscribe();
		eventSubscription.unsubscribe();
	});

	it('marks native wedge scans as user activity after they pass the scan gate', () => {
		const { result } = renderHook(() => useBarcodeDetection());
		const subscription = result.current.scanEvents$.subscribe();

		act(() => {
			for (const key of '12345678') {
				result.current.onKeyPress({
					nativeEvent: { key },
				} as Parameters<typeof result.current.onKeyPress>[0]);
				jest.advanceTimersByTime(10);
			}
			jest.advanceTimersByTime(200);
		});

		expect(mockMarkUserActivity).toHaveBeenCalledTimes(1);
		subscription.unsubscribe();
	});

	it('marks attributed, camera, serial, and HID scans as user activity', () => {
		const { result } = renderHook(() => useBarcodeDetection());
		const subscription = result.current.scanEvents$.subscribe();
		const events: ScanEvent[] = [
			{
				code: 'attributed',
				source: { kind: 'wedge-attributed', profileId: 'profile-1' },
				timestamp: 1,
			},
			{ code: 'camera', source: { kind: 'camera' }, timestamp: 2 },
			{ code: 'serial', source: { kind: 'serial' }, timestamp: 3 },
			{ code: 'hid', source: { kind: 'hid-pos' }, timestamp: 4 },
		];

		act(() => {
			attributedEvents$.next(events[0]!);
			cameraEvents$.next(events[1]!);
			deviceEvents$.next(events[2]!);
			deviceEvents$.next(events[3]!);
		});

		expect(mockMarkUserActivity).toHaveBeenCalledTimes(4);
		subscription.unsubscribe();
	});

	it('drops device scans while blurred and resumes them when focused', () => {
		const barcodes: string[] = [];
		const events: ScanEvent[] = [];
		const { result, rerender } = renderHook(() => useBarcodeDetection());
		const barcodeSubscription = result.current.barcode$.subscribe((code) => barcodes.push(code));
		const eventSubscription = result.current.scanEvents$.subscribe((event) => events.push(event));
		const deviceEvent: ScanEvent = {
			code: '9310988001234',
			source: { kind: 'serial' },
			timestamp: 123,
		};

		mockIsFocused = false;
		rerender();
		act(() => deviceEvents$.next(deviceEvent));

		expect(barcodes).toEqual([]);
		expect(events).toEqual([]);
		expect(mockMarkUserActivity).not.toHaveBeenCalled();

		mockIsFocused = true;
		rerender();
		act(() => deviceEvents$.next(deviceEvent));

		expect(barcodes).toEqual(['9310988001234']);
		expect(events).toEqual([deviceEvent]);
		expect(mockMarkUserActivity).toHaveBeenCalledTimes(1);
		barcodeSubscription.unsubscribe();
		eventSubscription.unsubscribe();
	});

	it('propagates focus to the gate in the layout phase, not a passive effect', () => {
		// The race this pins (a device event delivered after a blur commit but
		// before passive effects flush) cannot be opened black-box on React 19:
		// a rerender nested in act() defers the commit itself, and flushSync
		// drains the new passive effects before returning, inside and outside
		// act. So the pin is the mechanism: the focus stream must be built on
		// the layout-effect observable variant.
		const { useLayoutObservable } = jest.requireMock('observable-hooks');
		(useLayoutObservable as jest.Mock).mockClear();
		renderHook(() => useBarcodeDetection());
		expect(useLayoutObservable).toHaveBeenCalled();
	});

	it('disables attributed capture when the screen loses focus', () => {
		const { rerender } = renderHook(() => useBarcodeDetection());
		expect(mockUseAttributedWedge).toHaveBeenLastCalledWith(true);

		mockIsFocused = false;
		rerender();

		expect(mockUseAttributedWedge).toHaveBeenLastCalledWith(false);
	});
});
