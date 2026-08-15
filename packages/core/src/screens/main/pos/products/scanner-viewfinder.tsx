import * as React from 'react';
import { View } from 'react-native';

import { type BarcodeScanningResult, CameraView } from 'expo-camera';

import { CAMERA_BARCODE_TYPES } from './use-camera-scan';
import { type ScannerViewfinderProps } from './scanner-viewfinder-types';

/**
 * Native (iOS/Android) viewfinder: expo-camera's on-device scanning
 * (AVFoundation / ML Kit). Decoding happens natively, so unlike the web
 * variant there is no in-JS decode loop to instrument; scan hits arrive via
 * onBarcodeScanned. The web/Electron implementation lives in
 * scanner-viewfinder.web.tsx.
 */
export function ScannerViewfinder({ onScan, onStatusChange }: ScannerViewfinderProps) {
	const onStatusChangeRef = React.useRef(onStatusChange);
	React.useEffect(() => {
		onStatusChangeRef.current = onStatusChange;
	}, [onStatusChange]);

	React.useEffect(() => {
		onStatusChangeRef.current?.('initializing');
	}, []);

	const handleBarcode = React.useCallback(
		(result: BarcodeScanningResult) => {
			onScan({ data: result.data, type: result.type });
		},
		[onScan]
	);

	const handleCameraReady = React.useCallback(() => {
		onStatusChangeRef.current?.('scanning');
	}, []);

	const handleMountError = React.useCallback(() => {
		onStatusChangeRef.current?.('camera-unavailable');
	}, []);

	return (
		<View className="h-full w-full" testID="scanner-viewfinder">
			<CameraView
				style={{ flex: 1 }}
				facing="back"
				barcodeScannerSettings={{ barcodeTypes: [...CAMERA_BARCODE_TYPES] }}
				onBarcodeScanned={handleBarcode}
				onCameraReady={handleCameraReady}
				onMountError={handleMountError}
			/>
		</View>
	);
}
