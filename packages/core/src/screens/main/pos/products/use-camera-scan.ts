import * as React from 'react';

import { createScanSession, type ScanSession } from '@wcpos/scanner';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCameraScanBus } from '../../hooks/barcodes/camera-scan-context';
import { showTooShortFeedback } from '../../hooks/barcodes/too-short-feedback';

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
	const minChars = useDocField(store, (value) => value.barcode_scanning_min_chars) as number;
	const t = useT();

	const emitRef = React.useRef(emit);
	const minCharsRef = React.useRef(Number(minChars));
	const tRef = React.useRef(t);
	React.useEffect(() => {
		emitRef.current = emit;
	}, [emit]);
	React.useEffect(() => {
		minCharsRef.current = Number(minChars);
	}, [minChars]);
	React.useEffect(() => {
		tRef.current = t;
	}, [t]);

	const sessionRef = React.useRef<ScanSession | null>(null);

	const getSession = React.useCallback((): ScanSession => {
		if (!sessionRef.current) {
			sessionRef.current = createScanSession({
				onAccept: (code, symbology) => {
					if (code.length < minCharsRef.current) {
						// A decoded-but-too-short code must not vanish silently (#905):
						// give the same feedback the keyboard-wedge path gives, so the
						// cashier learns why nothing was added and can adjust the
						// minimum-length setting if it's misconfigured.
						showTooShortFeedback(tRef.current, code, minCharsRef.current);
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

	return { onScan, reset };
};
