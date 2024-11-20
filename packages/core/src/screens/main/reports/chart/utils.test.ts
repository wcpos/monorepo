// utils.test.ts

import { format } from 'date-fns';

import type { OrderDocument } from '@wcpos/database';

import { determineInterval, generateAllDates, aggregateData } from './utils';

describe('Chart Utils', () => {
	describe('determineInterval', () => {
		it('should return months interval when difference in days > 30', () => {
			const minDate = new Date('2023-01-01');
			const maxDate = new Date('2023-03-01');
			const result = determineInterval(minDate, maxDate);
			expect(result).toEqual({ format: 'yyyy-MM', interval: 'months' });
		});

		it('should return weeks interval when difference in weeks >= 1', () => {
			const minDate = new Date('2023-01-01');
			const maxDate = new Date('2023-01-15');
			const result = determineInterval(minDate, maxDate);
			expect(result).toEqual({ format: "yyyy-'W'ww", interval: 'weeks' });
		});

		it('should return days interval when difference in days > 1', () => {
			const minDate = new Date('2023-01-01');
			const maxDate = new Date('2023-01-03');
			const result = determineInterval(minDate, maxDate);
			expect(result).toEqual({ format: 'yyyy-MM-dd', interval: 'days' });
		});

		it('should return 6hours interval when difference in hours > 6', () => {
			const minDate = new Date('2023-01-01T00:00:00Z');
			const maxDate = new Date('2023-01-01T18:00:00Z');
			const result = determineInterval(minDate, maxDate);
			expect(result).toEqual({ format: 'yyyy-MM-dd HH', interval: '6hours' });
		});

		it('should return hours interval for other cases', () => {
			const minDate = new Date('2023-01-01T00:00:00Z');
			const maxDate = new Date('2023-01-01T05:00:00Z');
			const result = determineInterval(minDate, maxDate);
			expect(result).toEqual({ format: 'yyyy-MM-dd HH', interval: 'hours' });
		});
	});

	describe('generateAllDates', () => {
		it('should generate all months between two dates', () => {
			const minDate = new Date(2023, 0, 1);
			const maxDate = new Date(2023, 2, 1);
			const dates = generateAllDates(minDate, maxDate, 'months');
			expect(dates.map((d) => format(d, 'yyyy-MM'))).toEqual(['2023-01', '2023-02', '2023-03']);
		});

		it('should generate all weeks between two dates', () => {
			const minDate = new Date(2023, 0, 1);
			const maxDate = new Date(2023, 0, 15);
			const dates = generateAllDates(minDate, maxDate, 'weeks');
			expect(dates.map((d) => format(d, 'yyyy-MM-dd'))).toEqual([
				'2023-01-01',
				'2023-01-08',
				'2023-01-15',
			]);
		});

		it('should generate all days between two dates', () => {
			const minDate = new Date(2023, 0, 1);
			const maxDate = new Date(2023, 0, 3);
			const dates = generateAllDates(minDate, maxDate, 'days');
			expect(dates.map((d) => format(d, 'yyyy-MM-dd'))).toEqual([
				'2023-01-01',
				'2023-01-02',
				'2023-01-03',
			]);
		});

		it('should generate dates every 6 hours between two dates', () => {
			const minDate = new Date(2023, 0, 1, 0);
			const maxDate = new Date(2023, 0, 1, 18);
			const dates = generateAllDates(minDate, maxDate, '6hours');
			expect(dates.map((d) => format(d, 'yyyy-MM-dd HH'))).toEqual([
				'2023-01-01 00',
				'2023-01-01 06',
				'2023-01-01 12',
				'2023-01-01 18',
			]);
		});

		it('should generate dates every hour between two dates', () => {
			const minDate = new Date(2023, 0, 1, 0);
			const maxDate = new Date(2023, 0, 1, 3);
			const dates = generateAllDates(minDate, maxDate, 'hours');
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

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-01', total: 300, total_tax: 30, order_count: 2 },
				{ date: '2023-02', total: 150, total_tax: 15, order_count: 1 },
				{ date: '2023-03', total: 120, total_tax: 12, order_count: 1 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should fill in missing months with zeros', () => {
			const orders = [
				{ date_created_gmt: '2023-01-15T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-03-05T00:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-01', total: 100, total_tax: 10, order_count: 1 },
				{ date: '2023-02', total: 0, total_tax: 0, order_count: 0 },
				{ date: '2023-03', total: 120, total_tax: 12, order_count: 1 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should aggregate orders over weeks', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-03T00:00:00', total: '200', total_tax: '20' },
				{ date_created_gmt: '2023-01-08T00:00:00', total: '150', total_tax: '15' },
				{ date_created_gmt: '2023-01-15T00:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-W01', total: 300, total_tax: 30, order_count: 2 },
				{ date: '2023-W02', total: 150, total_tax: 15, order_count: 1 },
				{ date: '2023-W03', total: 120, total_tax: 12, order_count: 1 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should fill in missing weeks with zeros', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-15T00:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-W01', total: 100, total_tax: 10, order_count: 1 },
				{ date: '2023-W02', total: 0, total_tax: 0, order_count: 0 },
				{ date: '2023-W03', total: 120, total_tax: 12, order_count: 1 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should aggregate orders over days', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T12:00:00', total: '200', total_tax: '20' },
				{ date_created_gmt: '2023-01-02T00:00:00', total: '150', total_tax: '15' },
				{ date_created_gmt: '2023-01-03T00:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-01-01', total: 300, total_tax: 30, order_count: 2 },
				{ date: '2023-01-02', total: 150, total_tax: 15, order_count: 1 },
				{ date: '2023-01-03', total: 120, total_tax: 12, order_count: 1 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should fill in missing days with zeros', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-03T00:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-01-01', total: 100, total_tax: 10, order_count: 1 },
				{ date: '2023-01-02', total: 0, total_tax: 0, order_count: 0 },
				{ date: '2023-01-03', total: 120, total_tax: 12, order_count: 1 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should aggregate orders over 6-hour intervals', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T03:00:00', total: '200', total_tax: '20' },
				{ date_created_gmt: '2023-01-01T07:00:00', total: '150', total_tax: '15' },
				{ date_created_gmt: '2023-01-01T13:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-01-01 00', total: 300, total_tax: 30, order_count: 2 },
				{ date: '2023-01-01 06', total: 150, total_tax: 15, order_count: 1 },
				{ date: '2023-01-01 12', total: 120, total_tax: 12, order_count: 1 },
				{ date: '2023-01-01 18', total: 0, total_tax: 0, order_count: 0 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should fill in missing 6-hour intervals with zeros', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T13:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-01-01 00', total: 100, total_tax: 10, order_count: 1 },
				{ date: '2023-01-01 06', total: 0, total_tax: 0, order_count: 0 },
				{ date: '2023-01-01 12', total: 120, total_tax: 12, order_count: 1 },
				{ date: '2023-01-01 18', total: 0, total_tax: 0, order_count: 0 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should aggregate orders over hours', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T00:30:00', total: '200', total_tax: '20' },
				{ date_created_gmt: '2023-01-01T01:15:00', total: '150', total_tax: '15' },
				{ date_created_gmt: '2023-01-01T02:45:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-01-01 00', total: 300, total_tax: 30, order_count: 2 },
				{ date: '2023-01-01 01', total: 150, total_tax: 15, order_count: 1 },
				{ date: '2023-01-01 02', total: 120, total_tax: 12, order_count: 1 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should fill in missing hours with zeros', () => {
			const orders = [
				{ date_created_gmt: '2023-01-01T00:00:00', total: '100', total_tax: '10' },
				{ date_created_gmt: '2023-01-01T02:00:00', total: '120', total_tax: '12' },
			] as OrderDocument[];

			const result = aggregateData(orders);

			const expected = [
				{ date: '2023-01-01 00', total: 100, total_tax: 10, order_count: 1 },
				{ date: '2023-01-01 01', total: 0, total_tax: 0, order_count: 0 },
				{ date: '2023-01-01 02', total: 120, total_tax: 12, order_count: 1 },
			];

			expect(
				result.map(({ date, total, total_tax, order_count }) => ({
					date,
					total,
					total_tax,
					order_count,
				}))
			).toEqual(expected);
		});

		it('should handle empty orders array', () => {
			const orders = [] as OrderDocument[];
			const result = aggregateData(orders);
			expect(result).toEqual([]);
		});
	});
});
