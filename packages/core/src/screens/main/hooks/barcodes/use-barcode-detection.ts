import * as React from 'react';
import { NativeSyntheticEvent, Platform, TextInputKeyPressEventData } from 'react-native';

import { useFocusEffect } from 'expo-router';
import { useObservableCallback, useObservableEagerState } from 'observable-hooks';
import { merge } from 'rxjs';
import { filter, map, tap, withLatestFrom } from 'rxjs/operators';

import { createWedgeDetector, type ScanEvent, type WedgeDetector } from '@wcpos/scanner';

import { showTooShortFeedback } from './too-short-feedback';
import { useAttributedWedge } from './use-attributed-wedge';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

// Runs at scan time (not render): wraps a detected code in the normalized event.
function toWedgeScanEvent(code: unknown): ScanEvent {
	return { code: String(code), source: { kind: 'wedge' }, timestamp: Date.now() };
}

type BarcodeScanEvent = {
	barcode: string;
	callback: (barcode: string) => void;
};

/**
 * The wedge (HID keyboard mode) input source. Keystroke timing/latching lives
 * in `@wcpos/scanner`'s wedge detector — the same implementation the settings
 * test panel replays — this hook only wires it to the platform (document
 * keydown on web, TextInput onKeyPress on native) and to the app pipeline
 * (min-length gate → `barcode$` / `scanEvents$`).
 */
export const useBarcodeDetection = (callback = (barcode: string) => {}) => {
	const t = useT();
	const { store } = useAppState();
	const prefix = useObservableEagerState(store.barcode_scanning_prefix$) as string;
	const suffix = useObservableEagerState(store.barcode_scanning_suffix$) as string;
	const avgTimeInputThreshold = useObservableEagerState(
		store.barcode_scanning_avg_time_input_threshold$
	) as number;

	// Subject to emit detected barcodes
	const [onBarcodeScan, barcode$] = useObservableCallback<
		string,
		BarcodeScanEvent,
		[string, (barcode: string) => void]
	>(
		(event$) =>
			event$.pipe(
				withLatestFrom(store.barcode_scanning_min_chars$),
				filter(([event, currentMinLength]) => {
					const currentMinLengthNumber = Number(currentMinLength);
					if (event.barcode.length >= currentMinLengthNumber) {
						return true;
					}
					showTooShortFeedback(t, event.barcode, currentMinLengthNumber);
					return false;
				}),
				tap(([event]) => {
					event.callback(event.barcode);
				}),
				map(([event]) => event.barcode)
			),
		([barcode, eventCallback]) => ({ barcode, callback: eventCallback })
	);

	// Live values behind stable refs so the long-lived detector always reads the
	// latest settings and emitter without being recreated per render. Refs may
	// not be written during render, so a sync effect keeps them fresh.
	const settingsRef = React.useRef({ threshold: avgTimeInputThreshold, prefix, suffix });
	const emitRef = React.useRef<(code: string) => void>(() => {});
	// Ref-sync effect: mirrors the latest reactive values for event-time reads.
	React.useEffect(() => {
		settingsRef.current = { threshold: avgTimeInputThreshold, prefix, suffix };
	}, [avgTimeInputThreshold, prefix, suffix]);
	React.useEffect(() => {
		emitRef.current = (code: string) => onBarcodeScan(code, callback);
	}, [onBarcodeScan, callback]);

	const detectorRef = React.useRef<WedgeDetector | null>(null);

	/**
	 * Shared logic for handling key input. The detector is created lazily at
	 * event time (render must not touch refs or call impure factories).
	 */
	const handleKeyInput = React.useCallback((key: string) => {
		if (detectorRef.current === null) {
			detectorRef.current = createWedgeDetector({
				getSettings: () => settingsRef.current,
				onScan: (code) => emitRef.current(code),
			});
		}
		detectorRef.current.handleKey(key);
	}, []);

	/**
	 * Event handler for keyup event (Web).
	 */
	const onKeyUp = React.useCallback(
		(e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const ignoreInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
			if (!ignoreInput) {
				handleKeyInput(e.key);
			}
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
	 * Enable/Disable barcode detection when the screen is not focused.
	 *
	 * A user was experiencing an issue where keyup events were only giving the lowercase, even
	 * though the barcode was uppercase. They recommend to not use keydown events, but it should
	 * still work on almost all browsers.
	 */
	useFocusEffect(
		React.useCallback(() => {
			if (Platform.OS === 'web') {
				// reverted to keydown, because keyup was only giving lowercase
				document.addEventListener('keydown', onKeyUp);

				return () => {
					document.removeEventListener('keydown', onKeyUp);
					// Drop the detector with its latched state: a partial burst must not
					// survive refocus and corrupt the next scan. A fresh detector is
					// created lazily on the next keystroke.
					detectorRef.current?.dispose();
					detectorRef.current = null;
				};
			}
		}, [onKeyUp])
	);

	/**
	 * Post-gate scan events (architecture: wcpos/monorepo#715). Consumers like
	 * the POS product route subscribe here; additional sources (attributed
	 * wedge, serial, HID-POS, camera) will feed the same shape.
	 */
	const attributed = useAttributedWedge();
	const scanEvents$ = React.useMemo(
		() => merge(barcode$.pipe(map(toWedgeScanEvent)), attributed.scanEvents$),
		[barcode$, attributed.scanEvents$]
	);

	/**
	 * Return the detected-barcode observables and the onKeyPress handler for
	 * the POS products search input.
	 */
	return {
		barcode$,
		scanEvents$,
		onKeyPress,
	};
};
