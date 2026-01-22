import {
	addMinutes,
	differenceInDays,
	differenceInMinutes,
	eachDayOfInterval,
	eachMonthOfInterval,
	format,
	isSameDay,
	startOfDay,
	startOfHour,
	startOfMonth,
} from 'date-fns';

import type { OrderDocument } from '@wcpos/database';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';

import type { Locale } from 'date-fns/locale';
import type { DateRange } from '../context';

export type Interval = 'months' | 'days' | 'minutes';

export interface IntervalConfig {
	keyFormat: string;
	labelFormat: string;
	interval: Interval;
	minuteStep?: number; // Only used when interval === 'minutes'
}

export interface AggregatedDataPoint {
	key: string; // Unique identifier for data aggregation
	label: string; // Display label for x-axis
	total: number; // Order total (includes tax)
	total_tax: number; // Tax portion
	subtotal: number; // Total minus tax (for stacked bar display)
	order_count: number;
	dateObj: Date;
}

/**
 * Nice interval steps in minutes for single-day reports.
 * These provide clean boundaries for chart display.
 */
const NICE_MINUTE_INTERVALS = [30, 60, 90, 120, 180, 240, 300, 360] as const;

/**
 * Maximum number of interval steps for single-day reports.
 */
const MAX_DAILY_STEPS = 12;

/**
 * Get the smallest "nice" minute interval that keeps total steps <= maxSteps.
 * @param spanMinutes - The total time span in minutes
 * @param maxSteps - Maximum number of intervals (default 12)
 * @returns The minute interval to use (30, 60, 90, 120, etc.)
 */
export const getNiceMinuteInterval = (
	spanMinutes: number,
	maxSteps: number = MAX_DAILY_STEPS
): number => {
	if (spanMinutes <= 0) return NICE_MINUTE_INTERVALS[0];

	const idealInterval = spanMinutes / maxSteps;

	// Find the smallest nice interval that's >= idealInterval
	for (const nice of NICE_MINUTE_INTERVALS) {
		if (nice >= idealInterval) {
			return nice;
		}
	}

	// If span is very large, use the maximum (6 hours)
	return NICE_MINUTE_INTERVALS[NICE_MINUTE_INTERVALS.length - 1];
};

/**
 * Get the start of a minute-based interval for a given date.
 * @param date - The date to align to interval boundary
 * @param minuteStep - The interval size in minutes (30, 60, 90, etc.)
 * @returns The start of the interval containing the date
 */
export const getStartOfMinuteInterval = (date: Date, minuteStep: number): Date => {
	const totalMinutes = date.getHours() * 60 + date.getMinutes();
	const intervalStartMinutes = Math.floor(totalMinutes / minuteStep) * minuteStep;
	const hours = Math.floor(intervalStartMinutes / 60);
	const minutes = intervalStartMinutes % 60;
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
};

/**
 * Find the earliest and latest order times from a list of orders.
 * @param orders - The orders to scan
 * @returns Object with earliest and latest dates, or null if no valid orders
 */
export const getOrderTimeBounds = (
	orders: OrderDocument[]
): { earliest: Date; latest: Date } | null => {
	let earliest: Date | null = null;
	let latest: Date | null = null;

	for (const order of orders) {
		if (!order.date_created_gmt) continue;
		const date = convertUTCStringToLocalDate(order.date_created_gmt);
		if (!earliest || date < earliest) earliest = date;
		if (!latest || date > latest) latest = date;
	}

	if (!earliest || !latest) return null;
	return { earliest, latest };
};

/**
 * Determine the appropriate interval for the given date range
 * @param startDate - The start date of the range
 * @param endDate - The end date of the range
 * @returns An object containing the key format, label format, interval type, and optional minute step
 *
 * | Range       | Interval | Key Format         | Label Format   | Example Label |
 * |-------------|----------|--------------------|----------------|---------------|
 * | >30 days    | months   | yyyy-MM            | MMM yyyy       | "Jan 2025"    |
 * | 8-30 days   | days     | yyyy-MM-dd         | EEE d          | "Mon 8"       |
 * | 2-7 days    | days     | yyyy-MM-dd         | EEE d MMM      | "Mon 8 Dec"   |
 * | <=1 day     | minutes  | yyyy-MM-dd HH:mm   | HH:mm          | "14:00"       |
 *
 * For single-day reports, minuteStep is calculated to keep intervals <= 12 steps,
 * with a minimum of 30 minutes.
 */
export const determineInterval = (startDate: Date, endDate: Date): IntervalConfig => {
	const diffInDays = differenceInDays(endDate, startDate);

	if (diffInDays > 30) {
		// More than a month: show months with year
		return { keyFormat: 'yyyy-MM', labelFormat: 'MMM yyyy', interval: 'months' };
	} else if (diffInDays > 7) {
		// 8-30 days: show day name and day number
		return { keyFormat: 'yyyy-MM-dd', labelFormat: 'EEE d', interval: 'days' };
	} else if (diffInDays > 1) {
		// 2-7 days: show day name, day number, and month
		return { keyFormat: 'yyyy-MM-dd', labelFormat: 'EEE d MMM', interval: 'days' };
	} else {
		// Single day: use minute-based intervals
		const spanMinutes = differenceInMinutes(endDate, startDate);
		const minuteStep = getNiceMinuteInterval(spanMinutes);
		return { keyFormat: 'yyyy-MM-dd HH:mm', labelFormat: 'HH:mm', interval: 'minutes', minuteStep };
	}
};

/**
 * Generate all date intervals for the given range
 * @param startDate - The start date of the range
 * @param endDate - The end date of the range
 * @param interval - The interval type ('months', 'days', or 'minutes')
 * @param minuteStep - The minute step size (only used when interval === 'minutes')
 * @returns Array of dates representing each interval
 */
export const generateAllDates = (
	startDate: Date,
	endDate: Date,
	interval: Interval,
	minuteStep?: number
): Date[] => {
	if (interval === 'months') {
		return eachMonthOfInterval({ start: startOfMonth(startDate), end: endDate });
	} else if (interval === 'days') {
		return eachDayOfInterval({ start: startOfDay(startDate), end: endDate });
	} else {
		// Minute-based intervals
		const step = minuteStep ?? 60; // Default to 1 hour if not specified
		const dates: Date[] = [];
		let date = getStartOfMinuteInterval(startDate, step);
		// Use < instead of <= to avoid generating an empty interval at the exact end time
		while (date < endDate) {
			dates.push(date);
			date = addMinutes(date, step);
		}
		return dates;
	}
};

/**
 * For single-day reports, calculate the effective time range based on order data.
 * Trims empty hours before first sale and after last sale.
 * Falls back to full day if no orders.
 *
 * @param dateRange - The original date range
 * @param orders - The orders to consider
 * @returns Effective start and end dates for the chart
 */
export const getEffectiveDailyRange = (
	dateRange: DateRange,
	orders: OrderDocument[]
): { start: Date; end: Date } => {
	const bounds = getOrderTimeBounds(orders);

	if (!bounds) {
		// No orders - use full day with reasonable business hours fallback
		return {
			start: startOfDay(dateRange.start),
			end: new Date(
				dateRange.start.getFullYear(),
				dateRange.start.getMonth(),
				dateRange.start.getDate(),
				23,
				59,
				59
			),
		};
	}

	// Expand to interval boundaries (start of hour for earliest, end of hour for latest)
	const start = startOfHour(bounds.earliest);
	// Add 1 hour to include the hour containing the last sale
	const end = addMinutes(startOfHour(bounds.latest), 60);

	return { start, end };
};

/**
 * Aggregate order data by date
 * @param orders - The orders to aggregate
 * @param dateRange - The full date range to display (determines interval and fills gaps)
 * @param locale - Optional date-fns locale for localized labels
 * @returns An array of aggregated order data with display labels
 *
 * For single-day reports:
 * - Trims empty hours before first sale and after last sale
 * - Uses dynamic minute intervals (30min, 60min, etc.) to keep max 12 steps
 */
export const aggregateData = (
	orders: OrderDocument[],
	dateRange: DateRange,
	locale?: Locale
): AggregatedDataPoint[] => {
	const { start: originalStart, end: originalEnd } = dateRange;

	let effectiveStart = originalStart;
	let effectiveEnd = originalEnd;

	// For single-day reports, trim to order bounds and use minute-based intervals
	// Use isSameDay for explicit calendar day comparison (avoids edge cases with time ranges)
	if (isSameDay(originalStart, originalEnd)) {
		const effectiveRange = getEffectiveDailyRange(dateRange, orders);
		effectiveStart = effectiveRange.start;
		effectiveEnd = effectiveRange.end;
	}

	const { keyFormat, labelFormat, interval, minuteStep } = determineInterval(
		effectiveStart,
		effectiveEnd
	);
	const dateIntervals = generateAllDates(effectiveStart, effectiveEnd, interval, minuteStep);

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
			subtotal: 0,
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
		if (interval === 'minutes' && minuteStep) {
			date = getStartOfMinuteInterval(date, minuteStep);
		}
		// For 'days' and 'months', the format itself handles the bucketing

		const key = format(date, keyFormat);

		// Only add if the key exists in our intervals (within the date range)
		if (dataMap[key]) {
			const orderTotal = parseFloat(total || '0');
			const orderTax = parseFloat(total_tax || '0');
			dataMap[key].total += orderTotal;
			dataMap[key].total_tax += orderTax;
			dataMap[key].subtotal += orderTotal - orderTax;
			dataMap[key].order_count += 1;
		}
	});

	return Object.values(dataMap).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
};
