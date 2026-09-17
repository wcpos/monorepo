import * as React from 'react';

import { tz, TZDate } from '@date-fns/tz';
import * as dates from 'date-fns';
import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import type { StoreDocument } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../contexts/app-state';
import { resolveStoreTimezone } from '../screens/main/receipt/utils/resolve-store-timezone';
import { convertLocalDateToUTCString } from './use-local-date';

import type { RxDocument } from 'rxdb';

type CalendarDate = { year: number; month: number; day: number };
type DayRange = { from: Date; to: Date };
type DayAddition = { weeks?: number; months?: number };
type DayTimezone = { timezone: string; source: 'store' | 'site' | 'offset' | 'device' };

export const DEVICE_ZONE = 'device' as const;

export function zoneOptions(zone: string): { in?: ReturnType<typeof tz> } {
	return zone === DEVICE_ZONE ? {} : { in: tz(zone) };
}

export function inZone(zone: string, date: Date): Date {
	return zone === DEVICE_ZONE ? new Date(date.getTime()) : tz(zone)(date);
}

const probe = new Date(0);

/**
 * A zone this runtime can actually convert with. A synced record may carry a
 * non-IANA string, and a runtime without timezone data cannot resolve any name;
 * either way the candidate is skipped rather than thrown on at first use.
 */
function usableZone(zone: string): boolean {
	// "-00:30": the library drops the sign on a negative zero hour and reads it as +00:30.
	// No real store sits at a negative sub-hour offset, so the candidate is skipped.
	if (/^-00:/.test(zone)) return false;
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
	// Keep the device zone by name when usable; otherwise bypass timezone conversion entirely.
	const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
	return { timezone: device && usableZone(device) ? device : DEVICE_ZONE, source: 'device' };
}

/** Picker dates name device-local calendar days; months are one-based. */
export const calendarDate = (picked: Date): CalendarDate => ({
	year: picked.getFullYear(),
	month: picked.getMonth() + 1,
	day: picked.getDate(),
});
export const storeToday = (now: Date, zone: string): CalendarDate =>
	calendarDate(inZone(zone, now));

export function storeDayBounds(day: CalendarDate, zone: string): DayRange {
	const date =
		zone === DEVICE_ZONE
			? new Date(day.year, day.month - 1, day.day)
			: new TZDate(day.year, day.month - 1, day.day, zone);
	return {
		from: new Date(dates.startOfDay(date, zoneOptions(zone))),
		to: new Date(dates.endOfDay(date, zoneOptions(zone))),
	};
}

export function storeDayPresets(now: Date, zone: string, weekStartsOn: dates.Day = 1) {
	const options = { ...zoneOptions(zone), weekStartsOn };
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
	storeDayBounds(storeToday(dates.add(now, amount, zoneOptions(zone)), zone), zone).to;

type FieldSource = Record<string, unknown>;

/**
 * A record field that follows the document: a store or site patched by a later sync (a
 * timezone edited in WP Admin) moves the zone without a reload. Only a live document has
 * an observable; a plain object (a hydration snapshot, a test double) is read directly.
 */
function useLiveField(source: FieldSource | null | undefined, key: string): string | undefined {
	const document =
		source && typeof source.$ === 'object' && source.$
			? (source as unknown as RxDocument<FieldSource>)
			: undefined;
	const live = useDocField(document, (value) => value[key]);
	const value = live ?? source?.[key];
	return typeof value === 'string' ? value : undefined;
}

const logger = getLogger(['wcpos', 'app', 'store-day']);
const loggedTimezones = new Set<string>();

const emptyViewedStores: StoreDocument[] = [];
const noViewedStores = of(emptyViewedStores);

export function useViewedStore(storeId?: number) {
	const { store, wpCredentials } = useAppState();
	const source = React.useMemo(
		() =>
			storeId !== undefined && storeId !== store?.id && wpCredentials
				? wpCredentials.populate$('stores')
				: noViewedStores,
		[storeId, store?.id, wpCredentials]
	);
	const stores = useObservableState(source, emptyViewedStores) as StoreDocument[];
	return storeId === undefined || storeId === store?.id
		? store
		: (stores.find((row) => row.id === storeId) ??
				// Legacy credentials may omit store zero; the bound store is the last resort.
				(storeId === 0 ? store : undefined));
}

export function useStoreDay(storeId?: number) {
	const { site } = useAppState();
	const store = useViewedStore(storeId);
	const storeTimezone = useLiveField(store as unknown as FieldSource | undefined, 'timezone');
	const timezone_string = useLiveField(
		site as unknown as FieldSource | undefined,
		'timezone_string'
	);
	const gmt_offset = useLiveField(site as unknown as FieldSource | undefined, 'gmt_offset');
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
