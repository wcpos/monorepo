import * as React from 'react';

import { differenceInHours, isToday, isValid, formatDistance } from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useObservableRef, useObservableState } from 'observable-hooks';
import { switchMap, map, filter } from 'rxjs/operators';

import { useHeartbeatObservable } from '@wcpos/hooks/use-heartbeat';

import { useLocalDate, convertUTCStringToLocalDate } from '../../../hooks/use-local-date';

/**
 *
 */
export const useDateFormat = (gmtDate = '', formatPattern = 'MMMM d, yyyy', fromNow = true) => {
	const heartbeat$ = useHeartbeatObservable(60000); // every minute
	const { dateFnsLocale, formatDate } = useLocalDate();
	const [visibleRef, visible$] = useObservableRef(false);

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
	 * We will turn off the heartbeat if the screen is not visible
	 */
	useFocusEffect(
		React.useCallback(() => {
			visibleRef.current = true;
			return () => {
				visibleRef.current = false;
			};
		}, [])
	);

	/**
	 *
	 */
	return useObservableState(
		visible$.pipe(
			filter((visible) => visible && isToday(date)),
			switchMap(() => heartbeat$),
			map(getDisplayDate)
		),
		getDisplayDate()
	);
};
