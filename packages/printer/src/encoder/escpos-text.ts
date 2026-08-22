import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';

const encodabilityByLanguageAndText = new Map<string, boolean>();

export function isEscposTextEncodable(
	text: string,
	language: 'esc-pos' | 'star-prnt' | 'star-line'
): boolean {
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
