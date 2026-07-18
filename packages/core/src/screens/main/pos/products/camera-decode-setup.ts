/**
 * Native (iOS/Android) barcode decoding is handled by expo-camera's own
 * AVFoundation/ML Kit path — nothing to install.
 */
export function ensureBarcodeDecoder(): void {
	// no-op on native
}
