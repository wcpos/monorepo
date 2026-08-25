import * as React from 'react';

import { differenceInHours, formatDistance, isToday, isValid } from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useObservableRef, useSubscription } from 'observable-hooks';
import { filter, switchMap } from 'rxjs/operators';

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

	const date = React.useMemo(() => {
		if (typeof gmtDate === 'string' && gmtDate !== '') {
			return convertUTCStringToLocalDate(gmtDate);
		} else if (typeof gmtDate === 'number') {
			return new Date(gmtDate);
		}

		return null;
	}, [gmtDate]);

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

	/**
	 * The heartbeat is a REFRESH TRIGGER, not the value.
	 *
	 * This used to be `useObservableState(refresh$, getDisplayDate())`, whose second
	 * argument is the INITIAL state — read once in a `useState` initialiser on the first
	 * render. That latched the mount-time string: this pipe only emits while the screen is
	 * focused AND the date is today, so a date that is not today never emitted at all, and
	 * a recycled row handed a new `gmtDate` (or a locale/format change) kept rendering the
	 * date it was mounted with. Same class as #1542 and #1551 — guarded by
	 * `wcpos/no-live-seed-in-observable-state`.
	 *
	 * The displayed string is derived from CURRENT inputs on every render instead, which
	 * costs nothing new — `getDisplayDate()` was already evaluated on every render as the
	 * (ignored) seed argument. All the subscription owes us is a re-render per tick.
	 *
	 * It cannot be `useObservableState(refresh$, 0)` either: `useHeartbeatObservable` is an
	 * `interval()`, whose first emission is `0`, so `setState(0)` would match the seed and
	 * React would bail out of the render — the first refresh after mount (and after every
	 * `switchMap` re-subscription, which restarts the interval at `0`) would be dropped.
	 * A reducer that ignores the emitted value and increments a tick always produces a new
	 * state, so every heartbeat re-renders regardless of what it carried.
	 */
	const [, refresh] = React.useReducer((tick: number) => tick + 1, 0);
	const refresh$ = React.useMemo(
		() =>
			visible$.pipe(
				filter((visible) => visible && !!date && isToday(date)),
				switchMap(() => heartbeat$)
			),
		[visible$, heartbeat$, date]
	);
	useSubscription(refresh$, refresh);

	return getDisplayDate();
};
