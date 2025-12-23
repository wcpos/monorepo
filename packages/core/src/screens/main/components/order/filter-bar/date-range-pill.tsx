import * as React from 'react';

import { endOfDay, isSameDay, isToday, isYesterday, startOfDay } from 'date-fns';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import type { DateRange } from '@wcpos/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import type { OrderCollection } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { DateRangeCalendar } from './calendar';
import { useT } from '../../../../../contexts/translations';
import {
	convertLocalDateToUTCString,
	convertUTCStringToLocalDate,
	useLocalDate,
} from '../../../../../hooks/use-local-date';

interface Props {
	query: Query<OrderCollection>;
	onRemove?: () => void;
}

/**
 *
 */
export const DateRangePill = ({ query, onRemove }: Props) => {
	const t = useT();
	const triggerRef = React.useRef(null);
	const selectedDateRange = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('date_created_gmt')))
	);
	const isActive = !!(selectedDateRange && selectedDateRange?.$gte && selectedDateRange?.$lte);
	const { formatDate } = useLocalDate();

	/**
	 * Convert the date range to a label
	 */
	const label = React.useMemo(() => {
		if (!isActive) {
			return t('Date Range', { _tags: 'core' });
		}

		// date_created_gmt in WC REST API is in UTC, but without the 'Z',
		// we need to convert it to a local date
		const from = convertUTCStringToLocalDate(selectedDateRange.$gte);
		const to = convertUTCStringToLocalDate(selectedDateRange.$lte);

		// check if to and from are the same day
		if (isSameDay(from, to)) {
			if (isToday(from)) {
				return t('Today', { _tags: 'core' });
			}
			if (isYesterday(from)) {
				return t('Yesterday', { _tags: 'core' });
			}
		}

		const fromStr = formatDate(from, 'd MMM');
		const toStr = formatDate(to, 'd MMM');

		return `${fromStr} - ${toStr}`;
	}, [isActive, selectedDateRange?.$gte, selectedDateRange?.$lte, formatDate, t]);

	/**
	 *
	 */
	const handleDateSelect = React.useCallback(
		(range: DateRange) => {
			if (!range?.from || !range?.to) {
				return; // what to do if 'done' pressed without a date?
			}

			const { from, to } = range;

			// Ensure we capture the full day range in local time
			// from: start of day (00:00:00 local) → converted to UTC
			// to: end of day (23:59:59 local) → converted to UTC
			query
				.where('date_created_gmt')
				.gte(convertLocalDateToUTCString(startOfDay(from)))
				.lte(convertLocalDateToUTCString(endOfDay(to)))
				.exec();

			if (triggerRef.current) {
				triggerRef.current?.close();
			}
		},
		[query]
	);

	return (
		<Popover>
			<PopoverTrigger ref={triggerRef} asChild>
				<ButtonPill
					size="xs"
					leftIcon="calendarDays"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() => {
						if (onRemove) {
							onRemove();
						} else {
							query.removeWhere('date_created_gmt').exec();
						}
					}}
				>
					<ButtonText>{label}</ButtonText>
				</ButtonPill>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-2">
				<DateRangeCalendar onSelect={handleDateSelect} />
			</PopoverContent>
		</Popover>
	);
};
