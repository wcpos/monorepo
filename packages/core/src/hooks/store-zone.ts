import { tz } from '@date-fns/tz';

/** The sentinel for "format in the device's own zone, no conversion". */
export const DEVICE_ZONE = 'device' as const;

export function zoneOptions(zone: string): { in?: ReturnType<typeof tz> } {
	return zone === DEVICE_ZONE ? {} : { in: tz(zone) };
}

export function inZone(zone: string, date: Date): Date {
	return zone === DEVICE_ZONE ? new Date(date.getTime()) : tz(zone)(date);
}
