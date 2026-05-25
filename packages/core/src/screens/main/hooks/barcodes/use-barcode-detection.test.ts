/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';

import { useBarcodeDetection } from './use-barcode-detection';

const minChars$ = new BehaviorSubject(8);
const prefix$ = new BehaviorSubject('');
const suffix$ = new BehaviorSubject('');
const avgThreshold$ = new BehaviorSubject(24);

jest.mock('expo-router', () => ({
	useFocusEffect: (callback: () => void | (() => void)) => {
		React.useEffect(() => callback(), [callback]);
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
		jest.useRealTimers();
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
		expect(getLogger(['wcpos', 'barcode', 'detection']).warn).not.toHaveBeenCalled();

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
		expect(getLogger(['wcpos', 'barcode', 'detection']).warn).not.toHaveBeenCalled();

		subscription.unsubscribe();
	});
});
