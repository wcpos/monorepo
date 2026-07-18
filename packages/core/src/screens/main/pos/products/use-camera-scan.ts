import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { createScanSession, type ScanSession } from '@wcpos/scanner';

import { ensureBarcodeDecoder } from './camera-decode-setup';
import { useAppState } from '../../../../contexts/app-state';
import { useCameraScanBus } from '../../hooks/barcodes/camera-scan-context';

// The retail set we ask the camera decoder for (spec §4: narrowing formats is a
// documented speed win). expo-camera's BarcodeType strings.
export const CAMERA_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] as const;

export interface CameraScanResult {
	data: string;
	type?: string;
}

/**
 * Bridges the camera viewfinder to the scan pipeline: raw decoder hits pass
 * through the scan-session (dedup/cooldown + retail check-digit) and accepted
 * codes are emitted onto the shared camera scan bus as `camera` ScanEvents,
 * which useBarcodeDetection merges into scanEvents$.
 */
export const useCameraScan = () => {
	const { emit } = useCameraScanBus();
	const { store } = useAppState();
	const minChars = useObservableEagerState(store.barcode_scanning_min_chars$) as number;

	const emitRef = React.useRef(emit);
	const minCharsRef = React.useRef(Number(minChars));
	React.useEffect(() => {
		emitRef.current = emit;
	}, [emit]);
	React.useEffect(() => {
		minCharsRef.current = Number(minChars);
	}, [minChars]);

	const sessionRef = React.useRef<ScanSession | null>(null);

	const getSession = React.useCallback((): ScanSession => {
		if (!sessionRef.current) {
			sessionRef.current = createScanSession({
				onAccept: (code, symbology) => {
					if (code.length < minCharsRef.current) {
						return;
					}
					emitRef.current({
						code,
						symbology,
						source: { kind: 'camera' },
						timestamp: Date.now(),
					});
				},
			});
		}
		return sessionRef.current;
	}, []);

	const onScan = React.useCallback(
		(result: CameraScanResult) => {
			getSession().offer(result.data, result.type);
		},
		[getSession]
	);

	// Reset dedup state each time a scanning session opens so an item scanned
	// in a previous session isn't suppressed.
	const reset = React.useCallback(() => {
		sessionRef.current?.reset();
	}, []);

	const prepareDecoder = React.useCallback(() => {
		ensureBarcodeDecoder();
	}, []);

	return { onScan, reset, prepareDecoder };
};
