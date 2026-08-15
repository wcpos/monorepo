export function chunk<T>(values: readonly T[], size: number): T[][] {
	// Guard the exported helper: a non-positive size would never advance `index` and hang the caller.
	if (!Number.isSafeInteger(size) || size <= 0) {
		throw new Error('chunk size must be a positive integer');
	}
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}
