import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

import { printerLogger } from '../logger';

type EscposLanguage = 'esc-pos' | 'star-prnt' | 'star-line';

const encodabilityByLanguageAndText = new Map<string, boolean>();

/**
 * The encoder's own per-string code-page choice. It picks a page that can render the text, which
 * is right for a Latin receipt and wrong for a printer whose character tables are a Chinese or
 * Cyrillic set — hence `PrinterProfile.codePage`.
 */
export const AUTO_CODE_PAGE = 'auto';

/**
 * ESC/POS bytes for `text`, or the same text through the encoder's automatic code page when the
 * profile names a page this encoder build does not know (a profile written by an older build, or
 * a typo). A bad code-page name must not take the receipt down.
 */
function encodeProbeText(text: string, language: EscposLanguage, codePage: string): Uint8Array {
	const encode = (page: string) =>
		new ReceiptPrinterEncoder({ language }).initialize().codepage(page).text(text).encode();
	try {
		return encode(codePage);
	} catch {
		printerLogger.warn('Unknown code page', { context: { codePage, language } });
		return encode(AUTO_CODE_PAGE);
	}
}

export function isEscposTextEncodable(
	text: string,
	language: EscposLanguage,
	codePage: string = AUTO_CODE_PAGE
): boolean {
	const cacheKey = `${language}:${codePage}:${text}`;
	const cached = encodabilityByLanguageAndText.get(cacheKey);
	if (cached !== undefined) return cached;

	const bytes = encodeProbeText(text, language, codePage);
	const inputQuestionMarks = Array.from(text).filter((character) => character === '?').length;
	const encodedQuestionMarks = Array.from(bytes).filter((byte) => byte === 0x3f).length;
	const encodable = encodedQuestionMarks <= inputQuestionMarks;
	encodabilityByLanguageAndText.set(cacheKey, encodable);
	return encodable;
}

// ESC @ — the reset every job opens with. Font selection has to follow it.
const ESCPOS_INITIALIZE = [0x1b, 0x40];
// ESC M 0 — select Font A (12 × 24 dots), the pitch `profile.columns`, the model table and the
// setup ruler all assume. A printer whose memory switch defaults to Font B prints ~56 or 64
// columns from the same bytes, so the layout is wrong at the "right" column count (gotcha N39).
const ESCPOS_SELECT_FONT_A = [0x1b, 0x4d, 0x00];

// The whole of an initialize header, in every language the encoder speaks: ESC @, the Kanji
// cancel and the font select, or Star's ESC @ + CAN + page-mode pair.
const ESCPOS_HEADER_SCAN_BYTES = 8;

/**
 * Guarantee Font A at the head of an ESC/POS job, after its `ESC @` — the reset restores the
 * printer's *own* default font, which is the setting being overridden. Star languages have no
 * ESC M and are returned untouched.
 *
 * `@point-of-sale/receipt-printer-encoder`'s `initialize()` emits `ESC @ FS . ESC M 0` for every
 * ESC/POS model in its database (checked 2026-09-06), so on today's jobs this inserts nothing;
 * it exists so a job assembled some other way — or by an encoder build that stops emitting it —
 * still says which font it wants instead of inheriting the printer's memory switch.
 */
export function withEscposFontA(bytes: Uint8Array, language: EscposLanguage): Uint8Array {
	if (language !== 'esc-pos') return bytes;
	const header = bytes.subarray(0, ESCPOS_HEADER_SCAN_BYTES);
	// Only an explicit Font A (ESC M 0) counts; ESC M 1 selects Font B and must not be mistaken for it.
	const selectsFontA = header.some((_byte, index) =>
		ESCPOS_SELECT_FONT_A.every((expected, offset) => header[index + offset] === expected)
	);
	if (selectsFontA) return bytes;
	const startsInitialized = ESCPOS_INITIALIZE.every((byte, index) => bytes[index] === byte);
	const offset = startsInitialized ? ESCPOS_INITIALIZE.length : 0;
	const out = new Uint8Array(bytes.length + ESCPOS_SELECT_FONT_A.length);
	out.set(bytes.subarray(0, offset), 0);
	out.set(ESCPOS_SELECT_FONT_A, offset);
	out.set(bytes.subarray(offset), offset + ESCPOS_SELECT_FONT_A.length);
	return out;
}

/**
 * Per-job encodability gate. A caller substitutes a plain-ASCII stand-in every time this says no
 * (a currency symbol, in practice), so counting the noes counts the substitutions on the receipt.
 * One warn line per job, and never the text: the count plus the language is what explains a
 * receipt that printed "EUR" where the merchant expected the euro sign.
 */
export function createEncodabilityGate(
	language: EscposLanguage,
	codePage: string = AUTO_CODE_PAGE
) {
	let substitutions = 0;
	return {
		isSymbolEncodable(symbol: string): boolean {
			const encodable = isEscposTextEncodable(symbol, language, codePage);
			if (!encodable) substitutions += 1;
			return encodable;
		},
		logSubstitutions(): void {
			if (substitutions === 0) return;
			printerLogger.warn('Unencodable characters substituted', {
				// The code page is the profile's, or 'auto' when it names none — the two things
				// that decide whether a Thai or Cyrillic receipt prints as question marks.
				context: { count: substitutions, language, codepage: codePage },
			});
		},
	};
}
