/**
 * Decodes a HID Point-of-Sale (USB-IF usage page 0x8C) barcode input report.
 *
 * The mainstream "USB HID POS" mode on Zebra / Honeywell / Datalogic delivers a
 * decoded-data report shaped as:
 *
 *   [reportId?] [length] [data … (length ASCII bytes)] [symbologyId?]
 *
 * i.e. a one-byte length prefix, the decoded barcode as ASCII, then an optional
 * trailing AIM/HID symbology identifier. The whole barcode arrives in one report
 * (no keyboard-layout corruption, no timing heuristic).
 *
 * Vendor variations exist (report-ID presence, symbology encoding, multi-report
 * long barcodes). `hasReportId` covers the common one; anything more exotic is
 * flagged for on-device tuning rather than guessed at here.
 */

export interface HidPosDecodeOptions {
	/** The device's report descriptor prefixes each report with a report ID. */
	hasReportId?: boolean;
}

export interface HidPosResult {
	code: string;
	symbology?: string;
}

// Common HID POS / AIM symbology identifiers → the retail symbology strings the
// scan-session and lookup understand. Unknown ids are left undefined.
const SYMBOLOGY_BY_ID: Record<number, string> = {
	0x02: 'code128',
	0x03: 'code39',
	0x0a: 'ean13',
	0x0b: 'ean8',
	0x0c: 'upc_a',
	0x0d: 'upc_e',
	0x11: 'qr',
	0x13: 'pdf417',
	0x15: 'datamatrix',
};

function toBytes(report: number[] | Uint8Array): number[] {
	return Array.from(report);
}

export function decodeHidPosReport(
	report: number[] | Uint8Array,
	options: HidPosDecodeOptions = {}
): HidPosResult | null {
	let bytes = toBytes(report);
	if (options.hasReportId) {
		bytes = bytes.slice(1);
	}
	if (bytes.length < 2) {
		return null;
	}

	const length = bytes[0];
	if (length <= 0 || length > bytes.length - 1) {
		return null;
	}

	const dataBytes = bytes.slice(1, 1 + length);
	// Decoded data must be printable ASCII; a report full of zeros/control bytes
	// is a keep-alive or non-barcode report, not a scan.
	if (!dataBytes.every((byte) => byte >= 0x20 && byte <= 0x7e)) {
		return null;
	}
	const code = String.fromCharCode(...dataBytes);

	const symbologyId = bytes[1 + length];
	const symbology = symbologyId !== undefined ? SYMBOLOGY_BY_ID[symbologyId] : undefined;

	return symbology ? { code, symbology } : { code };
}
