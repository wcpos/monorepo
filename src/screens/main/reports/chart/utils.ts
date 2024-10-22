import {
	format,
	parseISO,
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

type Interval = 'months' | 'weeks' | 'days' | '6hours' | 'hours';

/**
 * we need to explicity add the Z to tell parseISO that the date is in UTC
 */
export const convertUTCStringToLocalDate = (dateString: string) => {
	const normalizedDateString = dateString.endsWith('Z') ? dateString : `${dateString}Z`;
	return parseISO(normalizedDateString);
};

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
		return { format: "yyyy-'W'ww", interval: 'weeks' }; // Aggregate by week
	} else if (diffInDays > 1) {
		return { format: 'yyyy-MM-dd', interval: 'days' }; // Aggregate by day
	} else if (diffInHours > 6) {
		return { format: 'yyyy-MM-dd HH', interval: '6hours' }; // Aggregate by 6 hours
	} else {
		return { format: 'yyyy-MM-dd HH', interval: 'hours' }; // Aggregate by hour
	}
};

export const generateAllDates = (minDate: Date, maxDate: Date, interval: Interval) => {
	if (interval === 'months') {
		return eachMonthOfInterval({ start: startOfMonth(minDate), end: maxDate });
	} else if (interval === 'weeks') {
		return eachWeekOfInterval({ start: startOfWeek(minDate), end: maxDate });
	} else if (interval === 'days') {
		return eachDayOfInterval({ start: startOfDay(minDate), end: maxDate });
	} else if (interval === '6hours') {
		const dates = [];
		for (let date = startOfHour(minDate); date <= maxDate; date = addHours(date, 6)) {
			dates.push(date);
		}
		return dates;
	} else {
		return eachHourOfInterval({ start: startOfHour(minDate), end: maxDate });
	}
};

/**
 *
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
		.map((order) => order.date_completed_gmt)
		.filter((date): date is string => date !== undefined)
		.map((date) => convertUTCStringToLocalDate(date));

	if (dates.length === 0) {
		// Return an empty array if there are no valid dates
		return [];
	}

	const minDate = min(dates);
	const maxDate = max(dates);
	const { format: dateFormat, interval } = determineInterval(minDate, maxDate);
	const allDates = generateAllDates(minDate, maxDate, interval);

	orders.forEach((order) => {
		const { date_completed_gmt, total, total_tax } = order; // Extract properties

		// Skip orders without a valid date?
		if (!date_completed_gmt) return;

		const date = convertUTCStringToLocalDate(date_completed_gmt);
		const key = format(date, dateFormat);

		if (!dataMap[key]) {
			dataMap[key] = { date: key, total: 0, total_tax: 0, order_count: 0, dateObj: date };
		}

		dataMap[key].total += parseFloat(total || '0');
		dataMap[key].total_tax += parseFloat(total_tax || '0');
		dataMap[key].order_count += 1;
	});

	// Fill in missing dates
	allDates.forEach((date) => {
		const key = format(date, dateFormat);
		if (!dataMap[key]) {
			dataMap[key] = { date: key, total: 0, total_tax: 0, order_count: 0, dateObj: date };
		}
	});

	return Object.values(dataMap).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
};
