// utils.test.ts

import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

import type { OrderDocument } from '@wcpos/database';

import { aggregateData, determineInterval, generateAllDates } from './utils';

import type { DateRange } from '../context';

// Mock the use-local-date module before importing utils
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (dateString: string) => new Date(dateString),
}));

describe('Chart Utils', () => {
	describe('determineInterval', () => {
		it('should return months interval when difference in days > 30', () => {
			const startDate = new Date('2023-01-01');
			const endDate = new Date('2023-03-01');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({ keyFormat: 'yyyy-MM', labelFormat: 'MMM yyyy', interval: 'months' });
		});

		it('should return days interval with day name and number when difference is 8-30 days', () => {
			const startDate = new Date('2023-01-01');
			const endDate = new Date('2023-01-15');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({ keyFormat: 'yyyy-MM-dd', labelFormat: 'EEE d', interval: 'days' });
		});

		it('should return days interval with day name, number and month when difference is 2-7 days', () => {
			const startDate = new Date('2023-01-01');
			const endDate = new Date('2023-01-03');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({ keyFormat: 'yyyy-MM-dd', labelFormat: 'EEE d MMM', interval: 'days' });
		});

		it('should return 6hours interval when difference in hours > 6', () => {
			const startDate = new Date('2023-01-01T00:00:00');
			const endDate = new Date('2023-01-01T18:00:00');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({ keyFormat: 'yyyy-MM-dd HH', labelFormat: 'HH:mm', interval: '6hours' });
		});

		it('should return hours interval for less than 6 hours', () => {
			const startDate = new Date('2023-01-01T00:00:00');
			const endDate = new Date('2023-01-01T05:00:00');
			const result = determineInterval(startDate, endDate);
			expect(result).toEqual({ keyFormat: 'yyyy-MM-dd HH', labelFormat: 'HH:mm', interval: 'hours' });
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

		it('should generate dates every 6 hours between two dates', () => {
			const startDate = new Date(2023, 0, 1, 0);
			const endDate = new Date(2023, 0, 1, 18);
			const dates = generateAllDates(startDate, endDate, '6hours');
			expect(dates.map((d) => format(d, 'yyyy-MM-dd HH'))).toEqual([
				'2023-01-01 00',
				'2023-01-01 06',
				'2023-01-01 12',
				'2023-01-01 18',
			]);
		});

		it('should generate dates every hour between two dates', () => {
			const startDate = new Date(2023, 0, 1, 0);
			const endDate = new Date(2023, 0, 1, 3);
			const dates = generateAllDates(startDate, endDate, 'hours');
			expect(dates.map((d) => format(d, 'yyyy-MM-dd HH'))).toEqual([
				'2023-01-01 00',
				'2023-01-01 01',
				'2023-01-01 02',
				'2023-01-01 03',
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
			expect(result[0]).toMatchObject({ key: '2023-01', label: 'Jan 2023', total: 300, total_tax: 30, order_count: 2 });
			expect(result[1]).toMatchObject({ key: '2023-02', label: 'Feb 2023', total: 150, total_tax: 15, order_count: 1 });
			expect(result[2]).toMatchObject({ key: '2023-03', label: 'Mar 2023', total: 120, total_tax: 12, order_count: 1 });
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
			expect(result[0]).toMatchObject({ key: '2023-01-01', label: 'Sun 1', total: 300, order_count: 2 });
			expect(result[4]).toMatchObject({ key: '2023-01-05', label: 'Thu 5', total: 150, order_count: 1 });
			expect(result[9]).toMatchObject({ key: '2023-01-10', label: 'Tue 10', total: 120, order_count: 1 });
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

		it('should aggregate orders over 6-hour intervals', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T03:00:00', total: '200', total_tax: '20' },
				{ date_created_gmt: '2023-01-01T07:00:00', total: '150', total_tax: '15' },
				{ date_created_gmt: '2023-01-01T18:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01T00:00:00'),
				end: new Date('2023-01-01T23:59:59'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(4);
			expect(result[0]).toMatchObject({ key: '2023-01-01 00', label: '00:00', total: 300, order_count: 2 });
			expect(result[1]).toMatchObject({ key: '2023-01-01 06', label: '06:00', total: 150, order_count: 1 });
			expect(result[2]).toMatchObject({ key: '2023-01-01 12', label: '12:00', total: 0, order_count: 0 });
			expect(result[3]).toMatchObject({ key: '2023-01-01 18', label: '18:00', total: 120, order_count: 1 });
		});  // Labels are same format (HH:mm)

		it('should fill in missing 6-hour intervals with zeros', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T18:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01T00:00:00'),
				end: new Date('2023-01-01T23:59:59'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(4);
			expect(result[0]).toMatchObject({ key: '2023-01-01 00', total: 100, order_count: 1 });
			expect(result[1]).toMatchObject({ key: '2023-01-01 06', total: 0, order_count: 0 });
			expect(result[2]).toMatchObject({ key: '2023-01-01 12', total: 0, order_count: 0 });
			expect(result[3]).toMatchObject({ key: '2023-01-01 18', total: 120, order_count: 1 });
		});

		it('should aggregate orders over hours', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T00:30:00', total: '200', total_tax: '20' },
				{ date_created_gmt: '2023-01-01T01:15:00', total: '150', total_tax: '15' },
				{ date_created_gmt: '2023-01-01T02:45:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01T00:00:00'),
				end: new Date('2023-01-01T02:59:59'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ key: '2023-01-01 00', label: '00:00', total: 300, order_count: 2 });
			expect(result[1]).toMatchObject({ key: '2023-01-01 01', label: '01:00', total: 150, order_count: 1 });
			expect(result[2]).toMatchObject({ key: '2023-01-01 02', label: '02:00', total: 120, order_count: 1 });
		});  // Labels are same format (HH:mm)

		it('should fill in missing hours with zeros', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T02:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const dateRange: DateRange = {
				start: new Date('2023-01-01T00:00:00'),
				end: new Date('2023-01-01T02:59:59'),
			};

			const result = aggregateData(orders, dateRange);

			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ key: '2023-01-01 00', total: 100, order_count: 1 });
			expect(result[1]).toMatchObject({ key: '2023-01-01 01', total: 0, order_count: 0 });
			expect(result[2]).toMatchObject({ key: '2023-01-01 02', total: 120, order_count: 1 });
		});

		it('should handle empty orders array', () => {
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
	});
});
