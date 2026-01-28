/**
 * @jest-environment node
 *
 * Tests for findClosestPoint - a binary search algorithm that finds
 * the index of the closest value in a sorted array.
 *
 * This is used in chart interactions to find the nearest data point
 * to where the user is touching/hovering.
 */
import { findClosestPoint } from './findClosestPoint';

describe('findClosestPoint', () => {
	describe('empty and single element arrays', () => {
		it('should return null for empty array', () => {
			expect(findClosestPoint([], 5)).toBeNull();
		});

		it('should return 0 for single element array', () => {
			expect(findClosestPoint([10], 5)).toBe(0);
			expect(findClosestPoint([10], 10)).toBe(0);
			expect(findClosestPoint([10], 15)).toBe(0);
		});
	});

	describe('boundary conditions', () => {
		it('should return 0 when target is less than or equal to first element', () => {
			const arr = [10, 20, 30, 40, 50];
			expect(findClosestPoint(arr, 5)).toBe(0); // Less than first
			expect(findClosestPoint(arr, 10)).toBe(0); // Equal to first
			expect(findClosestPoint(arr, -100)).toBe(0); // Way below
		});

		it('should return last index when target is greater than or equal to last element', () => {
			const arr = [10, 20, 30, 40, 50];
			expect(findClosestPoint(arr, 55)).toBe(4); // Greater than last
			expect(findClosestPoint(arr, 50)).toBe(4); // Equal to last
			expect(findClosestPoint(arr, 1000)).toBe(4); // Way above
		});
	});

	describe('exact matches', () => {
		it('should return exact index when target matches an element', () => {
			const arr = [10, 20, 30, 40, 50];
			expect(findClosestPoint(arr, 10)).toBe(0);
			expect(findClosestPoint(arr, 20)).toBe(1);
			expect(findClosestPoint(arr, 30)).toBe(2);
			expect(findClosestPoint(arr, 40)).toBe(3);
			expect(findClosestPoint(arr, 50)).toBe(4);
		});
	});

	describe('finding closest (between elements)', () => {
		it('should return index of closer element when target is between two', () => {
			const arr = [10, 20, 30, 40, 50];

			// 14 is closer to 10 (distance 4) than 20 (distance 6)
			expect(findClosestPoint(arr, 14)).toBe(0);

			// 16 is closer to 20 (distance 4) than 10 (distance 6)
			expect(findClosestPoint(arr, 16)).toBe(1);

			// 25 is equidistant - getClosest returns second (higher) index
			expect(findClosestPoint(arr, 25)).toBe(2);

			// 35 is equidistant - should return higher index
			expect(findClosestPoint(arr, 35)).toBe(3);
		});

		it('should handle values close to midpoint', () => {
			const arr = [0, 100];

			// 49 is closer to 0 (distance 49) than 100 (distance 51)
			expect(findClosestPoint(arr, 49)).toBe(0);

			// 51 is closer to 100 (distance 49) than 0 (distance 51)
			expect(findClosestPoint(arr, 51)).toBe(1);

			// 50 is equidistant - returns higher index
			expect(findClosestPoint(arr, 50)).toBe(1);
		});
	});

	describe('various array sizes', () => {
		it('should work with 2 elements', () => {
			const arr = [10, 20];
			expect(findClosestPoint(arr, 12)).toBe(0);
			expect(findClosestPoint(arr, 18)).toBe(1);
		});

		it('should work with 3 elements', () => {
			const arr = [10, 20, 30];
			expect(findClosestPoint(arr, 12)).toBe(0);
			expect(findClosestPoint(arr, 18)).toBe(1);
			expect(findClosestPoint(arr, 22)).toBe(1);
			expect(findClosestPoint(arr, 28)).toBe(2);
		});

		it('should work with large arrays', () => {
			// Create array [0, 10, 20, ..., 990, 1000]
			const arr = Array.from({ length: 101 }, (_, i) => i * 10);

			expect(findClosestPoint(arr, 0)).toBe(0);
			expect(findClosestPoint(arr, 1000)).toBe(100);
			expect(findClosestPoint(arr, 505)).toBe(51); // Closer to 510
			expect(findClosestPoint(arr, 495)).toBe(50); // Closer to 500
			expect(findClosestPoint(arr, 333)).toBe(33); // Closer to 330
		});
	});

	describe('non-uniform spacing', () => {
		it('should handle non-uniformly spaced arrays', () => {
			const arr = [1, 5, 10, 50, 100, 500, 1000];

			// 3 is equidistant from 1 (dist 2) and 5 (dist 2) - tie goes to higher index
			expect(findClosestPoint(arr, 3)).toBe(1);
			// 7 is closer to 5 (dist 2) than to 10 (dist 3)
			expect(findClosestPoint(arr, 7)).toBe(1);
			// 8 is closer to 10 (dist 2) than to 5 (dist 3)
			expect(findClosestPoint(arr, 8)).toBe(2);
			// 75 is equidistant from 50 (dist 25) and 100 (dist 25) - tie goes to higher
			expect(findClosestPoint(arr, 75)).toBe(4);
			// 300 is equidistant from 100 (dist 200) and 500 (dist 200) - tie goes to higher
			expect(findClosestPoint(arr, 300)).toBe(5);
		});
	});

	describe('negative numbers', () => {
		it('should work with negative numbers', () => {
			const arr = [-50, -20, 0, 20, 50];

			expect(findClosestPoint(arr, -100)).toBe(0); // Below range
			expect(findClosestPoint(arr, -35)).toBe(1); // Equidistant (15) from -50 and -20, tie goes to higher
			expect(findClosestPoint(arr, -36)).toBe(0); // Closer to -50 (14) than -20 (16)
			expect(findClosestPoint(arr, -30)).toBe(1); // Closer to -20 (10) than -50 (20)
			expect(findClosestPoint(arr, -10)).toBe(2); // Equidistant from -20 and 0, tie goes to higher
			expect(findClosestPoint(arr, 100)).toBe(4); // Above range
		});
	});

	describe('floating point numbers', () => {
		it('should work with floating point numbers', () => {
			const arr = [0.1, 0.5, 1.0, 1.5, 2.0];

			// 0.75 is equidistant (0.25) from 0.5 and 1.0 - tie goes to higher index
			expect(findClosestPoint(arr, 0.75)).toBe(2);
			// 0.31 is closer to 0.5 (0.19) than 0.1 (0.21)
			expect(findClosestPoint(arr, 0.31)).toBe(1);
			// 0.29 is closer to 0.1 (0.19) than 0.5 (0.21)
			expect(findClosestPoint(arr, 0.29)).toBe(0);
			// 1.25 is equidistant from 1.0 and 1.5
			expect(findClosestPoint(arr, 1.25)).toBe(3); // Tie goes to higher
			// 1.76 is closer to 2.0 (0.24) than 1.5 (0.26)
			expect(findClosestPoint(arr, 1.76)).toBe(4);
		});
	});

	describe('timestamp-like values', () => {
		it('should work with timestamp values (typical chart use case)', () => {
			// Simulating hourly data points
			const baseTime = 1700000000000; // Some timestamp
			const arr = [
				baseTime,
				baseTime + 3600000, // +1 hour
				baseTime + 7200000, // +2 hours
				baseTime + 10800000, // +3 hours
			];

			// Target is 30 minutes (1800000ms) - exactly half, tie goes to higher index
			expect(findClosestPoint(arr, baseTime + 1800000)).toBe(1);

			// Target is 29 minutes into first hour (closer to start)
			expect(findClosestPoint(arr, baseTime + 1740000)).toBe(0);

			// Target is 31 minutes into first hour (closer to 1-hour mark)
			expect(findClosestPoint(arr, baseTime + 1860000)).toBe(1);
		});
	});

	describe('edge cases with identical values', () => {
		it('should handle array with identical values', () => {
			const arr = [10, 10, 10, 10];
			expect(findClosestPoint(arr, 10)).toBe(0);
			expect(findClosestPoint(arr, 5)).toBe(0);
			expect(findClosestPoint(arr, 15)).toBe(3);
		});
	});
});
