import { format, parseISO, subDays } from 'date-fns';

import { useT } from '../contexts/translations';
import { convertUTCStringToLocalDate, useLocalDate } from './use-local-date';
import { inZone, useStoreDay, zoneOptions } from './use-store-day';

export function useStoreDayLabel(storeId?: number) {
	const { timezone } = useStoreDay(storeId);
	const { dateFnsLocale: locale } = useLocalDate();
	const t = useT();
	const options = { ...zoneOptions(timezone), locale };
	const today = format(new Date(), 'yyyy-MM-dd', options);
	const yesterday = format(subDays(inZone(timezone, new Date()), 1), 'yyyy-MM-dd');
	// Business-day stamps are calendar dates, not UTC instants.
	const date = (iso: string) =>
		iso.length === 10 ? parseISO(iso) : inZone(timezone, convertUTCStringToLocalDate(iso));
	const key = (iso: string) => (iso.length === 10 ? iso : format(date(iso), 'yyyy-MM-dd'));
	const relative = (iso: string) =>
		key(iso) === today ? t('common.today') : key(iso) === yesterday ? t('common.yesterday') : null;
	const day = (iso: string) => relative(iso) ?? format(date(iso), 'EEE d MMM', { locale });
	const time = (iso: string) => format(date(iso), 'HH:mm', { locale });
	return {
		heading: (iso: string) => relative(iso) ?? format(date(iso), 'EEEE, d MMM yyyy', { locale }),
		dateTime: (iso: string) => `${day(iso)} · ${time(iso)}`,
		day,
		time,
	};
}
