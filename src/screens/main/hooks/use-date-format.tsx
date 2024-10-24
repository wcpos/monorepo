import * as React from 'react';

import { UTCDate, utc } from '@date-fns/utc';
import {
	parseISO,
	format,
	differenceInMinutes,
	differenceInHours,
	isToday,
	isValid,
	formatDistance,
} from 'date-fns';
import * as Locales from 'date-fns/locale';
import { useObservableState } from 'observable-hooks';
import { switchMap, map, filter } from 'rxjs/operators';

import { useHeartbeatObservable } from '@wcpos/hooks/src/use-heartbeat';
import { usePageVisibility } from '@wcpos/hooks/src/use-page-visibility';

import { useT } from '../../../contexts/translations';
import { useLocale } from '../../../hooks/use-locale';

/**
 *
 */
export const useDateFormat = (gmtDate = '', formatPattern = 'MMMM d, yyyy', fromNow = true) => {
	const t = useT();
	const heartbeat$ = useHeartbeatObservable(60000); // every minute
	const { visibile$ } = usePageVisibility();
	const { locale } = useLocale();
	const dateLocale = Locales[locale.slice(0, 2)] ? Locales[locale.slice(0, 2)] : undefined;

	let gmtDateObject;

	// Determine if gmtDate is an ISO string or a Unix timestamp
	if (typeof gmtDate === 'string') {
		gmtDateObject = parseISO(gmtDate.endsWith('Z') ? gmtDate : `${gmtDate}Z`);
	} else if (typeof gmtDate === 'number') {
		gmtDateObject = new Date(gmtDate);
	} else {
		throw new Error('Invalid date format');
	}

	/**
	 *
	 */
	const formatDate = React.useCallback(() => {
		if (!isValid(gmtDateObject)) {
			return null;
		}

		const now = new UTCDate();
		const diffInHours = differenceInHours(now, gmtDateObject);

		if (fromNow && diffInHours < 24) {
			return formatDistance(gmtDateObject, now, { addSuffix: true, locale: dateLocale });
		} else {
			return format(gmtDateObject, formatPattern, { in: utc, locale: dateLocale });
		}
	}, [gmtDateObject, fromNow, formatPattern, dateLocale]);

	/**
	 *
	 */
	return useObservableState(
		visibile$.pipe(
			filter(() => isToday(gmtDateObject, { in: utc })),
			switchMap(() => heartbeat$),
			map(formatDate)
		),
		formatDate()
	);
};
