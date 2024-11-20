import * as React from 'react';

import { differenceInHours, isToday, isValid, formatDistance } from 'date-fns';
import { useObservableState } from 'observable-hooks';
import { switchMap, map, filter } from 'rxjs/operators';

import { useHeartbeatObservable } from '@wcpos/hooks/src/use-heartbeat';
import { usePageVisibility } from '@wcpos/hooks/src/use-page-visibility';

import { useLocalDate, convertUTCStringToLocalDate } from '../../../hooks/use-local-date';

/**
 *
 */
export const useDateFormat = (gmtDate = '', formatPattern = 'MMMM d, yyyy', fromNow = true) => {
	const heartbeat$ = useHeartbeatObservable(60000); // every minute
	const { visibile$ } = usePageVisibility();
	const { dateFnsLocale, formatDate } = useLocalDate();

	let date: Date;

	// Determine if gmtDate is an ISO string or a Unix timestamp
	if (typeof gmtDate === 'string') {
		date = convertUTCStringToLocalDate(gmtDate);
	} else if (typeof gmtDate === 'number') {
		date = new Date(gmtDate);
	} else {
		throw new Error('Invalid date format');
	}

	/**
	 *
	 */
	const getDisplayDate = React.useCallback(() => {
		if (!isValid(date)) {
			return null;
		}

		const now = new Date();
		const diffInHours = differenceInHours(now, date);

		if (fromNow && diffInHours < 24) {
			return formatDistance(date, now, { addSuffix: true, locale: dateFnsLocale });
		} else {
			return formatDate(date, formatPattern);
		}
	}, [date, fromNow, dateFnsLocale, formatDate, formatPattern]);

	/**
	 *
	 */
	return useObservableState(
		visibile$.pipe(
			filter(() => isToday(date)),
			switchMap(() => heartbeat$),
			map(getDisplayDate)
		),
		getDisplayDate()
	);
};
