import * as React from 'react';
import { NativeSyntheticEvent, TextInputKeyPressEventData, Platform } from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { useObservableEagerState, useObservableRef } from 'observable-hooks';
import { filter } from 'rxjs/operators';

import { Toast } from '@wcpos/components/src/toast';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

export const useBarcodeDetection = (
	callback = (barcode: string) => {}
	// options = {
	// 	enabled: true,
	// 	// buffer: 500, // removed for now, but perhaps allow setting timeout in the future
	// 	minLength: 8,
	// 	prefix: '',
	// 	suffix: '',
	// }
) => {
	const t = useT();
	const { store } = useAppState();
	const minLength = useObservableEagerState(store.barcode_scanning_min_chars$);
	const prefix = useObservableEagerState(store.barcode_scanning_prefix$);
	const suffix = useObservableEagerState(store.barcode_scanning_suffix$);
	const avgTimeInputThreshold = useObservableEagerState(
		store.barcode_scanning_avg_time_input_threshold$
	);

	// Refs to keep track of mutable state without causing re-renders
	const inputStackRef = React.useRef<string[]>([]);
	const lastInputTimeRef = React.useRef<number | null>(null);
	const avgInputTimeRef = React.useRef<number>(0);
	const detectingScanningRef = React.useRef<boolean>(false);
	const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

	// Subject to emit detected barcodes
	const [barcodeRef, barcode$] = useObservableRef<string>();

	/**
	 * Shared logic for handling key input.
	 */
	const handleKeyInput = React.useCallback(
		(key: string) => {
			// Filter out non-printable keys
			if (key.length !== 1) {
				return;
			}

			const currentInputTime = Date.now();
			let timeBetweenInputs = 0;
			if (lastInputTimeRef.current !== null) {
				timeBetweenInputs = currentInputTime - lastInputTimeRef.current;
			}

			// Update average input time
			if (avgInputTimeRef.current === 0) {
				avgInputTimeRef.current = timeBetweenInputs;
			} else {
				avgInputTimeRef.current = (avgInputTimeRef.current + timeBetweenInputs) / 2;
			}

			if (detectingScanningRef.current || avgInputTimeRef.current < avgTimeInputThreshold) {
				detectingScanningRef.current = true;
				inputStackRef.current.push(key);

				// Clear existing timeout
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}

				// Set timeout to detect end of scanning
				timeoutRef.current = setTimeout(() => {
					if (
						detectingScanningRef.current &&
						Date.now() - (lastInputTimeRef.current || 0) > avgTimeInputThreshold
					) {
						// Stop scanning detection
						detectingScanningRef.current = false;

						// Remove prefix and suffix if necessary
						const inputStack = [...inputStackRef.current];
						if (prefix && inputStack[0] === prefix) {
							inputStack.shift();
						}

						if (suffix && inputStack[inputStack.length - 1] === suffix) {
							inputStack.pop();
						}

						const barcode = inputStack.join('');

						if (barcode.length >= minLength) {
							barcodeRef.current = barcode;
							if (callback) {
								callback(barcode);
							}
						}

						// Reset variables
						inputStackRef.current = [];
						avgInputTimeRef.current = 0;
					}
				}, 150);
			} else {
				// Reset average input time and start a new input stack
				avgInputTimeRef.current = 0;
				inputStackRef.current = [key];
			}

			// Update lastInputTimeRef
			lastInputTimeRef.current = currentInputTime;
		},
		[prefix, suffix, barcodeRef, callback, minLength, avgTimeInputThreshold]
	);

	/**
	 * Event handler for keyup event (Web).
	 */
	const onKeyUp = React.useCallback(
		(e: KeyboardEvent) => {
			handleKeyInput(e.key);
		},
		[handleKeyInput]
	);

	/**
	 * Event handler for React Native's onKeyPress event.
	 */
	const onKeyPress = React.useCallback(
		(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
			handleKeyInput(e.nativeEvent.key);
		},
		[handleKeyInput]
	);

	/**
	 * Add event listeners for web.
	 */
	React.useEffect(() => {
		if (Platform.OS === 'web') {
			document.addEventListener('keyup', onKeyUp);

			return () => {
				document.removeEventListener('keyup', onKeyUp);
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}
			};
		}
	}, [onKeyUp]);

	/**
	 * Disable barcode detection when the screen is not focused.
	 */
	useFocusEffect(() => {
		return () => {
			document.removeEventListener('keyup', onKeyUp);
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	});

	/**
	 * Return an observable that emits detected barcodes and the onKeyPress handler for React Native.
	 */
	return {
		barcode$: barcode$.pipe(
			filter((barcode) => {
				if (typeof barcode === 'string') {
					if (barcode.length >= minLength) {
						return true;
					}
					Toast.show({
						type: 'error',
						text1: t('Barcode scanned: {barcode}', { barcode, _tags: 'core' }),
						text2: t('Barcode must be at least {minLength} characters long', {
							minLength,
							_tags: 'core',
						}),
					});
				}
				return false;
			})
		),
	};
};
