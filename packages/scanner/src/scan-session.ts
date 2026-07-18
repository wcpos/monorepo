/**
 * The scan-session layer sits between a high-frequency scan source (a camera
 * decoder fires many times per second on the same barcode) and the app's
 * scan pipeline. It suppresses repeats within a cooldown and rejects obvious
 * camera misreads via retail check-digit validation — required regardless of
 * which camera library decodes the frames (spec: wcpos/monorepo#722 §4).
 */

export const DEFAULT_COOLDOWN_MS = 1200;
// A second identical read must arrive within this window to confirm, when
// requireDoubleRead is on.
const DOUBLE_READ_WINDOW_MS = 400;

export type ScanRejectReason = 'cooldown' | 'bad-check-digit' | 'awaiting-confirmation';

export interface ScanOfferResult {
	accepted: boolean;
	reason?: ScanRejectReason;
}

export interface ScanSessionOptions {
	onAccept: (code: string, symbology?: string) => void;
	cooldownMs?: number;
	requireDoubleRead?: boolean;
	now?: () => number;
}

export interface ScanSession {
	offer: (code: string, symbology?: string) => ScanOfferResult;
	reset: () => void;
}

const RETAIL_SYMBOLOGIES = new Set([
	'ean13',
	'ean8',
	'upc_a',
	'upc_e',
	'ean-13',
	'ean-8',
	'upc-a',
	'upc-e',
]);

/**
 * Validates the check digit of an EAN-13/EAN-8/UPC-A code (UPC-A is a 12-digit
 * EAN-13 with an implicit leading zero). Returns true for non-retail-length
 * inputs so only genuine retail codes are gated.
 */
export function hasValidRetailCheckDigit(code: string): boolean {
	if (!/^\d+$/.test(code)) {
		return true;
	}
	// EAN-8 (8), UPC-A (12), EAN-13 (13). UPC-E (6/8) expands to UPC-A; leave
	// its validation to the decoder (expansion is non-trivial) — pass it through.
	if (code.length !== 8 && code.length !== 12 && code.length !== 13) {
		return true;
	}
	const digits = code.split('').map(Number);
	const check = digits.pop() as number;
	// From the rightmost data digit, weights alternate 3,1,3,1…
	let sum = 0;
	for (let i = digits.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
		sum += digits[i] * weight;
	}
	const expected = (10 - (sum % 10)) % 10;
	return expected === check;
}

function looksRetail(code: string, symbology?: string): boolean {
	if (symbology && RETAIL_SYMBOLOGIES.has(symbology.toLowerCase())) {
		return true;
	}
	return /^\d+$/.test(code) && (code.length === 8 || code.length === 12 || code.length === 13);
}

export function createScanSession(options: ScanSessionOptions): ScanSession {
	const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
	const now = options.now ?? Date.now;
	const requireDoubleRead = options.requireDoubleRead ?? false;

	// code -> timestamp it was last accepted (per-code cooldown).
	const lastAccepted = new Map<string, number>();
	// code -> timestamp of the first-of-two read awaiting confirmation.
	let pending: { code: string; at: number } | null = null;

	const offer = (code: string, symbology?: string): ScanOfferResult => {
		const at = now();

		if (looksRetail(code, symbology) && !hasValidRetailCheckDigit(code)) {
			return { accepted: false, reason: 'bad-check-digit' };
		}

		const lastAt = lastAccepted.get(code);
		if (lastAt !== undefined && at - lastAt < cooldownMs) {
			return { accepted: false, reason: 'cooldown' };
		}

		if (requireDoubleRead) {
			if (!pending || pending.code !== code || at - pending.at > DOUBLE_READ_WINDOW_MS) {
				pending = { code, at };
				return { accepted: false, reason: 'awaiting-confirmation' };
			}
			pending = null;
		}

		lastAccepted.set(code, at);
		options.onAccept(code, symbology);
		return { accepted: true };
	};

	return {
		offer,
		reset: () => {
			lastAccepted.clear();
			pending = null;
		},
	};
}
