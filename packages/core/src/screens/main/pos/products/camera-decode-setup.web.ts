import { BarcodeDetector } from 'barcode-detector/pure';

/**
 * On web and Electron the native `BarcodeDetector` constructor exists but does
 * not actually decode on Windows/Linux Chromium and is broken in Electron on
 * macOS (spec: wcpos/monorepo#722 §4). Force expo-camera's web path onto the
 * zxing-wasm polyfill by installing it as the global BarcodeDetector before
 * the camera reads it — overriding, not deferring to, the native one.
 *
 * NOTE: wasm asset delivery under the Electron CSP needs on-device verification
 * before release (zxing-wasm defaults to a CDN fetch).
 */
let installed = false;

export function ensureBarcodeDecoder(): void {
	if (installed) {
		return;
	}
	installed = true;
	(globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = BarcodeDetector;
}
