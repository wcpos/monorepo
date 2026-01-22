// utils.test.ts
//
// TIMEZONE HANDLING:
// ==================
// In production, order.date_created_gmt is a UTC string that gets converted to local time
// via convertUTCStringToLocalDate. The dateRange also comes from UTC strings converted
// to local time via the same function (in the reports context).
//
// For these tests, we use a simple mock that treats the timestamp as-is. This is safe
// because both dateRange and order dates use the same conversion, so the aggregation
// logic is tested correctly regardless of timezone.
//
// The actual UTC->local conversion is tested separately in use-local-date tests.

import { format } from 'date-fns';

import type { OrderDocument } from '@wcpos/database';

import {
	aggregateData,
	determineInterval,
	generateAllDates,
	getEffectiveDailyRange,
	getNiceMinuteInterval,
	getOrderTimeBounds,
	getStartOfMinuteInterval,
} from './utils';

import type { DateRange } from '../context';

// Simple mock - treats timestamps as-is (consistent with how dateRange is created in tests)
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (dateString: string) => new Date(dateString),
}));

describe('Chart Utils', () => {
	describe('getNiceMinuteInterval', () => {
		it('should return 30 for spans <= 6 hours (360 min / 12 = 30)', () => {
			expect(getNiceMinuteInterval(360)).toBe(30);
			expect(getNiceMinuteInterval(300)).toBe(30);
			expect(getNiceMinuteInterval(180)).toBe(30);
		});

		it('should return 60 for spans around 7-12 hours', () => {
			expect(getNiceMinuteInterval(420)).toBe(60); // 7 hours, needs 35 min intervals -> 60
			expect(getNiceMinuteInterval(720)).toBe(60); // 12 hours, needs 60 min intervals -> 60
		});

		it('should return 90 for spans around 13-18 hours', () => {
			expect(getNiceMinuteInterval(780)).toBe(90); // 13 hours, needs 65 min -> 90
			expect(getNiceMinuteInterval(1080)).toBe(90); // 18 hours, needs 90 min -> 90
		});

		it('should return 120 for spans around 19-24 hours', () => {
			expect(getNiceMinuteInterval(1140)).toBe(120); // 19 hours, needs 95 min -> 120
			expect(getNiceMinuteInterval(1440)).toBe(120); // 24 hours, needs 120 min -> 120
		});

		it('should return 30 for zero or negative spans', () => {
			expect(getNiceMinuteInterval(0)).toBe(30);
			expect(getNiceMinuteInterval(-100)).toBe(30);
		});

		it('should return 360 (6 hours) for very large spans', () => {
			expect(getNiceMinuteInterval(5000)).toBe(360);
		});
	});

	describe('getStartOfMinuteInterval', () => {
		it('should align to 30-minute boundaries', () => {
			const date1 = new Date(2023, 0, 1, 10, 15);
			expect(getStartOfMinuteInterval(date1, 30)).toEqual(new Date(2023, 0, 1, 10, 0));

			const date2 = new Date(2023, 0, 1, 10, 45);
			expect(getStartOfMinuteInterval(date2, 30)).toEqual(new Date(2023, 0, 1, 10, 30));
		});

		it('should align to 60-minute (hourly) boundaries', () => {
			const date1 = new Date(2023, 0, 1, 10, 30);
			expect(getStartOfMinuteInterval(date1, 60)).toEqual(new Date(2023, 0, 1, 10, 0));

			const date2 = new Date(2023, 0, 1, 10, 59);
			expect(getStartOfMinuteInterval(date2, 60)).toEqual(new Date(2023, 0, 1, 10, 0));
		});

		it('should align to 90-minute boundaries', () => {
			const date1 = new Date(2023, 0, 1, 10, 0); // 600 min, 600/90 = 6.67 -> floor to 6*90 = 540 = 9:00
			expect(getStartOfMinuteInterval(date1, 90)).toEqual(new Date(2023, 0, 1, 9, 0));

			const date2 = new Date(2023, 0, 1, 12, 0); // 720 min, 720/90 = 8 -> 8*90 = 720 = 12:00
			expect(getStartOfMinuteInterval(date2, 90)).toEqual(new Date(2023, 0, 1, 12, 0));
		});

		it('should align to 120-minute (2 hour) boundaries', () => {
			const date1 = new Date(2023, 0, 1, 11, 30);
			expect(getStartOfMinuteInterval(date1, 120)).toEqual(new Date(2023, 0, 1, 10, 0));

			const date2 = new Date(2023, 0, 1, 14, 0);
			expect(getStartOfMinuteInterval(date2, 120)).toEqual(new Date(2023, 0, 1, 14, 0));
		});
	});

	describe('getOrderTimeBounds', () => {
		it('should return null for empty orders array', () => {
			expect(getOrderTimeBounds([])).toBeNull();
		});

		it('should return null if no orders have valid dates', () => {
			const orders = [
				{ date_created_gmt: null },
				{ date_created_gmt: undefined },
			] as OrderDocument[];
			expect(getOrderTimeBounds(orders)).toBeNull();
		});

		it('should return earliest and latest order times', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T10:30:00' },
				{ date_created_gmt: '2023-01-01T08:00:00' },
				{ date_created_gmt: '2023-01-01T14:45:00' },
			] as OrderDocument[];

			const bounds = getOrderTimeBounds(orders);
			expect(bounds).not.toBeNull();
			expect(bounds!.earliest).toEqual(new Date('2023-01-01T08:00:00'));
			expect(bounds!.latest).toEqual(new Date('2023-01-01T14:45:00'));
		});

		it('should handle single order', () => {
			const orders = [{ date_created_gmt: '2023-01-01T12:00:00' }] as OrderDocument[];

			const bounds = getOrderTimeBounds(orders);
			expect(bounds).not.toBeNull();
			expect(bounds!.earliest).toEqual(new Date('2023-01-01T12:00:00'));
			expect(bounds!.latest).toEqual(new Date('2023-01-01T12:00:00'));
		});
	});

	describe('getEffectiveDailyRange', () => {
		it('should return full day when no orders', () => {
			const dateRange: DateRange = {
				start: new Date('2023-01-01T00:00:00'),
				end: new Date('2023-01-01T23:59:59'),
			};

			const result = getEffectiveDailyRange(dateRange, []);

			expect(result.start).toEqual(new Date('2023-01-01T00:00:00'));
			expect(result.end.getHours()).toBe(23);
		});

		it('should trim to order bounds (expanded to hour boundaries)', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T10:30:00' },
				{ date_created_gmt: '2023-01-01T14:15:00' },
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01T00:00:00'),
				end: new Date('2023-01-01T23:59:59'),
			};

			const result = getEffectiveDailyRange(dateRange, orders);

			// Should expand to 10:00 - 15:00 (hour boundaries: start of earliest hour, 1hr after latest hour)
			expect(result.start).toEqual(new Date('2023-01-01T10:00:00'));
			expect(result.end).toEqual(new Date('2023-01-01T15:00:00'));
		});
	});

	describe('determineInterval', () => {
		it('should return months interval when difference in days > 30', () => {
			const startDate = new Date('2023-01-01');
			const endDate = new Date('2023-03-01');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({
				keyFormat: 'yyyy-MM',
				labelFormat: 'MMM yyyy',
				interval: 'months',
			});
		});

		it('should return days interval with day name and number when difference is 8-30 days', () => {
			const startDate = new Date('2023-01-01');
			const endDate = new Date('2023-01-15');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({
				keyFormat: 'yyyy-MM-dd',
				labelFormat: 'EEE d',
				interval: 'days',
			});
		});

		it('should return days interval with day name, number and month when difference is 2-7 days', () => {
			const startDate = new Date('2023-01-01');
			const endDate = new Date('2023-01-03');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({
				keyFormat: 'yyyy-MM-dd',
				labelFormat: 'EEE d MMM',
				interval: 'days',
			});
		});

		it('should return minutes interval with 120min step for full day (24 hours)', () => {
			const startDate = new Date('2023-01-01T00:00:00');
			const endDate = new Date('2023-01-01T23:59:59');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({
				keyFormat: 'yyyy-MM-dd HH:mm',
				labelFormat: 'HH:mm',
				interval: 'minutes',
				minuteStep: 120,
			});
		});

		it('should return minutes interval with 30min step for short spans (< 6 hours)', () => {
			const startDate = new Date('2023-01-01T10:00:00');
			const endDate = new Date('2023-01-01T14:00:00');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({
				keyFormat: 'yyyy-MM-dd HH:mm',
				labelFormat: 'HH:mm',
				interval: 'minutes',
				minuteStep: 30,
			});
		});
	});

	describe('generateAllDates', () => {
		it('should generate all months between two dates', () => {
			const startDate = new Date(2023, 0, 1);
			const endDate = new Date(2023, 2, 1);
			const dates = generateAllDates(startDate, endDate, 'months');
			expect(dates.map((d) => format(d, 'yyyy-MM'))).toEqual(['2023-01', '2023-02', '2023-03']);
		});

		it('should generate all days between two dates', () => {
			const startDate = new Date(2023, 0, 1);
			const endDate = new Date(2023, 0, 3);
			const dates = generateAllDates(startDate, endDate, 'days');
			expect(dates.map((d) => format(d, 'yyyy-MM-dd'))).toEqual([
				'2023-01-01',
				'2023-01-02',
				'2023-01-03',
			]);
		});

		it('should generate 30-minute intervals', () => {
			const startDate = new Date(2023, 0, 1, 10, 0);
			const endDate = new Date(2023, 0, 1, 12, 0);
			const dates = generateAllDates(startDate, endDate, 'minutes', 30);
			// Uses < condition, so endpoint is excluded
			expect(dates.map((d) => format(d, 'HH:mm'))).toEqual([
				'10:00',
				'10:30',
				'11:00',
				'11:30',
			]);
		});

		it('should generate 60-minute (hourly) intervals', () => {
			const startDate = new Date(2023, 0, 1, 10, 0);
			const endDate = new Date(2023, 0, 1, 14, 0);
			const dates = generateAllDates(startDate, endDate, 'minutes', 60);
			// Uses < condition, so endpoint is excluded
			expect(dates.map((d) => format(d, 'HH:mm'))).toEqual([
				'10:00',
				'11:00',
				'12:00',
				'13:00',
			]);
		});

		it('should generate 120-minute (2 hour) intervals', () => {
			const startDate = new Date(2023, 0, 1, 0, 0);
			const endDate = new Date(2023, 0, 1, 8, 0);
			const dates = generateAllDates(startDate, endDate, 'minutes', 120);
			// Uses < condition, so endpoint is excluded
			expect(dates.map((d) => format(d, 'HH:mm'))).toEqual([
				'00:00',
				'02:00',
				'04:00',
				'06:00',
			]);
		});
	});

	describe('aggregateData', () => {
		it('should aggregate orders over months', () => {
			const orders = [
				{ date_created_gmt: '2023-01-15T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-20T00:00:00', total: '200', total_tax: '20' },
				{ date_created_gmt: '2023-02-10T00:00:00', total: '150', total_tax: '15' },
				{ date_created_gmt: '2023-03-05T00:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01'),
				end: new Date('2023-03-31'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({
				key: '2023-01',
				label: 'Jan 2023',
				total: 300,
				total_tax: 30,
				order_count: 2,
			});
			expect(result[1]).toMatchObject({
				key: '2023-02',
				label: 'Feb 2023',
				total: 150,
				total_tax: 15,
				order_count: 1,
			});
			expect(result[2]).toMatchObject({
				key: '2023-03',
				label: 'Mar 2023',
				total: 120,
				total_tax: 12,
				order_count: 1,
			});
		});

		it('should fill in missing months with zeros', () => {
			const orders = [
				{ date_created_gmt: '2023-01-15T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-03-05T00:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01'),
				end: new Date('2023-03-31'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ key: '2023-01', total: 100, order_count: 1 });
			expect(result[1]).toMatchObject({ key: '2023-02', total: 0, order_count: 0 });
			expect(result[2]).toMatchObject({ key: '2023-03', total: 120, order_count: 1 });
		});

		it('should aggregate orders over days with day name and number for 8-30 day range', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T12:00:00', total: '200', total_tax: '20' },
				{ date_created_gmt: '2023-01-05T00:00:00', total: '150', total_tax: '15' },
				{ date_created_gmt: '2023-01-10T00:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01'),
				end: new Date('2023-01-10'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(10);
			expect(result[0]).toMatchObject({
				key: '2023-01-01',
				label: 'Sun 1',
				total: 300,
				order_count: 2,
			});
			expect(result[4]).toMatchObject({
				key: '2023-01-05',
				label: 'Thu 5',
				total: 150,
				order_count: 1,
			});
			expect(result[9]).toMatchObject({
				key: '2023-01-10',
				label: 'Tue 10',
				total: 120,
				order_count: 1,
			});
		});

		it('should aggregate orders over days with day name, number and month for 2-7 day range', () => {
			const orders = [
				{ date_created_gmt: '2023-01-02T00:00:00', total: '100', total_tax: '10' }, // Monday
				{ date_created_gmt: '2023-01-03T00:00:00', total: '200', total_tax: '20' }, // Tuesday
				{ date_created_gmt: '2023-01-04T00:00:00', total: '150', total_tax: '15' }, // Wednesday
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-02'),
				end: new Date('2023-01-04'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ key: '2023-01-02', label: 'Mon 2 Jan', total: 100 });
			expect(result[1]).toMatchObject({ key: '2023-01-03', label: 'Tue 3 Jan', total: 200 });
			expect(result[2]).toMatchObject({ key: '2023-01-04', label: 'Wed 4 Jan', total: 150 });
		});

		it('should fill in missing days with zeros', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-03T00:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01'),
				end: new Date('2023-01-03'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ key: '2023-01-01', total: 100, order_count: 1 });
			expect(result[1]).toMatchObject({ key: '2023-01-02', total: 0, order_count: 0 });
			expect(result[2]).toMatchObject({ key: '2023-01-03', total: 120, order_count: 1 });
		});

		describe('single-day reports with order-based trimming', () => {
			it('should trim to order bounds and use 30-minute intervals for short spans', () => {
				const orders = [
					{ date_created_gmt: '2023-01-01T10:15:00', total: '100', total_tax: '10' },
					{ date_created_gmt: '2023-01-01T10:45:00', total: '200', total_tax: '20' },
					{ date_created_gmt: '2023-01-01T12:30:00', total: '150', total_tax: '15' },
					{ date_created_gmt: '2023-01-01T13:45:00', total: '120', total_tax: '12' },
				] as OrderDocument[];

				const dateRange: DateRange = {
					start: new Date('2023-01-01T00:00:00'),
					end: new Date('2023-01-01T23:59:59'),
				};

				const result = aggregateData(orders, dateRange);

				// Orders span 10:15 to 13:45
				// - effectiveStart: 10:00 (start of hour containing first order)
				// - effectiveEnd: 14:00 (1 hour after start of hour containing last order)
				// - Last order at 13:45 falls into 13:30 bucket, so 13:30 is last interval needed
				expect(result.length).toBeLessThanOrEqual(12);
				expect(result[0]).toMatchObject({ label: '10:00' });
				expect(result[result.length - 1]).toMatchObject({ label: '13:30' });
			});

			it('should aggregate orders in 30-minute buckets', () => {
				const orders = [
					{ date_created_gmt: '2023-01-01T10:00:00', total: '100', total_tax: '10' },
					{ date_created_gmt: '2023-01-01T10:20:00', total: '50', total_tax: '5' },
					{ date_created_gmt: '2023-01-01T10:35:00', total: '200', total_tax: '20' },
					{ date_created_gmt: '2023-01-01T11:00:00', total: '120', total_tax: '12' },
				] as OrderDocument[];

				const dateRange: DateRange = {
					start: new Date('2023-01-01T00:00:00'),
					end: new Date('2023-01-01T23:59:59'),
				};

				const result = aggregateData(orders, dateRange);

				// Find the 10:00 bucket (should have orders at 10:00 and 10:20)
				const bucket1000 = result.find((d) => d.label === '10:00');
				expect(bucket1000).toMatchObject({ total: 150, order_count: 2 });

				// Find the 10:30 bucket (should have order at 10:35)
				const bucket1030 = result.find((d) => d.label === '10:30');
				expect(bucket1030).toMatchObject({ total: 200, order_count: 1 });

				// Find the 11:00 bucket
				const bucket1100 = result.find((d) => d.label === '11:00');
				expect(bucket1100).toMatchObject({ total: 120, order_count: 1 });
			});

			it('should use larger intervals for longer spans (e.g., 8am-6pm)', () => {
				const orders = [
					{ date_created_gmt: '2023-01-01T08:00:00', total: '100', total_tax: '10' },
					{ date_created_gmt: '2023-01-01T18:00:00', total: '200', total_tax: '20' },
				] as OrderDocument[];

				const dateRange: DateRange = {
					start: new Date('2023-01-01T00:00:00'),
					end: new Date('2023-01-01T23:59:59'),
				};

				const result = aggregateData(orders, dateRange);

				// 8:00 to 19:00 = 11 hours = 660 minutes
				// 660 / 12 = 55 -> rounds up to 60 minute intervals
				// At 60 min: 08:00, 09:00, ..., 19:00 = 12 intervals
				expect(result.length).toBeLessThanOrEqual(12);

				// Check that intervals are 60 minutes apart
				const firstLabel = result[0].label;
				const secondLabel = result[1]?.label;
				expect(firstLabel).toBe('08:00');
				expect(secondLabel).toBe('09:00');
			});

			it('should show full day with 2-hour intervals when no orders', () => {
				const orders = [] as OrderDocument[];

				const dateRange: DateRange = {
					start: new Date('2023-01-01T00:00:00'),
					end: new Date('2023-01-01T23:59:59'),
				};

				const result = aggregateData(orders, dateRange);

				// Full day = 24 hours = 1440 minutes
				// 1440 / 12 = 120 -> 2 hour intervals
				// At 120 min: 00:00, 02:00, 04:00, ..., 22:00 = 12 intervals
				expect(result.length).toBe(12);
				expect(result[0]).toMatchObject({ label: '00:00', total: 0, order_count: 0 });
				expect(result[1]).toMatchObject({ label: '02:00' });
			});
		});

		it('should handle empty orders array with multi-day range', () => {
			const orders = [] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01'),
				end: new Date('2023-01-03'),
			};

			const result = aggregateData(orders, dateRange);

			// Should still return the date range filled with zeros
			expect(result).toHaveLength(3);
			expect(result.every((d) => d.total === 0 && d.order_count === 0)).toBe(true);
		});

		it('should ignore orders outside the date range', () => {
			const orders = [
				{ date_created_gmt: '2022-12-31T00:00:00', total: '100', total_tax: '10' }, // Before range
				{ date_created_gmt: '2023-01-02T00:00:00', total: '200', total_tax: '20' }, // In range
				{ date_created_gmt: '2023-01-04T00:00:00', total: '150', total_tax: '15' }, // After range
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01'),
				end: new Date('2023-01-03'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ key: '2023-01-01', total: 0, order_count: 0 });
			expect(result[1]).toMatchObject({ key: '2023-01-02', total: 200, order_count: 1 });
			expect(result[2]).toMatchObject({ key: '2023-01-03', total: 0, order_count: 0 });
		});

		describe('timezone handling consistency', () => {
			/**
			 * These tests verify that order dates are consistently converted via
			 * convertUTCStringToLocalDate before aggregation.
			 *
			 * Key invariant: both dateRange and order dates use the same conversion
			 * function, so they're always in the same timezone (local time).
			 */

			it('should find orders when date range and orders use same conversion', () => {
				// In production, both come from UTC strings converted via convertUTCStringToLocalDate
				// The mock ensures consistency - if either path was different, orders would be missed
				const orders = [
					{ date_created_gmt: '2023-01-01T10:30:00', total: '100', total_tax: '10' },
				] as OrderDocument[];

				const dateRange: DateRange = {
					start: new Date('2023-01-01T00:00:00'),
					end: new Date('2023-01-01T23:59:59'),
				};

				const result = aggregateData(orders, dateRange);

				// Order should be found and aggregated correctly
				const orderBucket = result.find((d) => d.order_count > 0);
				expect(orderBucket).toBeDefined();
				expect(orderBucket?.total).toBe(100);
			});

			it('should bucket multi-day orders by their date', () => {
				const orders = [
					{ date_created_gmt: '2023-01-01T10:15:00', total: '100', total_tax: '10' },
					{ date_created_gmt: '2023-01-02T14:30:00', total: '200', total_tax: '20' },
				] as OrderDocument[];

				const dateRange: DateRange = {
					start: new Date('2023-01-01'),
					end: new Date('2023-01-03'),
				};

				const result = aggregateData(orders, dateRange);

				// Multi-day uses daily buckets
				const day1 = result.find((d) => d.key === '2023-01-01');
				const day2 = result.find((d) => d.key === '2023-01-02');

				expect(day1).toMatchObject({ total: 100, order_count: 1 });
				expect(day2).toMatchObject({ total: 200, order_count: 1 });
			});

			it('should use isSameDay for single-day detection (calendar day comparison)', () => {
				// A range within the same calendar day should use minute-based intervals
				const orders = [
					{ date_created_gmt: '2023-01-01T14:00:00', total: '100', total_tax: '10' },
				] as OrderDocument[];

				const dateRange: DateRange = {
					start: new Date('2023-01-01T00:00:00'),
					end: new Date('2023-01-01T23:59:59'),
				};

				const result = aggregateData(orders, dateRange);

				// Single-day reports use time-based labels like "14:00", not date labels like "Sun 1"
				expect(result[0].label).toMatch(/^\d{2}:\d{2}$/);
			});
		});
	});
});
