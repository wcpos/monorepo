import type * as BwipBrowser from 'bwip-js/browser';

export type BarcodeLibrary = Pick<typeof BwipBrowser, 'toSVG'>;

let library: BarcodeLibrary | null = null;
let loading: Promise<BarcodeLibrary> | null = null;

/** The barcode library once loaded, else null. Renderers read this synchronously. */
export function getBarcodeLibrary(): BarcodeLibrary | null {
	return library;
}

/**
 * Loads bwip-js once and memoises it. This is the library's only dynamic root in
 * the app, so Metro keeps it out of the eager bundle (~1 MB raw).
 */
export function loadBarcodeLibrary(): Promise<BarcodeLibrary> {
	if (library) return Promise.resolve(library);
	loading ??= import('bwip-js/browser').then(
		(m) => {
			library = { toSVG: m.toSVG };
			return library;
		},
		(error) => {
			loading = null;
			throw error;
		}
	);
	return loading;
}

export function resetBarcodeLibraryForTests(): void {
	library = null;
	loading = null;
}
