import {
	format,
	eachDayOfInterval,
	eachHourOfInterval,
	eachWeekOfInterval,
	eachMonthOfInterval,
	addHours,
	startOfWeek,
	startOfMonth,
	startOfDay,
	startOfHour,
	min,
	max,
	differenceInDays,
	differenceInHours,
	differenceInWeeks,
} from 'date-fns';

import type { OrderDocument } from '@wcpos/database';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';

type Interval = 'months' | 'weeks' | 'days' | '2hours' | 'hours';

/**
 * Get the start of the 2 hour interval for a given date
 * @param date - The date to get the start of the interval for
 * @returns The start of the 2 hour interval
 */
export const getStartOf2HourInterval = (date: Date): Date => {
	const hours = date.getHours();
	const intervalStartHour = Math.floor(hours / 2) * 2; // Nearest even hour
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), intervalStartHour, 0, 0, 0);
};

/**
 * Determine the appropriate interval for the given date range
 * @param minDate - The start date of the range
 * @param maxDate - The end date of the range
 * @returns An object containing the date format and interval
 *
 * @NOTE - the interval format is used for the key and the display, so be careful that they
 * will produce a unique value for each date range.
 */
export const determineInterval = (
	minDate: Date,
	maxDate: Date
): { format: string; interval: Interval } => {
	const diffInDays = differenceInDays(maxDate, minDate);
	const diffInHours = differenceInHours(maxDate, minDate);
	const diffInWeeks = differenceInWeeks(maxDate, minDate);

	if (diffInDays > 30) {
		return { format: 'yyyy-MM', interval: 'months' }; // Aggregate by month
	} else if (diffInWeeks >= 1) {
		return { format: 'yyyy-MM-dd', interval: 'weeks' }; // Aggregate by week
	} else if (diffInDays > 1) {
		return { format: 'yyyy-MM-dd', interval: 'days' }; // Aggregate by day
	} else if (diffInHours > 10) {
		return { format: "HH':00'", interval: '2hours' }; // Aggregate by 2 hours
	} else {
		return { format: "HH':00'", interval: 'hours' }; // Aggregate by hour
	}
};

export const generateDateIntervals = (minDate: Date, maxDate: Date, interval: Interval): Date[] => {
	if (interval === 'months') {
		return eachMonthOfInterval({ start: startOfMonth(minDate), end: maxDate });
	} else if (interval === 'weeks') {
		return eachWeekOfInterval(
			{ start: startOfWeek(minDate, { weekStartsOn: 1 }), end: maxDate },
			{ weekStartsOn: 1 }
		);
	} else if (interval === 'days') {
		return eachDayOfInterval({ start: startOfDay(minDate), end: maxDate });
	} else if (interval === '2hours') {
		const dates = [];
		let date = getStartOf2HourInterval(minDate);
		while (date <= maxDate) {
			dates.push(date);
			date = addHours(date, 2);
		}
		return dates;
	} else {
		return eachHourOfInterval({ start: startOfHour(minDate), end: maxDate });
	}
};

/**
 * Aggregate order data by date
 * @param orders - The orders to aggregate
 * @returns An array of aggregated order data
 */
export const aggregateData = (orders: OrderDocument[]) => {
	const dataMap: {
		[key: string]: {
			date: string;
			total: number;
			total_tax: number;
			order_count: number;
			dateObj: Date;
		};
	} = {};

	// Ensure we filter out orders without a valid date
	const dates = orders
		.map((order) => order.date_created_gmt)
		.filter((date): date is string => date !== undefined)
		.map((date) => convertUTCStringToLocalDate(date));

	if (dates.length === 0) {
		// Return an empty array if there are no valid dates
		return [];
	}

	const minDate = min(dates);
	const maxDate = max(dates);
	const { format: dateFormat, interval } = determineInterval(minDate, maxDate);
	const dateIntervals = generateDateIntervals(minDate, maxDate, interval);

	orders.forEach((order) => {
		const { date_created_gmt, total, total_tax } = order; // Extract properties

		// Skip orders without a valid date?
		if (!date_created_gmt) return;

		let date = convertUTCStringToLocalDate(date_created_gmt);

		// Special cases for intervals
		if (interval === 'weeks') {
			date = startOfWeek(date, { weekStartsOn: 1 });
		} else if (interval === '2hours') {
			date = getStartOf2HourInterval(date);
		}

		// This key should match a value in dateIntervals
		const key = format(date, dateFormat);

		if (!dataMap[key]) {
			dataMap[key] = { date: key, total: 0, total_tax: 0, order_count: 0, dateObj: date };
		}

		dataMap[key].total += parseFloat(total || '0');
		dataMap[key].total_tax += parseFloat(total_tax || '0');
		dataMap[key].order_count += 1;
	});

	// Fill in missing dates
	dateIntervals.forEach((date) => {
		const key = format(date, dateFormat);
		if (!dataMap[key]) {
			dataMap[key] = { date: key, total: 0, total_tax: 0, order_count: 0, dateObj: date };
		}
	});

	return Object.values(dataMap).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
};
