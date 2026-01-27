/**
 * Yields execution to allow the event loop to process other tasks.
 *
 * This prevents UI blocking when processing large datasets.
 * Uses requestAnimationFrame when available (browser), falls back to setTimeout.
 *
 * Usage:
 * ```ts
 * for (const chunk of chunks) {
 *   await processChunk(chunk);
 *   await yieldToEventLoop();
 * }
 * ```
 */
export function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestAnimationFrame !== 'undefined') {
			// Browser environment - yield before next frame
			requestAnimationFrame(() => resolve());
		} else {
			// Node.js or environments without rAF - use setImmediate or setTimeout
			if (typeof setImmediate !== 'undefined') {
				setImmediate(resolve);
			} else {
				setTimeout(resolve, 0);
			}
		}
	});
}

/**
 * Process items in chunks with yielding between each chunk.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each chunk
 * @param chunkSize - Number of items per chunk (default 1000)
 * @param onProgress - Optional callback for progress updates
 *
 * Usage:
 * ```ts
 * await processInChunks(
 *   records,
 *   async (chunk) => {
 *     await collection.bulkUpsert(chunk);
 *   },
 *   1000,
 *   (progress) => console.log(`${progress.percent}% complete`)
 * );
 * ```
 */
export async function processInChunks<T>(
	items: T[],
	processor: (chunk: T[], chunkIndex: number) => Promise<void>,
	chunkSize: number = 1000,
	onProgress?: (progress: { processed: number; total: number; percent: number }) => void
): Promise<void> {
	// Guard against invalid chunkSize to prevent infinite loops
	if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
		throw new RangeError('chunkSize must be a positive number');
	}

	const total = items.length;

	for (let i = 0; i < total; i += chunkSize) {
		const chunk = items.slice(i, i + chunkSize);
		const chunkIndex = Math.floor(i / chunkSize);

		await processor(chunk, chunkIndex);

		// Report progress
		const processed = Math.min(i + chunkSize, total);
		if (onProgress) {
			onProgress({
				processed,
				total,
				percent: Math.round((processed / total) * 100),
			});
		}

		// Yield to event loop after each chunk (except the last one)
		if (i + chunkSize < total) {
			await yieldToEventLoop();
		}
	}
}

/**
 * Creates a chunked async iterator that yields between chunks.
 *
 * @param items - Array of items to iterate over
 * @param chunkSize - Number of items per chunk
 *
 * Usage:
 * ```ts
 * for await (const { chunk, isLast } of chunkedIterator(records, 1000)) {
 *   await processChunk(chunk);
 * }
 * ```
 */
export async function* chunkedIterator<T>(
	items: T[],
	chunkSize: number = 1000
): AsyncGenerator<{ chunk: T[]; index: number; isLast: boolean }> {
	// Guard against invalid chunkSize to prevent infinite loops
	if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
		throw new RangeError('chunkSize must be a positive number');
	}

	const total = items.length;

	for (let i = 0; i < total; i += chunkSize) {
		const chunk = items.slice(i, i + chunkSize);
		const index = Math.floor(i / chunkSize);
		const isLast = i + chunkSize >= total;

		yield { chunk, index, isLast };

		// Yield to event loop after each chunk (except the last one)
		if (!isLast) {
			await yieldToEventLoop();
		}
	}
}
