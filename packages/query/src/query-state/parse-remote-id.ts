/**
 * Normalize remote ids that can arrive from metadata as numbers or numeric strings.
 */
export function parseRemoteId(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
		return value;
	}

	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (!trimmed || !/^\d+$/.test(trimmed)) {
		return undefined;
	}

	return Number(trimmed);
}
