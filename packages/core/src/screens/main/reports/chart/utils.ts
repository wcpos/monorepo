import {
	addHours,
	differenceInDays,
	differenceInHours,
	eachDayOfInterval,
	eachHourOfInterval,
	eachMonthOfInterval,
	format,
	startOfDay,
	startOfHour,
	startOfMonth,
} from 'date-fns';

import type { Locale } from 'date-fns/locale';
import type { OrderDocument } from '@wcpos/database';

import type { DateRange } from '../context';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';

export type Interval = 'months' | 'days' | '6hours' | 'hours';

export interface AggregatedDataPoint {
	key: string; // Unique identifier for data aggregation
	label: string; // Display label for x-axis
	total: number;
	total_tax: number;
	order_count: number;
	dateObj: Date;
}

/**
 * Get the start of the 6 hour interval for a given date
 * @param date - The date to get the start of the interval for
 * @returns The start of the 6 hour interval
 */
export const getStartOf6HourInterval = (date: Date): Date => {
	const hours = date.getHours();
	const intervalStartHour = Math.floor(hours / 6) * 6; // Nearest 6-hour boundary (0, 6, 12, 18)
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), intervalStartHour, 0, 0, 0);
};

/**
 * Determine the appropriate interval for the given date range
 * @param startDate - The start date of the range
 * @param endDate - The end date of the range
 * @returns An object containing the key format, label format, and interval type
 *
 * | Range       | Interval | Key Format      | Label Format   | Example Label |
 * |-------------|----------|-----------------|----------------|---------------|
 * | >30 days    | months   | yyyy-MM         | MMM yyyy       | "Jan 2025"    |
 * | 8-30 days   | days     | yyyy-MM-dd      | EEE d          | "Mon 8"       |
 * | 2-7 days    | days     | yyyy-MM-dd      | EEE d MMM      | "Mon 8 Dec"   |
 * | 1 day       | 6hours   | yyyy-MM-dd HH   | HH:mm          | "14:00"       |
 * | <1 day      | hours    | yyyy-MM-dd HH   | HH:mm          | "14:00"       |
 */
export const determineInterval = (
	startDate: Date,
	endDate: Date
): { keyFormat: string; labelFormat: string; interval: Interval } => {
	const diffInDays = differenceInDays(endDate, startDate);
	const diffInHours = differenceInHours(endDate, startDate);

	if (diffInDays > 30) {
		// More than a month: show months with year
		return { keyFormat: 'yyyy-MM', labelFormat: 'MMM yyyy', interval: 'months' };
	} else if (diffInDays > 7) {
		// 8-30 days: show day name and day number
		return { keyFormat: 'yyyy-MM-dd', labelFormat: 'EEE d', interval: 'days' };
	} else if (diffInDays > 1) {
		// 2-7 days: show day name, day number, and month
		return { keyFormat: 'yyyy-MM-dd', labelFormat: 'EEE d MMM', interval: 'days' };
	} else if (diffInHours > 6) {
		// Single day with many hours: show 6-hour intervals
		return { keyFormat: 'yyyy-MM-dd HH', labelFormat: 'HH:mm', interval: '6hours' };
	} else {
		// Less than 6 hours: show hourly
		return { keyFormat: 'yyyy-MM-dd HH', labelFormat: 'HH:mm', interval: 'hours' };
	}
};

/**
 * Generate all date intervals for the given range
 */
export const generateAllDates = (startDate: Date, endDate: Date, interval: Interval): Date[] => {
	if (interval === 'months') {
		return eachMonthOfInterval({ start: startOfMonth(startDate), end: endDate });
	} else if (interval === 'days') {
		return eachDayOfInterval({ start: startOfDay(startDate), end: endDate });
	} else if (interval === '6hours') {
		const dates: Date[] = [];
		let date = getStartOf6HourInterval(startDate);
		while (date <= endDate) {
			dates.push(date);
			date = addHours(date, 6);
		}
		return dates;
	} else {
		return eachHourOfInterval({ start: startOfHour(startDate), end: endDate });
	}
};

/**
 * Aggregate order data by date
 * @param orders - The orders to aggregate
 * @param dateRange - The full date range to display (determines interval and fills gaps)
 * @param locale - Optional date-fns locale for localized labels
 * @returns An array of aggregated order data with display labels
 */
export const aggregateData = (
	orders: OrderDocument[],
	dateRange: DateRange,
	locale?: Locale
): AggregatedDataPoint[] => {
	const { start: startDate, end: endDate } = dateRange;
	const { keyFormat, labelFormat, interval } = determineInterval(startDate, endDate);
	const dateIntervals = generateAllDates(startDate, endDate, interval);

	const dataMap: { [key: string]: AggregatedDataPoint } = {};

	// Initialize all intervals with zero values
	dateIntervals.forEach((date) => {
		const key = format(date, keyFormat);
		const label = format(date, labelFormat, { locale });
		dataMap[key] = {
			key,
			label,
			total: 0,
			total_tax: 0,
			order_count: 0,
			dateObj: date,
		};
	});

	// Aggregate orders into the appropriate intervals
	orders.forEach((order) => {
		const { date_created_gmt, total, total_tax } = order;

		// Skip orders without a valid date
		if (!date_created_gmt) return;

		let date = convertUTCStringToLocalDate(date_created_gmt);

		// Bucket the date into the appropriate interval
		if (interval === '6hours') {
			date = getStartOf6HourInterval(date);
		}
		// For 'days' and 'months', the format itself handles the bucketing

		const key = format(date, keyFormat);

		// Only add if the key exists in our intervals (within the date range)
		if (dataMap[key]) {
			dataMap[key].total += parseFloat(total || '0');
			dataMap[key].total_tax += parseFloat(total_tax || '0');
			dataMap[key].order_count += 1;
		}
	});

	return Object.values(dataMap).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
};
