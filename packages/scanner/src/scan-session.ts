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

// Symbologies whose check digit is the standard alternating-weight mod-10 over
// the literal digits (see hasValidRetailCheckDigit). UPC-E is deliberately
// excluded: its check digit is computed over the *expanded* UPC-A, so running
// the EAN-8 algorithm on its 8 literal digits would wrongly reject valid codes.
const RETAIL_SYMBOLOGIES = new Set(['ean13', 'ean8', 'upc_a', 'ean-13', 'ean-8', 'upc-a']);

/**
 * Symbologies whose 13-digit reading may carry an implied leading zero (see
 * normalizeRetailCode). UPC-E is excluded: its printed form is 8 digits and
 * decoders expand it to the 12-digit UPC-A rather than shortening it, so
 * "what's on the package" is a separate question there.
 */
const ZERO_PADDED_SYMBOLOGIES = new Set(['ean13', 'upc_a', 'ean-13', 'upc-a']);

/**
 * Report the digits printed on the package, whichever device did the reading.
 *
 * A UPC-A symbol and an EAN-13 symbol are the same bars. EAN-13 draws only 12
 * digits; its leading digit is carried by the odd/even parity pattern of the
 * left-hand six, and the all-odd pattern a UPC-A prints means that digit is
 * zero. So a camera decoder reports a UPC-A as the 13-digit GTIN-13 form
 * (zxing-wasm and the iOS camera both do), while the package — and a HID wedge
 * in its default mode — shows the bare 12. Same identifier, two printing
 * conventions, and a cashier who scans the bottle in front of them sees digits
 * that appear nowhere on it.
 *
 * Dropping the zero is unambiguous: GS1 reserves the entire leading-0 prefix
 * range for GTIN-12, so a 13-digit retail code beginning with 0 always came
 * from a 12-digit symbol. No genuine EAN-13 can be mangled by this. Only codes
 * a source labelled EAN-13/UPC-A are touched — an unlabelled wedge read or a
 * numeric Code 128 SKU that happens to start with 0 is left alone, and #740's
 * lookup equivalence still tries both forms for those.
 */
export function normalizeRetailCode(code: string, symbology?: string): string {
	if (symbology === undefined || !ZERO_PADDED_SYMBOLOGIES.has(symbology.toLowerCase())) {
		return code;
	}
	return /^0\d{12}$/.test(code) ? code.slice(1) : code;
}

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
	// An explicit symbology is authoritative: only the mod-10 retail types are
	// gated. code128 / qr / upc_e report a symbology that is NOT in the set, so a
	// numeric payload like a Code 128 SKU passes through instead of being
	// rejected as a bad EAN/UPC check digit.
	if (symbology) {
		return RETAIL_SYMBOLOGIES.has(symbology.toLowerCase());
	}
	// No symbology (e.g. keyboard-wedge input): fall back to length. Length 8 is
	// dropped because it is ambiguous between EAN-8 and UPC-E — validating it as
	// EAN-8 would false-reject UPC-E — so only the unambiguous UPC-A (12) and
	// EAN-13 (13) lengths are gated.
	return /^\d+$/.test(code) && (code.length === 12 || code.length === 13);
}

export function createScanSession(options: ScanSessionOptions): ScanSession {
	const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
	const now = options.now ?? Date.now;
	const requireDoubleRead = options.requireDoubleRead ?? false;

	// code -> timestamp it was last accepted (per-code cooldown).
	const lastAccepted = new Map<string, number>();
	// code -> timestamp of the first-of-two read awaiting confirmation.
	let pending: { code: string; at: number } | null = null;

	const offer = (rawCode: string, symbology?: string): ScanOfferResult => {
		const at = now();
		// Normalize before anything else so the dedup window, the cooldown key and
		// every downstream consumer (cart lookup, search box, toast, logs) all see
		// the one form the cashier can read off the package.
		const code = normalizeRetailCode(rawCode, symbology);

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
