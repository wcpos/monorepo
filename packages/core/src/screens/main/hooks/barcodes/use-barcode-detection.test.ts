/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useBarcodeDetection } from './use-barcode-detection';

const minChars$ = new BehaviorSubject(8);
const prefix$ = new BehaviorSubject('');
const suffix$ = new BehaviorSubject('');
const avgThreshold$ = new BehaviorSubject(24);

const focusEffectCleanups: (() => void)[] = [];

jest.mock('expo-router', () => ({
	useFocusEffect: (callback: () => void | (() => void)) => {
		const cleanup = callback();
		if (cleanup) {
			focusEffectCleanups.push(cleanup);
		}
	},
}));

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			barcode_scanning_min_chars$: minChars$,
			barcode_scanning_prefix$: prefix$,
			barcode_scanning_suffix$: suffix$,
			barcode_scanning_avg_time_input_threshold$: avgThreshold$,
		},
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
		minChars$.next(8);
		prefix$.next('');
		suffix$.next('');
		avgThreshold$.next(24);
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
});
