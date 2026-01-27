import { yieldToEventLoop, processInChunks, chunkedIterator } from '../src/yield';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

describe('Yield Utilities', () => {
	describe('yieldToEventLoop', () => {
		it('should yield and resume execution', async () => {
			const order: number[] = [];

			// Start async operation
			const promise = (async () => {
				order.push(1);
				await yieldToEventLoop();
				order.push(3);
			})();

			// This should run before the resumed async operation
			order.push(2);

			await promise;

			// Order should be [1, 2, 3] because yield allows 2 to execute
			expect(order).toEqual([1, 2, 3]);
		});

		it('should return a promise', () => {
			const result = yieldToEventLoop();
			expect(result).toBeInstanceOf(Promise);
		});

		it('should resolve (not reject)', async () => {
			await expect(yieldToEventLoop()).resolves.toBeUndefined();
		});
	});

	describe('processInChunks', () => {
		it('should process all items', async () => {
			const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			const processedChunks: number[][] = [];

			await processInChunks(
				items,
				async (chunk) => {
					processedChunks.push(chunk);
				},
				3
			);

			expect(processedChunks).toEqual([
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
				[10],
			]);
		});

		it('should call onProgress with correct values', async () => {
			const items = [1, 2, 3, 4, 5];
			const progressCalls: { processed: number; total: number; percent: number }[] = [];

			await processInChunks(
				items,
				async () => {},
				2,
				(progress) => progressCalls.push({ ...progress })
			);

			expect(progressCalls).toEqual([
				{ processed: 2, total: 5, percent: 40 },
				{ processed: 4, total: 5, percent: 80 },
				{ processed: 5, total: 5, percent: 100 },
			]);
		});

		it('should handle empty array', async () => {
			const processedChunks: number[][] = [];

			await processInChunks(
				[],
				async (chunk) => {
					processedChunks.push(chunk);
				},
				3
			);

			expect(processedChunks).toEqual([]);
		});

		it('should pass chunk index to processor', async () => {
			const items = [1, 2, 3, 4, 5, 6];
			const indices: number[] = [];

			await processInChunks(
				items,
				async (_, index) => {
					indices.push(index);
				},
				2
			);

			expect(indices).toEqual([0, 1, 2]);
		});
	});

	describe('chunkedIterator', () => {
		it('should yield chunks', async () => {
			const items = [1, 2, 3, 4, 5, 6, 7];
			const chunks: number[][] = [];

			for await (const { chunk } of chunkedIterator(items, 3)) {
				chunks.push(chunk);
			}

			expect(chunks).toEqual([
				[1, 2, 3],
				[4, 5, 6],
				[7],
			]);
		});

		it('should indicate last chunk', async () => {
			const items = [1, 2, 3, 4, 5];
			const lastFlags: boolean[] = [];

			for await (const { isLast } of chunkedIterator(items, 2)) {
				lastFlags.push(isLast);
			}

			expect(lastFlags).toEqual([false, false, true]);
		});

		it('should provide correct index', async () => {
			const items = [1, 2, 3, 4, 5, 6];
			const indices: number[] = [];

			for await (const { index } of chunkedIterator(items, 2)) {
				indices.push(index);
			}

			expect(indices).toEqual([0, 1, 2]);
		});

		it('should handle empty array', async () => {
			const chunks: number[][] = [];

			for await (const { chunk } of chunkedIterator([], 3)) {
				chunks.push(chunk);
			}

			expect(chunks).toEqual([]);
		});

		it('should handle single item', async () => {
			const items = [1];
			const results: { chunk: number[]; isLast: boolean }[] = [];

			for await (const result of chunkedIterator(items, 3)) {
				results.push({ chunk: result.chunk, isLast: result.isLast });
			}

			expect(results).toEqual([{ chunk: [1], isLast: true }]);
		});
	});

	describe('Integration', () => {
		it('should not block event loop during processing', async () => {
			// Create a large dataset
			const items = Array.from({ length: 100 }, (_, i) => i);
			let otherTaskRan = false;

			// Start processing
			const processingPromise = processInChunks(
				items,
				async () => {
					// Simulate some work
					await new Promise((resolve) => setTimeout(resolve, 1));
				},
				10
			);

			// Schedule another task
			setTimeout(() => {
				otherTaskRan = true;
			}, 5);

			await processingPromise;

			// The other task should have run during processing
			// (because we yield between chunks)
			expect(otherTaskRan).toBe(true);
		});
	});
});
