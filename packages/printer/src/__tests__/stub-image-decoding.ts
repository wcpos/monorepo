import { vi } from 'vitest';

/**
 * Makes image decoding fail immediately for tests that are not about rasterizing.
 *
 * jsdom implements `Image` but never decodes pixel data, so `onload` never fires. The
 * real asset loaders (`thermal-raster.ts` and `renderThermalBarcodeAsset`) then sit out
 * their 10 s load timeout — on every test print, which now carries a logo, a QR code and
 * two barcodes. That is a property of jsdom, not a product hang: the timeout is exactly
 * what stops a slow asset wedging the print queue on a real device.
 *
 * Failing the decode at once keeps those suites fast and deterministic while leaving the
 * encoder itself real, so byte-level assertions still mean something. Asset preparation
 * is covered directly in `encoder/__tests__/thermal-print.test.ts`, where a fake raster
 * is supplied instead.
 */
export function stubImageDecodingAsUnavailable(): void {
	class UndecodableImage {
		onload: (() => void) | null = null;
		onerror: ((error?: unknown) => void) | null = null;
		width = 0;
		height = 0;
		naturalWidth = 0;
		naturalHeight = 0;

		set src(_value: string) {
			queueMicrotask(() => this.onerror?.(new Error('jsdom does not decode images')));
		}
	}

	vi.stubGlobal('Image', UndecodableImage);
}
