import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const httpLogger = getLogger(['wcpos', 'http', 'rest']);

function tryParse(text: string): { value: unknown } | null {
	try {
		return { value: JSON.parse(text) };
	} catch {
		return null;
	}
}

/** Index of the bracket that closes the one at `start`, skipping JSON strings; -1 if none. */
function closingBracket(text: string, start: number): number {
	let depth = 0;
	let inString = false;
	for (let i = start; i < text.length; i++) {
		const char = text[i];
		if (inString) {
			if (char === '\\') i++;
			else if (char === '"') inString = false;
		} else if (char === '"') inString = true;
		else if (char === '{' || char === '[') depth++;
		else if ((char === '}' || char === ']') && --depth === 0) return i;
	}
	return -1;
}

/**
 * Reads the store's JSON out of a body that another plugin polluted with stray text.
 *
 * Each `{`/`[` is matched to its own closing bracket (brackets inside JSON strings
 * ignored) and that one span is parsed, so the work is one parse per opening bracket.
 * The LONGEST span wins: the store's body is bigger than a `[400]` in a stray prefix
 * or a `{}` footer after it. The old code returned the first start's longest prefix,
 * so a bracket in the stray text won: `[400]` out of a Xero exception, and the
 * payment's answer was lost (POS-30P).
 */
export function extractValidJSON(responseString: string) {
	const starts: number[] = [];
	for (let i = 0; i < responseString.length; i++) {
		if (responseString[i] === '{' || responseString[i] === '[') starts.push(i);
	}

	if (starts.length === 0) {
		httpLogger.error('Server returned invalid response - no JSON found', {
			code: ERROR_CODES.STORE_SERVER_ERROR,
			context: {
				responsePreview: responseString.substring(0, 200),
			},
		});
		return null;
	}

	const whole = tryParse(responseString.trim());
	if (whole) return whole.value;

	let best: { length: number; value: unknown } | null = null;
	let parsedUpTo = -1; // end of the last span that parsed; starts inside it are skipped
	for (const start of starts) {
		if (start <= parsedUpTo) continue;
		const end = closingBracket(responseString, start);
		if (end === -1) continue;
		const span = tryParse(responseString.slice(start, end + 1));
		if (!span) continue;
		parsedUpTo = end;
		const length = end + 1 - start;
		if (!best || length > best.length) best = { length, value: span.value };
	}
	if (best) return best.value;

	httpLogger.error('Unable to parse server response', {
		code: ERROR_CODES.STORE_SERVER_ERROR,
		context: {
			responsePreview: responseString.substring(0, 200),
		},
	});
	return null;
}
