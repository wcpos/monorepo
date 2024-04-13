import * as React from 'react';

import { parseISO, format, differenceInMinutes, differenceInHours, isToday } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { useObservableState } from 'observable-hooks';
import { switchMap, map, filter } from 'rxjs/operators';

import { useHeartbeatObservable } from '@wcpos/hooks/src/use-heartbeat';
import { usePageVisibility } from '@wcpos/hooks/src/use-page-visibility';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export const useDateFormat = (gmtDate: string, formatPattern = 'MMMM d, yyyy', fromNow = true) => {
	const t = useT();
	const heartbeat$ = useHeartbeatObservable(60000); // every minute
	const { visibile$ } = usePageVisibility();
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const gmtDateObject = parseISO(gmtDate.endsWith('Z') ? gmtDate : `${gmtDate}Z`);
	const localDate = toZonedTime(gmtDateObject, timeZone);

	/**
	 *
	 */
	const formatDate = React.useCallback(() => {
		if (fromNow) {
			const now = new Date();
			const diffInMinutes = differenceInMinutes(now, localDate);
			const diffInHours = differenceInHours(now, localDate);

			if (diffInMinutes < 1) {
				return t('just now', { _tags: 'core' });
			} else if (diffInMinutes < 2) {
				return t('a minute ago', { _tags: 'core' });
			} else if (diffInMinutes < 60) {
				return t('{x} mins ago', { _tags: 'core', x: diffInMinutes });
			} else if (diffInHours < 2) {
				return t('an hour ago', { _tags: 'core' });
			} else if (diffInHours < 24) {
				return t('{x} hours ago', { _tags: 'core', x: diffInHours });
			} else {
				return format(localDate, formatPattern);
			}
		} else {
			return format(localDate, formatPattern);
		}
	}, [localDate, fromNow, t, formatPattern]);

	/**
	 *
	 */
	return useObservableState(
		visibile$.pipe(
			filter(() => isToday(localDate)),
			switchMap(() => heartbeat$),
			map(formatDate)
		),
		formatDate()
	);
};
