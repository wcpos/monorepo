import * as React from 'react';

import { differenceInHours, formatDistance, isToday, isValid } from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useObservableRef, useObservableState } from 'observable-hooks';
import { filter, map, switchMap } from 'rxjs/operators';

import { setRefValue } from '@wcpos/components/lib/set-ref-value';
import { useHeartbeatObservable } from '@wcpos/hooks/use-heartbeat';

import { convertUTCStringToLocalDate, useLocalDate } from '../../../hooks/use-local-date';

/**
 *
 */
export const useDateFormat = (
	gmtDate: string | number | null | undefined = '',
	formatPattern = 'MMMM d, yyyy',
	fromNow = true
) => {
	const heartbeat$ = useHeartbeatObservable(60000); // every minute
	const { dateFnsLocale, formatDate } = useLocalDate();
	const [visibleRef, visible$] = useObservableRef(false);

	let date: Date | null = null;

	if (typeof gmtDate === 'string' && gmtDate !== '') {
		date = convertUTCStringToLocalDate(gmtDate);
	} else if (typeof gmtDate === 'number') {
		date = new Date(gmtDate);
	}

	const getDisplayDate = React.useCallback(() => {
		if (!date || !isValid(date)) {
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

	useFocusEffect(
		React.useCallback(() => {
			setRefValue(visibleRef, true);
			return () => {
				setRefValue(visibleRef, false);
			};
		}, [visibleRef])
	);

	return useObservableState(
		visible$.pipe(
			filter((visible) => visible && !!date && isToday(date)),
			switchMap(() => heartbeat$),
			map(getDisplayDate)
		),
		getDisplayDate()
	);
};
