/**
 * ESC/POS real-time status (`DLE EOT n`, `0x10 0x04 n`) — the one question a raw lane can put to a
 * printer, and the answer to "paper out, cover open, did it print", which was unanswerable on every
 * raw lane (audit D4, roadmap#161 P3).
 *
 * The byte map, from the ESC/POS command set:
 *   n=1 printer status — bit 3 offline
 *   n=2 offline cause  — bit 2 cover open, bit 5 paper end, bit 6 error
 *   n=3 error cause    — not asked: nothing in the flow acts on it beyond n=2 bit 6
 *   n=4 paper sensor   — bits 2-3 paper near end, bits 5-6 paper end
 * Each query answers one byte with bit 4 set and bit 7 clear.
 */
import { printerLogger } from '../logger';

/** One round of `DLE EOT`, read off a printer. `raw` is exactly what it answered. */
export interface PrinterStatus {
	online: boolean;
	coverOpen: boolean;
	paperOut: boolean;
	paperNearEnd: boolean;
	error: boolean;
	raw: number[];
}

/** How a lane reports what it read; `unknown` is a printer that answered nothing usable. */
export type PrinterStatusState =
	'ok' | 'paper-out' | 'cover-open' | 'offline' | 'error' | 'unknown';

/** The `n` values a lane asks for, in the order `parsePrinterStatus` reads the replies back. */
export const STATUS_QUERIES = [1, 2, 4] as const;

// A printer answers a real-time request in milliseconds when it answers at all; 800 ms is long
// enough for one that is mid-receipt, and short enough that three queries cannot stall a test page.
export const STATUS_REPLY_TIMEOUT_MS = 800;

// Bit 4 set and bit 7 clear mark a real-time status byte; anything else arriving on the notify
// characteristic is the printer talking about something we did not ask for.
const REPLY_MASK = 0b1001_0000;
const REPLY_BITS = 0b0001_0000;

const OFFLINE = 0b0000_1000; // n=1 bit 3
const COVER_OPEN = 0b0000_0100; // n=2 bit 2
const PAPER_END = 0b0010_0000; // n=2 bit 5
const ERROR = 0b0100_0000; // n=2 bit 6
const NEAR_END_SENSORS = 0b0000_1100; // n=4 bits 2-3
const PAPER_END_SENSORS = 0b0110_0000; // n=4 bits 5-6

/** The three bytes of a real-time status request. */
export function DLE_EOT(n: number): Uint8Array {
	return Uint8Array.of(0x10, 0x04, n);
}

/** True when a byte read off the printer is a real-time status reply rather than other traffic. */
export function isStatusReply(byte: number): boolean {
	return (byte & REPLY_MASK) === REPLY_BITS;
}

function has(byte: number | undefined, mask: number): boolean {
	return byte != null && (byte & mask) !== 0;
}

/**
 * Reads the replies to `DLE EOT` 1, 2 and 4, in that order. A lane that got fewer bytes — a query
 * that timed out, a printer that answers only the first — passes what it has: the fields those
 * bytes cannot speak for stay false, and `raw` says which ones were actually read.
 */
export function parsePrinterStatus(bytes: Uint8Array | number[]): PrinterStatus {
	const raw = Array.from(bytes);
	const [printer, offlineCause, paperSensor] = raw;
	return {
		// A missing n=1 byte is not evidence of an offline printer; only the bit is.
		online: !has(printer, OFFLINE),
		coverOpen: has(offlineCause, COVER_OPEN),
		paperOut: has(offlineCause, PAPER_END) || has(paperSensor, PAPER_END_SENSORS),
		paperNearEnd: has(paperSensor, NEAR_END_SENSORS),
		error: has(offlineCause, ERROR),
		raw,
	};
}

/** The one word the flow and the log line use for a status. */
export function describeStatus(status: PrinterStatus): PrinterStatusState {
	if (status.raw.length === 0) return 'unknown';
	if (status.paperOut) return 'paper-out';
	if (status.coverOpen) return 'cover-open';
	if (status.error) return 'error';
	if (!status.online) return 'offline';
	return 'ok';
}

/** Every status read logs its raw bytes, so a merchant's report carries what the printer said. */
export function logStatusRead(lane: string, bytes: number[]): PrinterStatus | null {
	if (bytes.length === 0) {
		printerLogger.debug('Printer status query got no reply', { context: { lane } });
		return null;
	}
	const status = parsePrinterStatus(bytes);
	printerLogger.info('Printer status read', {
		context: { lane, state: describeStatus(status), raw: status.raw },
	});
	return status;
}

/**
 * The answer from a lane that cannot ask: a write-only channel (Electron USB and raw TCP both send
 * through the main process), or a BLE profile with no notify characteristic.
 */
export function statusQueryUnavailable(lane: string): null {
	printerLogger.debug('Status query not available on this lane', { context: { lane } });
	return null;
}
