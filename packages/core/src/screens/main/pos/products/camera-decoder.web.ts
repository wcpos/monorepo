import {
	BarcodeDetector,
	type BarcodeFormat,
	setZXingModuleOverrides,
} from 'barcode-detector/pure';

/**
 * Web/Electron barcode decoding (issue #905, folds in #741).
 *
 * The zxing-wasm ponyfill decodes reliably in both plain Chromium and the
 * Electron shell (verified live against Electron 41 / Chromium 146), but its
 * default is to fetch `zxing_reader.wasm` from the jsDelivr CDN — unacceptable
 * for a POS that must scan while offline. Metro bundles the reader wasm as a
 * static asset (`wasm` ∈ assetExts in apps/main metro.config.js) and the
 * require below resolves to its served URL, so the decoder works with no
 * network and no CDN/CSP exposure on both web and Electron.
 *
 * Unlike the previous global-BarcodeDetector override (consumed indirectly by
 * expo-camera's web scan loop), the detector is constructed and used directly
 * by scanner-viewfinder.web.tsx — no global mutation, no detector-cache
 * ordering hazard, and decode errors stay observable at the call site.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const zxingReaderWasm: unknown = require('zxing-wasm/dist/reader/zxing_reader.wasm');

/** Metro returns a bare URL string or an asset record depending on bundler mode. */
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

let configured = false;

export function createBarcodeDetector(formats: BarcodeFormat[]): BarcodeDetector {
	if (!configured) {
		const wasmUrl = resolveAssetUrl(zxingReaderWasm);
		if (wasmUrl) {
			setZXingModuleOverrides({
				locateFile: (locatePath: string, prefix: string) =>
					locatePath.endsWith('.wasm') ? wasmUrl : `${prefix}${locatePath}`,
			});
		}
		configured = true;
	}
	return new BarcodeDetector({ formats });
}
