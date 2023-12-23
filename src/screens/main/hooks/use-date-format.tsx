import * as React from 'react';

import moment from 'moment-timezone';
import { useObservable, useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';

import { useHeartbeatObservable } from '@wcpos/hooks/src/use-heartbeat';
import { usePageVisibility } from '@wcpos/hooks/src/use-page-visibility';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export const useDateFormat = (gmtDate: string, format = 'MMMM D, YYYY', fromNow = true) => {
	const t = useT();
	const heartbeat$ = useHeartbeatObservable(60000); // every minute
	const { visibile$ } = usePageVisibility();

	/**
	 *
	 */
	const formatDate = React.useCallback(() => {
		const localDate = moment.utc(gmtDate).local();
		if (fromNow) {
			const now = moment();
			const diffInMinutes = now.diff(localDate, 'minutes');
			const diffInHours = now.diff(localDate, 'hours');

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
				return localDate.format(format);
			}
		} else {
			return localDate.format(format);
		}
	}, [gmtDate, format, fromNow, t]);

	/**
	 *
	 */
	const formattedDate$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([gmtDate, formatDate]) => {
					const now = moment();
					const localDate = moment.utc(gmtDate).local();
					if (now.diff(localDate, 'days') >= 1) {
						// If more than a day old, no need for an observable
						return of(formatDate());
					}

					// If less than a day old, use a heartbeat observable
					return visibile$.pipe(
						switchMap(() => heartbeat$),
						map(() => {
							return formatDate();
						})
					);
				})
			),
		[gmtDate, formatDate]
	);

	return useObservableState(formattedDate$, formatDate());
};
