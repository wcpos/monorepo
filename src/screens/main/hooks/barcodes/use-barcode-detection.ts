import * as React from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

import { useHotkeys } from 'react-hotkeys-hook';
import { Observable, Subject } from 'rxjs';

import useSnackbar from '@wcpos/components/src/snackbar';

import { t } from '../../../../lib/translations';

type BarcodeDetectionHook = {
	onKeyboardEvent: (
		event: KeyboardEvent | NativeSyntheticEvent<TextInputKeyPressEventData>
	) => void;
	barcode$: Observable<string>;
};

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
export const useBarcodeDetection = ({
	callback,
	options = {
		enabled: false,
	},
}: {
	callback?: (barcode: string) => void;
	options?: {
		enabled?: boolean;
	}; // Define the options type as needed
}): BarcodeDetectionHook => {
	const barcode = React.useRef<string>('');
	const timer = React.useRef<NodeJS.Timeout | null>(null);
	const addSnackbar = useSnackbar();

	/**
	 * onKeyboardEvent is a custom event handler function that processes keyboard events and native synthetic events
	 * to detect alphanumeric barcode inputs. It listens for alphanumeric characters and builds a barcode string.
	 * If a TAB keypress is detected at the end of a barcode, it prevents the default behavior for keyboard events
	 * and stops propagation for native synthetic events. When a barcode meets the minimum length specified by CHARCOUNT,
	 * the callback function is called with the detected barcode, and the barcode is emitted to the barcode$ observable.
	 *
	 * @param event - The keyboard event or native synthetic event.
	 */
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
						addSnackbar({
							message: t('Barcode scanned: {barcode}', {
								_tags: 'core',
								barcode: barcode.current,
							}),
						});
						barcode.current = '';
					}
				}, TIMEOUT);
			} else if (key === 'Tab' && barcode.current.length >= CHARCOUNT) {
				// Prevent default behavior if the key is a TAB character at the end of a barcode
				if (event instanceof KeyboardEvent) {
					event.preventDefault();
				} else if ('nativeEvent' in event && 'key' in event.nativeEvent) {
					event.stopPropagation();
				}
			}
		},
		[addSnackbar, callback]
	);

	useHotkeys('*', onKeyboardEvent, { enabled: options.enabled });

	return {
		onKeyboardEvent,
		barcode$: barcodeSubject.asObservable(),
	};
};
