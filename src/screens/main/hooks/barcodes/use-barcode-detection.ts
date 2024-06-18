import * as React from 'react';

import { useFocusEffect } from '@react-navigation/native';
import { useObservableEagerState, useObservableCallback } from 'observable-hooks';
import { bufferTime, filter, map } from 'rxjs/operators';

import { useHotkeys, RNKeyboardEvent, getKeyFromEvent } from '@wcpos/hooks/src/use-hotkeys';

import { useAppState } from '../../../../contexts/app-state';

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
		buffer: 500,
		minLength: 8,
		prefix: '',
		suffix: '',
	}
) => {
	const { store } = useAppState();
	const buffer = useObservableEagerState(store.barcode_scanning_buffer$);
	const minLength = useObservableEagerState(store.barcode_scanning_min_chars$);
	const prefix = useObservableEagerState(store.barcode_scanning_prefix$);
	const suffix = useObservableEagerState(store.barcode_scanning_suffix$);
	const [enabled, setEnabled] = React.useState(true);

	/**
	 *
	 */
	const [onKeyboardEvent, barcode$] = useObservableCallback((event$) =>
		event$.pipe(
			bufferTime(buffer),
			map((events) => {
				// Filter keys based on the regex
				const keys = events
					.map((event) => getKeyFromEvent(event))
					.filter((key) => key.length === 1);
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
