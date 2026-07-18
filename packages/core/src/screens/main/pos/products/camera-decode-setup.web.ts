import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/pure';

/**
 * On web and Electron the native `BarcodeDetector` constructor exists but does
 * not actually decode on Windows/Linux Chromium and is broken in Electron on
 * macOS (spec: wcpos/monorepo#722 §4). Force expo-camera's web path onto the
 * zxing-wasm polyfill by installing it as the global BarcodeDetector before
 * the camera reads it — overriding, not deferring to, the native one.
 *
 * zxing-wasm defaults to fetching its .wasm from a jsDelivr CDN, which the
 * Electron CSP blocks; point it at the wasm bundled with the app instead so the
 * decoder works offline and under the CSP.
 */
let installed = false;

export function ensureBarcodeDecoder(): void {
	if (installed) {
		return;
	}
	installed = true;
	setZXingModuleOverrides({
		locateFile: (path: string, prefix: string) => {
			if (path.endsWith('.wasm')) {
				// Resolved by the bundler to a local asset URL rather than the CDN.
				return new URL('zxing-wasm/dist/reader/zxing_reader.wasm', import.meta.url).href;
			}
			return prefix + path;
		},
	});
	(globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = BarcodeDetector;
}
