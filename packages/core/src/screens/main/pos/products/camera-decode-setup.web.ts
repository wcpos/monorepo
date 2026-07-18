import { BarcodeDetector } from 'barcode-detector/pure';

/**
 * On web and Electron the native `BarcodeDetector` constructor exists but does
 * not actually decode on Windows/Linux Chromium and is broken in Electron on
 * macOS (spec: wcpos/monorepo#722 §4). Force expo-camera's web path onto the
 * zxing-wasm polyfill by installing it as the global BarcodeDetector before the
 * camera reads it — overriding, not deferring to, the native one.
 *
 * KNOWN LIMITATION (wcpos/monorepo#741): zxing-wasm fetches its .wasm from a
 * jsDelivr CDN by default. That works on plain web but is blocked by the
 * Electron CSP, so camera decoding in the Electron shell needs the wasm bundled
 * and served locally. That is a Metro/webpack asset-integration task that has
 * to be verified against a real web/Electron build; tracked in #741 rather than
 * shipped unverified here.
 */
let installed = false;

export function ensureBarcodeDecoder(): void {
	if (installed) {
		return;
	}
	installed = true;
	(globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = BarcodeDetector;
}
