import * as React from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

import { useHotkeys } from 'react-hotkeys-hook';
import { Subject } from 'rxjs';

// Constants
const TIMEOUT = 50;
const CHARCOUNT = 8;
const barcodeSubject = new Subject<string>();

/**
 * Checks if a string is alphanumeric.
 *
 * @param str - The string to test.
 * @returns {boolean} - True if the string is alphanumeric, false otherwise.
 */
export function isAlphaNumeric(str: string): boolean {
	const regex = new RegExp(`^[a-zA-Z0-9]$`);
	return regex.test(str);
}

/**
 * Extracts the key from a keyboard event or a native synthetic event.
 *
 * @param event - The keyboard event or native synthetic event.
 * @returns {string | null} - The key if it exists in the event, null otherwise.
 */
function getKeyFromEvent(
	event: KeyboardEvent | NativeSyntheticEvent<TextInputKeyPressEventData>
): string | null {
	if (event instanceof KeyboardEvent) {
		return event.key;
	} else if ('nativeEvent' in event && 'key' in event.nativeEvent) {
		return event.nativeEvent.key;
	}

	return null;
}

/**
 * Custom hook for detecting barcode input.
 *
 * @param callback - Optional callback function that will be called with the detected barcode.
 * @returns {object} - An object containing the `onKeyboardEvent` function to be used as an event handler,
 * and the `barcode$` observable that emits detected barcodes.
 */
export const useBarcodeDetection = (
	callback?: (barcode: string) => void
): {
	onKeyboardEvent: (
		event: KeyboardEvent | NativeSyntheticEvent<TextInputKeyPressEventData>
	) => void;
	barcode$: ReturnType<typeof barcodeSubject.asObservable>;
} => {
	const barcode = React.useRef<string>('');
	const timer = React.useRef<NodeJS.Timeout | null>(null);

	const onKeyboardEvent = React.useCallback(
		(event: KeyboardEvent | NativeSyntheticEvent<TextInputKeyPressEventData>) => {
			const key = getKeyFromEvent(event);
			if (key && isAlphaNumeric(key)) {
				barcode.current = barcode.current + key;

				if (timer.current) {
					clearTimeout(timer.current);
				}

				timer.current = setTimeout(() => {
					if (barcode.current.length >= CHARCOUNT) {
						callback && callback(barcode.current);
						barcodeSubject.next(barcode.current);
						barcode.current = '';
					}
				}, TIMEOUT);
			}
		},
		[callback]
	);

	useHotkeys('*', onKeyboardEvent);

	return {
		onKeyboardEvent,
		barcode$: barcodeSubject.asObservable(),
	};
};
