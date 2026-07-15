/**
 * Format a meta_data value for display.
 *
 * Under the typed-meta contract, structured meta values are objects/arrays,
 * not JSON strings — anything that renders a meta value must format it first
 * (React throws on object children). Display-only: storage stays typed.
 */
export const formatMetaDataValue = (value: unknown): string | number => {
	if (typeof value === 'string' || typeof value === 'number') {
		return value;
	}
	if (value === undefined || value === null) {
		return '';
	}
	return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

/**
 * Parse edited meta-value text back to its typed form — the client-side mirror
 * of the server's wire normalizer. A structured value is displayed as JSON in
 * the edit form; without this, submitting the edit would store the JSON as a
 * string and reintroduce stringified meta from the client side. Text that
 * doesn't parse as a JSON object/array stays a plain string.
 */
export const parseMetaDataInput = (text: string): unknown => {
	const trimmed = text.trim();
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed === 'object' && parsed !== null) {
				return parsed;
			}
		} catch {
			// fall through — keep the raw text
		}
	}
	return text;
};
