import { endOfDay, startOfDay } from 'date-fns';
import { tz } from '@date-fns/tz';

import {
	calendarDate,
	resolveDayTimezone,
	storeDayBounds,
	storeDayPresets,
	storeEndOfDayAfter,
	storeRangeToFilter,
	storeToday,
} from './use-store-day';

jest.mock('../contexts/app-state', () => ({}));
jest.mock('./use-locale', () => ({}));

const now = new Date('2026-09-17T03:00:00Z');
const zone = 'Europe/London';

describe('store calendar days', () => {
	it('names the store calendar day in the store zone, whatever zone the device is in', () => {
		// 03:00Z is 17:00 on the 17th at UTC+14 and 16:00 on the 16th at UTC-11; no device zone
		// can agree with both, so a helper that read the device clock fails one of these.
		expect(storeToday(now, 'Pacific/Kiritimati')).toEqual({ year: 2026, month: 9, day: 17 });
		expect(storeToday(now, 'Pacific/Pago_Pago')).toEqual({ year: 2026, month: 9, day: 16 });
		expect(storeToday(now, zone)).toEqual({ year: 2026, month: 9, day: 17 });
		const bounds = storeDayBounds(storeToday(now, zone), zone);
		expect(bounds.from.toISOString()).toBe('2026-09-16T23:00:00.000Z');
		expect(bounds.to.toISOString()).toBe('2026-09-17T22:59:59.999Z');
		expect(bounds.from.constructor).toBe(Date);
		expect(storeRangeToFilter(bounds)).toEqual({
			from: '2026-09-16T23:00:00',
			to: '2026-09-17T22:59:59',
		});
	});

	it('keeps a picked calendar date rather than interpreting it as now', () => {
		const picked = new Date(2026, 8, 16, 20);
		expect(calendarDate(picked)).toEqual({ year: 2026, month: 9, day: 16 });
		expect(storeDayBounds(calendarDate(picked), zone).from.toISOString()).toBe(
			'2026-09-15T23:00:00.000Z'
		);
	});

	it('resolves store, site and fractional offset in precedence order', () => {
		const site = { timezone_string: ' Europe/London ', gmt_offset: '5.5' };
		expect(resolveDayTimezone({ timezone: ' Asia/Tokyo ' }, site)).toEqual({
			timezone: 'Asia/Tokyo',
			source: 'store',
		});
		expect(resolveDayTimezone({}, site)).toEqual({ timezone: zone, source: 'site' });
		const resolved = resolveDayTimezone({}, { gmt_offset: '5.5' });
		expect(resolved).toEqual({ timezone: '+05:30', source: 'offset' });
		const bounds = storeDayBounds({ year: 2026, month: 9, day: 17 }, resolved.timezone);
		expect(bounds.from.toISOString()).toBe('2026-09-16T18:30:00.000Z');
		expect(bounds.to.toISOString()).toBe('2026-09-17T18:29:59.999Z');
		expect(resolveDayTimezone({}, { gmt_offset: '0' })).toEqual({
			timezone: 'UTC',
			source: 'offset',
		});
	});

	it('skips a configured zone this runtime cannot convert with and carries on down the chain', () => {
		expect(resolveDayTimezone({ timezone: 'Invalid/Zone' }, { timezone_string: zone })).toEqual({
			timezone: zone,
			source: 'site',
		});
		expect(
			resolveDayTimezone({ timezone: 'Invalid/Zone' }, { timezone_string: 'Nowhere/Town' })
		).toEqual({
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			source: 'device',
		});
	});

	it('uses device bounds only when site timezone fields are absent', () => {
		const resolved = resolveDayTimezone({}, {});
		expect(resolved).toEqual({
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			source: 'device',
		});
		expect(storeDayBounds(storeToday(now, resolved.timezone), resolved.timezone)).toEqual({
			from: startOfDay(now),
			to: endOfDay(now),
		});
	});

	it('builds store presets with Monday weeks and calendar months', () => {
		const presets = storeDayPresets(now, zone);
		expect(presets.today).toEqual(storeDayBounds(storeToday(now, zone), zone));
		expect(presets.thisWeek.from.toISOString()).toBe('2026-09-13T23:00:00.000Z');
		expect(tz(zone)(presets.thisWeek.from).getDay()).toBe(1);
		expect(tz(zone)(presets.thisWeek.from).getHours()).toBe(0);
		expect(presets.yesterday.from.toISOString()).toBe('2026-09-15T23:00:00.000Z');
		expect(presets.lastWeek.to.toISOString()).toBe('2026-09-13T22:59:59.999Z');
		expect(presets.thisMonth.from.toISOString()).toBe('2026-08-31T23:00:00.000Z');
		expect(presets.lastMonth.to.toISOString()).toBe('2026-08-31T22:59:59.999Z');
	});

	it('expires at the end of the store day one week or month later', () => {
		expect(storeEndOfDayAfter(now, zone, { weeks: 1 }).toISOString()).toBe(
			'2026-09-24T22:59:59.999Z'
		);
		expect(storeEndOfDayAfter(now, zone, { months: 1 }).toISOString()).toBe(
			'2026-10-17T22:59:59.999Z'
		);
	});

	it.each([
		[3, 29, '2026-03-29T00:00:00.000Z', '2026-03-29T22:59:59.999Z'],
		[10, 25, '2026-10-24T23:00:00.000Z', '2026-10-25T23:59:59.999Z'],
	])('respects London DST on %i/%i', (month, day, from, to) => {
		const bounds = storeDayBounds({ year: 2026, month, day }, zone);
		expect(bounds.from.toISOString()).toBe(from);
		expect(bounds.to.toISOString()).toBe(to);
	});
});
