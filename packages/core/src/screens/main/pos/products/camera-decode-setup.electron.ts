import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/pure';

/**
 * Electron shell barcode decoding. Like the plain-web path this forces
 * expo-camera onto the zxing-wasm polyfill (the native BarcodeDetector is broken
 * in Electron — spec wcpos/monorepo#722 §4), but the Electron CSP blocks the
 * jsDelivr CDN that zxing-wasm fetches its `.wasm` from by default
 * (wcpos/monorepo#741).
 *
 * Serve the reader `.wasm` from the app bundle instead: Metro copies it as a
 * static asset (`wasm` is registered in apps/main metro `assetExts`) and
 * `setZXingModuleOverrides({ locateFile })` points zxing at that local URL, so no
 * cross-origin fetch is needed. Plain web keeps the CDN default in
 * `camera-decode-setup.web.ts`, so this override can't affect the web build.
 */

// Metro bundles the reader wasm as a static asset (wasm ∈ assetExts) and the
// require resolves to its bundled URL.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const zxingReaderWasm: unknown = require('zxing-wasm/dist/reader/zxing_reader.wasm');

/** Metro returns a bare URL string or an asset record depending on platform. */
function resolveAssetUrl(asset: unknown): string {
	if (typeof asset === 'string') {
		return asset;
	}
	if (asset && typeof asset === 'object') {
		const record = asset as { uri?: string; default?: string };
		return record.uri ?? record.default ?? '';
	}
	return '';
}

let installed = false;

export function ensureBarcodeDecoder(): void {
	if (installed) {
		return;
	}
	installed = true;
	const wasmUrl = resolveAssetUrl(zxingReaderWasm);
	if (wasmUrl) {
		setZXingModuleOverrides({
			locateFile: (locatePath: string, prefix: string) =>
				locatePath.endsWith('.wasm') ? wasmUrl : `${prefix}${locatePath}`,
		});
	}
	(globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = BarcodeDetector;
}
