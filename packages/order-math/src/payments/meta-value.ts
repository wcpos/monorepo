/** A meta value as stored: a JSON string is parsed (null when it is not JSON), anything else is as is. */
export function parseMetaValue(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}
