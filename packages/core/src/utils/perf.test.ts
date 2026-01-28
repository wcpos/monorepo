import { timeStart, timeEnd } from './perf';

// Mock the logger
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		info: jest.fn(),
		debug: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

describe('perf utilities', () => {
	describe('timeStart', () => {
		it('should return a number (timestamp)', () => {
			const start = timeStart();
			expect(typeof start).toBe('number');
		});

		it('should return current performance time', () => {
			const before = performance.now();
			const start = timeStart();
			const after = performance.now();

			expect(start).toBeGreaterThanOrEqual(before);
			expect(start).toBeLessThanOrEqual(after);
		});

		it('should return increasing values on subsequent calls', () => {
			const first = timeStart();
			const second = timeStart();

			expect(second).toBeGreaterThanOrEqual(first);
		});
	});

	describe('timeEnd', () => {
		it('should return elapsed time in milliseconds', () => {
			const start = timeStart();

			// Small delay to ensure measurable time passes
			const busyWait = (ms: number) => {
				const end = Date.now() + ms;
				while (Date.now() < end) {
					// busy wait
				}
			};
			busyWait(5);

			const elapsed = timeEnd(start, 'testFunction');

			expect(typeof elapsed).toBe('number');
			expect(elapsed).toBeGreaterThan(0);
		});

		it('should return a number with 2 decimal places', () => {
			const start = timeStart();
			const elapsed = timeEnd(start, 'testFunction');

			// Check that it's a valid number (could be integer or have up to 2 decimals)
			const decimalStr = elapsed.toString();
			const decimalPart = decimalStr.split('.')[1];
			if (decimalPart) {
				expect(decimalPart.length).toBeLessThanOrEqual(2);
			}
		});

		it('should handle zero elapsed time', () => {
			const start = performance.now();
			// Call immediately
			const elapsed = timeEnd(start, 'instantFunction');

			expect(typeof elapsed).toBe('number');
			expect(elapsed).toBeGreaterThanOrEqual(0);
		});

		it('should work with various function names', () => {
			const start = timeStart();

			// Test with different function name formats
			expect(() => timeEnd(start, 'simpleFunction')).not.toThrow();
			expect(() => timeEnd(start, 'Module.method')).not.toThrow();
			expect(() => timeEnd(start, 'async-operation')).not.toThrow();
			expect(() => timeEnd(start, '')).not.toThrow();
		});
	});

	describe('integration', () => {
		it('should measure actual elapsed time accurately', async () => {
			const start = timeStart();

			// Use a promise-based delay for more accurate timing
			await new Promise((resolve) => setTimeout(resolve, 10));

			const elapsed = timeEnd(start, 'delayedOperation');

			// Should be around 10ms, allowing 5ms lower bound for system variance
			expect(elapsed).toBeGreaterThanOrEqual(5);
			expect(elapsed).toBeLessThan(100); // Sanity check upper bound
		});
	});
});
