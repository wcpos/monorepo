import * as dateFns from 'date-fns';
import {
	addDays,
	addMinutes,
	differenceInDays,
	differenceInMinutes,
	eachDayOfInterval,
	eachMonthOfInterval,
	format,
	isSameDay,
	subMonths,
} from 'date-fns';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { inZone, zoneOptions } from '../../../../hooks/use-store-day';

import type { Locale } from 'date-fns/locale';
import type { DateRange, OrderPayload } from '../context';

export type Interval = 'months' | 'days' | 'minutes';

export interface IntervalConfig {
	keyFormat: string;
	labelFormat: string;
	interval: Interval;
	minuteStep?: number; // Only used when interval === 'minutes'
}

export interface AggregatedDataPoint {
	key: number; // The instant is the identity; repeated wall-clock labels remain distinct.
	label: string; // Display label for x-axis
	total: number; // Order total (includes tax)
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
 * Find the earliest and latest order times from a list of orders.
 * @param orders - The orders to scan
 * @returns Object with earliest and latest dates, or null if no valid orders
 */
export const getOrderTimeBounds = (
	orders: OrderPayload[]
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
		return {
			keyFormat: 'yyyy-MM',
			labelFormat: 'MMM yyyy',
			interval: 'months',
		};
	} else if (diffInDays > 7) {
		// 8-30 days: show day name and day number
		return { keyFormat: 'yyyy-MM-dd', labelFormat: 'EEE d', interval: 'days' };
	} else if (diffInDays > 1) {
		// 2-7 days: show day name, day number, and month
		return {
			keyFormat: 'yyyy-MM-dd',
			labelFormat: 'EEE d MMM',
			interval: 'days',
		};
	} else {
		// Single day: use minute-based intervals
		const spanMinutes = differenceInMinutes(endDate, startDate);
		const minuteStep = getNiceMinuteInterval(spanMinutes);
		return {
			keyFormat: 'yyyy-MM-dd HH:mm',
			labelFormat: 'HH:mm',
			interval: 'minutes',
			minuteStep,
		};
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
	minuteStep: number | undefined,
	zone: string
): Date[] => {
	if (interval === 'months') {
		return eachMonthOfInterval({ start: startDate, end: endDate }, zoneOptions(zone));
	} else if (interval === 'days') {
		return eachDayOfInterval({ start: startDate, end: endDate }, zoneOptions(zone));
	} else {
		// Minute-based intervals
		const step = minuteStep ?? 60; // Default to 1 hour if not specified
		const dates: Date[] = [];
		const midnight = dateFns.startOfDay(startDate, zoneOptions(zone)).getTime();
		let date = new Date(
			midnight + Math.floor((+startDate - midnight) / (step * 60_000)) * step * 60_000
		);
		// Use < instead of <= to avoid generating an empty interval at the exact end time
		while (date < endDate) {
			dates.push(date);
			date = addMinutes(date.getTime(), step);
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
	orders: OrderPayload[],
	zone: string
): { start: Date; end: Date } => {
	const bounds = getOrderTimeBounds(orders);

	if (!bounds) {
		// No orders - use full day with reasonable business hours fallback
		return {
			start: dateFns.startOfDay(dateRange.start, zoneOptions(zone)),
			end: dateFns.endOfDay(dateRange.start, zoneOptions(zone)),
		};
	}

	// Expand to interval boundaries (start of hour for earliest, end of hour for latest)
	// Subtract the wall-clock minute offset from the instant; setting hours loses the second fold.
	const hour = (date: Date) => {
		const wall = inZone(zone, date);
		return new Date(
			+date - ((wall.getMinutes() * 60 + wall.getSeconds()) * 1000 + wall.getMilliseconds())
		);
	};
	const start = hour(bounds.earliest);
	// Add 1 hour to include the hour containing the last sale
	const end = addMinutes(+hour(bounds.latest), 60);

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
	orders: OrderPayload[],
	dateRange: DateRange,
	locale: Locale | undefined,
	zone: string,
	comparison?: { orders: OrderPayload[]; range: DateRange },
	period?: 'day' | 'week' | 'month'
): AggregatedDataPoint[] => {
	const valid = orders.filter((order) => {
		const time = order.date_created_gmt && +convertUTCStringToLocalDate(order.date_created_gmt);
		return (
			typeof time === 'number' &&
			time >= +dateFns.startOfDay(dateRange.start, zoneOptions(zone)) &&
			time <= +dateFns.endOfDay(dateRange.end, zoneOptions(zone))
		);
	});
	const offset = +dateRange.start - +(comparison?.range.start ?? dateRange.start);
	const shifted = (comparison?.orders ?? []).flatMap((order) => {
		const time =
			order.date_created_gmt && +convertUTCStringToLocalDate(order.date_created_gmt) + offset;
		return typeof time === 'number' && time >= +dateRange.start && time <= +dateRange.end
			? [{ ...order, date_created_gmt: new Date(time).toISOString() }]
			: [];
	});
	const daily = isSameDay(dateRange.start, dateRange.end, zoneOptions(zone));
	const effective = daily
		? getEffectiveDailyRange(dateRange, [...valid, ...shifted], zone)
		: dateRange;
	const config = determineInterval(inZone(zone, effective.start), inZone(zone, effective.end));
	// Calendar equality, not elapsed hours, decides whether a DST day is a day.
	const interval = daily
		? 'minutes'
		: period || config.interval === 'minutes'
			? 'days'
			: config.interval;
	const dates = generateAllDates(effective.start, effective.end, interval, config.minuteStep, zone);
	const values = sumBuckets(
		valid,
		dates.map(Number),
		dates.map((_, i) => +(dates[i + 1] ?? dateRange.end) + (i === dates.length - 1 ? 1 : 0))
	);
	return dates.map((date, i) => ({
		key: +date,
		label: format(
			inZone(zone, date),
			interval === 'days' && config.interval !== 'days' ? 'EEE d' : config.labelFormat,
			{ locale }
		),
		...values[i],
		dateObj: date,
	}));
};

/** Assign to the greatest boundary not after the instant, bounded by that interval's end. */
function sumBuckets(orders: OrderPayload[], starts: (number | null)[], ends: number[]) {
	const values = starts.map(() => ({ total: 0, order_count: 0 }));
	for (const order of orders) {
		if (!order.date_created_gmt) continue;
		const time = +convertUTCStringToLocalDate(order.date_created_gmt);
		for (let i = starts.length - 1; i >= 0; i--) {
			const start = starts[i];
			if (start !== null && time >= start && time < ends[i]) {
				values[i].total += Number(order.total || 0);
				values[i].order_count++;
				break;
			}
		}
	}
	return values;
}

/** The period owns the grid. Missing counterparts are null, never invented zero sales. */
export function aggregateComparison(
	orders: OrderPayload[],
	comparisonRange: DateRange,
	buckets: AggregatedDataPoint[],
	dateRange: DateRange,
	period: 'day' | 'week' | 'month',
	zone: string
) {
	const offset = +dateRange.start - +comparisonRange.start;
	const dates = buckets.map((bucket) =>
		period === 'month'
			? subMonths(bucket.dateObj, 1, zoneOptions(zone))
			: new Date(bucket.key - offset)
	);
	const starts = dates.map((date, i) => {
		const matches =
			period !== 'month' ||
			inZone(zone, date).getDate() === inZone(zone, buckets[i].dateObj).getDate();
		return matches && +date >= +comparisonRange.start && +date <= +comparisonRange.end
			? +date
			: null;
	});
	const last = buckets.at(-1);
	const gridEnd =
		period === 'day' && last
			? Math.min(
					+dateRange.end + 1,
					last.key + (last.key - (buckets.at(-2)?.key ?? last.key - 30 * 60_000))
				)
			: +dateRange.end + 1;
	const ends = dates.map((date, i) =>
		Math.min(
			+comparisonRange.end + 1,
			period === 'month'
				? +addDays(date, 1, zoneOptions(zone))
				: (buckets[i + 1]?.key ?? gridEnd) - offset
		)
	);
	const values = sumBuckets(orders, starts, ends);
	return buckets.map((bucket, i) => ({
		...bucket,
		...values[i],
		total: starts[i] === null ? null : values[i].total,
	}));
}
