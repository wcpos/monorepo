import {
	BarcodeDetector,
	type BarcodeFormat,
	setZXingModuleOverrides,
} from 'barcode-detector/pure';
import { Asset } from 'expo-asset';

/**
 * Web/Electron barcode decoding (issue #905, folds in #741).
 *
 * The zxing-wasm ponyfill decodes reliably in both plain Chromium and the
 * Electron shell (verified live against Electron 41 / Chromium 146), but its
 * default is to fetch `zxing_reader.wasm` from the jsDelivr CDN — unacceptable
 * for a POS that must scan while offline. Metro bundles the reader wasm as a
 * static asset (`wasm` ∈ assetExts in apps/main metro.config.js); Expo's asset
 * registry resolves the require below to its served URL, so the decoder works
 * with no network and no CDN/CSP exposure on both web and Electron.
 *
 * Unlike the previous global-BarcodeDetector override (consumed indirectly by
 * expo-camera's web scan loop), the detector is constructed and used directly
 * by scanner-viewfinder.web.tsx — no global mutation, no detector-cache
 * ordering hazard, and decode errors stay observable at the call site.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const zxingReaderWasm: unknown = require('zxing-wasm/dist/reader/zxing_reader.wasm');

/** Metro returns a URL, an opaque asset ID, or an asset record depending on bundler mode. */
function resolveAssetUrl(asset: unknown): string {
	if (typeof asset === 'string') {
		return asset;
	}
	if (typeof asset === 'number') {
		return Asset.fromModule(asset).uri;
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
