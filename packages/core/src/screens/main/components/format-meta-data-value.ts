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
