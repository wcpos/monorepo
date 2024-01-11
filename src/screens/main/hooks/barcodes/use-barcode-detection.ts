import * as React from 'react';

import { useFocusEffect } from '@react-navigation/native';
import { useObservableState, useObservableCallback } from 'observable-hooks';
import { bufferTime, filter, map } from 'rxjs/operators';

import { useHotkeys, RNKeyboardEvent, getKeyFromEvent } from '@wcpos/hooks/src/use-hotkeys';

import { useAppState } from '../../../../contexts/app-state';

// Constants
const BUFFER = 500;
const CHARCOUNT = 8;

/**
 * Custom hook for detecting barcode input.
 *
 * @param callback - Optional callback function that will be called with the detected barcode.
 * @returns {object} - An object containing the `onKeyboardEvent` function to be used as an event handler,
 * and the `barcode$` observable that emits detected barcodes.
 */
export const useBarcodeDetection = (
	callback = () => {},
	options = {
		enabled: true,
		buffer: BUFFER,
		minLength: CHARCOUNT,
		prefix: '',
		suffix: '',
	}
) => {
	const { store } = useAppState();
	const buffer = useObservableState(store.barcode_scanning_buffer$, store.barcode_scanning_buffer);
	const minLength = useObservableState(
		store.barcode_scanning_min_chars$,
		store.barcode_scanning_min_chars
	);
	const prefix = useObservableState(store.barcode_scanning_prefix$, store.barcode_scanning_prefix);
	const suffix = useObservableState(store.barcode_scanning_suffix$, store.barcode_scanning_suffix);
	const [enabled, setEnabled] = React.useState(true);

	/**
	 *
	 */
	const [onKeyboardEvent, barcode$] = useObservableCallback((event$) =>
		event$.pipe(
			bufferTime(buffer),
			map((events) => {
				// map to key names, remove tab, enter and shift
				const keys = events
					.map((event) => getKeyFromEvent(event))
					.filter((key) => key !== 'Tab' && key !== 'Enter' && key !== 'Shift');
				return keys.join('');
			}),
			map((string) => {
				// remove prefix and suffix
				if (string.startsWith(prefix)) {
					string = string.slice(prefix.length);
				}
				if (string.endsWith(suffix)) {
					string = string.slice(0, -suffix.length);
				}
				return string;
			}),
			filter((barcode) => barcode.length >= minLength)
		)
	);

	/**
	 *
	 */
	useHotkeys('*', onKeyboardEvent, { enabled });

	/**
	 * Disable hotkeys when not on page.
	 */
	useFocusEffect(
		React.useCallback(() => {
			setEnabled(true);
			return () => {
				setEnabled(false);
			};
		}, [])
	);

	/**
	 * Return observable which emits barcodes.
	 */
	return { barcode$ };
};
