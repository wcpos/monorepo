import * as React from 'react';

import { tz, TZDate } from '@date-fns/tz';
import * as dates from 'date-fns';

import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../contexts/app-state';
import { resolveStoreTimezone } from '../screens/main/receipt/utils/resolve-store-timezone';
import { convertLocalDateToUTCString } from './use-local-date';

type CalendarDate = { year: number; month: number; day: number };
type DayRange = { from: Date; to: Date };
type DayAddition = { weeks?: number; months?: number };
type DayTimezone = { timezone: string; source: 'store' | 'site' | 'offset' | 'device' };

const probe = new Date(0);

/**
 * A zone this runtime can actually convert with. A synced record may carry a
 * non-IANA string, and a runtime without timezone data cannot resolve any name;
 * either way the candidate is skipped rather than thrown on at first use.
 */
function usableZone(zone: string): boolean {
	try {
		return !Number.isNaN(tz(zone)(probe).getTime());
	} catch {
		return false;
	}
}

const trimmed = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() ? value.trim() : null;

export function resolveDayTimezone(
	...[store, site]: Parameters<typeof resolveStoreTimezone>
): DayTimezone {
	const candidates: [DayTimezone['source'], string | null][] = [
		['store', trimmed(store?.timezone)],
		['site', trimmed(site?.timezone_string)],
		[
			'offset',
			site?.gmt_offset != null ? resolveStoreTimezone(null, { gmt_offset: site.gmt_offset }) : null,
		],
	];
	for (const [source, zone] of candidates) {
		if (zone && usableZone(zone)) return { timezone: zone, source };
	}
	return { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, source: 'device' };
}

/** Picker dates name device-local calendar days; months are one-based. */
export const calendarDate = (picked: Date): CalendarDate => ({
	year: picked.getFullYear(),
	month: picked.getMonth() + 1,
	day: picked.getDate(),
});
export const storeToday = (now: Date, zone: string): CalendarDate => calendarDate(tz(zone)(now));

export function storeDayBounds(day: CalendarDate, zone: string): DayRange {
	const date = new TZDate(day.year, day.month - 1, day.day, zone);
	return {
		from: new Date(dates.startOfDay(date, { in: tz(zone) })),
		to: new Date(dates.endOfDay(date, { in: tz(zone) })),
	};
}

export function storeDayPresets(now: Date, zone: string, weekStartsOn: dates.Day = 1) {
	const options = { in: tz(zone), weekStartsOn };
	const bounds = (from: Date, to = from): DayRange => ({
		from: storeDayBounds(storeToday(from, zone), zone).from,
		to: storeDayBounds(storeToday(to, zone), zone).to,
	});
	const lastWeek = dates.subWeeks(now, 1, options);
	const lastMonth = dates.subMonths(now, 1, options);
	return {
		today: bounds(now),
		yesterday: bounds(dates.subDays(now, 1, options)),
		thisWeek: bounds(dates.startOfWeek(now, options), dates.endOfWeek(now, options)),
		lastWeek: bounds(dates.startOfWeek(lastWeek, options), dates.endOfWeek(lastWeek, options)),
		thisMonth: bounds(dates.startOfMonth(now, options), dates.endOfMonth(now, options)),
		lastMonth: bounds(dates.startOfMonth(lastMonth, options), dates.endOfMonth(lastMonth, options)),
	};
}

export const storeRangeToFilter = ({ from, to }: DayRange) => ({
	from: convertLocalDateToUTCString(from),
	to: convertLocalDateToUTCString(to),
});
export const storeEndOfDayAfter = (now: Date, zone: string, amount: DayAddition): Date =>
	storeDayBounds(storeToday(dates.add(now, amount, { in: tz(zone) }), zone), zone).to;

const logger = getLogger(['wcpos', 'app', 'store-day']);
const loggedTimezones = new Set<string>();

export function useStoreDay() {
	const { site, store } = useAppState();
	const { timezone: storeTimezone } = store ?? {};
	const { timezone_string, gmt_offset } = site ?? {};
	const { timezone, source } = React.useMemo(
		() => resolveDayTimezone({ timezone: storeTimezone }, { timezone_string, gmt_offset }),
		[storeTimezone, timezone_string, gmt_offset]
	);
	// Logging is an external side effect; deduplicate across mounted consumers.
	React.useEffect(() => {
		if (loggedTimezones.has(timezone)) return;
		loggedTimezones.add(timezone);
		logger.info('Resolved store day timezone', { context: { timezone, source } });
	}, [timezone, source]);
	return React.useMemo(
		() => ({
			timezone,
			source,
			today: () => storeToday(new Date(), timezone),
			dayBounds: (day: CalendarDate) => storeDayBounds(day, timezone),
			presets: () => storeDayPresets(new Date(), timezone),
			rangeToFilter: storeRangeToFilter,
			endOfDayAfter: (amount: DayAddition) => storeEndOfDayAfter(new Date(), timezone, amount),
		}),
		[timezone, source]
	);
}
