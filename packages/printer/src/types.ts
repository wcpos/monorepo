export interface PrintRawOptions {
	/** Whether transports that add their own cutter command should include it. */
	cutPaper?: boolean;
}

/**
 * Transport adapter — sends bytes to a physical printer.
 */
export interface PrinterTransport {
	/** Human-readable transport name for logging */
	readonly name: string;

	/**
	 * Send raw bytes (ESC/POS, StarPRNT, etc.) to the printer.
	 * Resolves when the printer acknowledges receipt or the data is sent.
	 */
	printRaw(data: Uint8Array, options?: PrintRawOptions): Promise<void>;

	/**
	 * Print HTML content via system print dialog.
	 * Used as fallback when no direct printer is configured.
	 */
	printHtml(html: string): Promise<void>;

	/**
	 * Send cash drawer kick command.
	 * Some transports include this in printRaw; this is for standalone kicks.
	 */
	openCashDrawer?(): Promise<void>;

	/** Disconnect / clean up resources */
	disconnect?(): Promise<void>;
}

/**
 * Discovered printer from network/BLE/USB scan.
 */
export interface DiscoveredPrinter {
	id: string;
	name: string;
	connectionType: 'network' | 'bluetooth' | 'usb';
	address: string;
	port?: number;
	vendor?: 'epson' | 'star' | 'generic';
	/** Vendor-native interface hint (for example Star BluetoothLE vs Bluetooth). */
	nativeInterfaceType?: string;
}

/**
 * Persisted printer profile — user-configured printer.
 */
export interface PrinterProfile {
	id: string;
	name: string;
	connectionType: 'network' | 'bluetooth' | 'usb' | 'system' | 'cloud';
	vendor: 'epson' | 'star' | 'generic';
	address?: string;
	port: number;
	/** Persisted vendor-native interface hint used by native adapters. */
	nativeInterfaceType?: string;
	/** For `connectionType: 'cloud'`: the WCPOS plugin-side registered cloud printer ID. */
	cloudPrinterId?: string;
	/**
	 * For `connectionType: 'cloud'`: the server-side print provider backing the
	 * registered cloud printer. Drives how jobs are delivered:
	 * - `star-cloudprnt` — the printer polls; a raw ESC/POS payload is delivered as-is.
	 * - `epson-sdp` / `printnode` — raw payloads are rejected/never delivered; the
	 *   server must render & submit an order-based job instead.
	 * Absent/unknown profiles fall back to the raw-payload (Star) behaviour.
	 */
	cloudProvider?: 'star-cloudprnt' | 'epson-sdp' | 'printnode';
	printerModel?: string;
	language: 'esc-pos' | 'star-prnt' | 'star-line';
	columns: number;
	/**
	 * Emit `ESC !` print-mode bytes alongside `GS !` size bytes.
	 * Default `true`. Some printers and simulators only honour one of the two
	 * size commands; emitting both maximizes compatibility. Disable as an
	 * escape hatch for printers that misbehave when both are sent.
	 */
	emitEscPrintMode?: boolean;
	fullReceiptRaster: boolean;
	autoCut: boolean;
	autoOpenDrawer: boolean;
	isDefault: boolean;
	isBuiltIn: boolean;
}

/**
 * Print job passed to the PrinterService.
 */
export interface PrintJob {
	id: string;
	type: 'receipt' | 'report' | 'test';
	/** Pre-encoded bytes — if provided, skip encoding */
	data?: Uint8Array;
	/** HTML content for system print fallback */
	html?: string;
	/** Receipt URL for legacy system print */
	url?: string;
	/** Printer profile to use. If omitted, uses default. */
	profileId?: string;
}

/**
 * Result from usePrint hook.
 */
export interface UsePrintResult {
	/** Trigger a print. Resolves when complete or queued. */
	print: () => Promise<void>;
	/** Whether a print job is currently in progress. */
	isPrinting: boolean;
}

/** Stable discovery error codes — the UI maps these to translated strings. */
export type DiscoveryErrorCode =
	| 'usb-none-found'
	| 'bt-none-found'
	| 'bt-connect-failed'
	| 'network-none-found'
	| 'ipc-unavailable'
	| 'discovery-failed';

/** Structured error from a printer discovery operation. */
export interface DiscoveryError {
	code: DiscoveryErrorCode;
	/** Optional extra context when available — most useful for 'discovery-failed' (underlying exception message). */
	detail?: string;
}

/** A Web Bluetooth chooser candidate forwarded from the Electron main process. */
export interface BluetoothCandidate {
	id: string;
	name: string;
}
