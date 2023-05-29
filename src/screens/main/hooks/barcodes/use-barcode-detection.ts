import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { Observable, Subject } from 'rxjs';
import { bufferTime, filter, map } from 'rxjs/operators';

import { useHotkeys, RNKeyboardEvent, getKeyFromEvent } from '@wcpos/hooks/src/use-hotkeys';

import useLocalData from '../../../../contexts/local-data';
import { t } from '../../../../lib/translations';

interface BarcodeDetectionOptions {
	callback?: (barcode: string) => void;
	options?: {
		enabled?: boolean;
		buffer?: number;
		minLength?: number;
		prefix?: string;
		suffix?: string;
	}; // Define the options type as needed
}

type BarcodeDetectionHook = ({ callback, options }: BarcodeDetectionOptions) => {
	// onKeyboardEvent: (event: RNKeyboardEvent) => void;
	barcode$: Observable<string>;
};

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
export const useBarcodeDetection: BarcodeDetectionHook = ({
	callback,
	options = {
		enabled: true,
		buffer: BUFFER,
		minLength: CHARCOUNT,
		prefix: '',
		suffix: '',
	},
} = {}) => {
	const { store } = useLocalData();
	const buffer = useObservableState(store.barcode_scanning_buffer$, store.barcode_scanning_buffer);
	const minLength = useObservableState(
		store.barcode_scanning_min_chars$,
		store.barcode_scanning_min_chars
	);
	const prefix = useObservableState(store.barcode_scanning_prefix$, store.barcode_scanning_prefix);
	const suffix = useObservableState(store.barcode_scanning_suffix$, store.barcode_scanning_suffix);
	const keypress$ = React.useRef(new Subject()).current;

	/**
	 *
	 */
	const onKeyboardEvent = React.useCallback(
		(event: RNKeyboardEvent) => {
			const key = getKeyFromEvent(event);
			keypress$.next(key);
		},
		[keypress$]
	);

	/**
	 *
	 */
	useHotkeys('*', onKeyboardEvent);

	/**
	 *
	 */
	const barcode$ = React.useMemo(() => {
		return keypress$.pipe(
			bufferTime(buffer),
			map((events) => {
				let startIndex = 0;
				let endIndex = events.length;

				if (prefix) {
					const prefixIndex = events.findIndex((key) => key === prefix);
					if (prefixIndex === -1) {
						return [];
					}
					startIndex = prefixIndex + 1;
				}

				if (suffix) {
					const suffixIndex = events.findIndex((key) => key === suffix);
					if (suffixIndex === -1) {
						return [];
					}
					endIndex = suffixIndex;
				}

				return events.slice(startIndex, endIndex);
			}),
			map((events) => events.filter((key) => key !== 'Tab' && key !== 'Enter' && key !== 'Shift')),
			filter((events) => events.length >= minLength),
			map((events) => events.join(''))
		);
	}, [prefix, suffix, keypress$, buffer, minLength]);

	/**
	 * Return observable which emits barcodes.
	 */
	return { barcode$ };
};
