import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

import { printerLogger } from '../logger';

type EscposLanguage = 'esc-pos' | 'star-prnt' | 'star-line';

const encodabilityByLanguageAndText = new Map<string, boolean>();

export function isEscposTextEncodable(text: string, language: EscposLanguage): boolean {
	const cacheKey = `${language}:${text}`;
	const cached = encodabilityByLanguageAndText.get(cacheKey);
	if (cached !== undefined) return cached;

	const bytes = new ReceiptPrinterEncoder({ language })
		.initialize()
		.codepage('auto')
		.text(text)
		.encode();
	const inputQuestionMarks = Array.from(text).filter((character) => character === '?').length;
	const encodedQuestionMarks = Array.from(bytes).filter((byte) => byte === 0x3f).length;
	const encodable = encodedQuestionMarks <= inputQuestionMarks;
	encodabilityByLanguageAndText.set(cacheKey, encodable);
	return encodable;
}

/**
 * Per-job encodability gate. A caller substitutes a plain-ASCII stand-in every time this says no
 * (a currency symbol, in practice), so counting the noes counts the substitutions on the receipt.
 * One warn line per job, and never the text: the count plus the language is what explains a
 * receipt that printed "EUR" where the merchant expected the euro sign.
 */
export function createEncodabilityGate(language: EscposLanguage) {
	let substitutions = 0;
	return {
		isSymbolEncodable(symbol: string): boolean {
			const encodable = isEscposTextEncodable(symbol, language);
			if (!encodable) substitutions += 1;
			return encodable;
		},
		logSubstitutions(): void {
			if (substitutions === 0) return;
			printerLogger.warn('Unencodable characters substituted', {
				// The encoder picks the code page per string ('auto'); the language is the one
				// thing the merchant's profile actually sets.
				context: { count: substitutions, language, codepage: 'auto' },
			});
		},
	};
}
