import * as React from 'react';

import { isToday, isYesterday, isSameDay } from 'date-fns';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import type { DateRange } from '@wcpos/components/src/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/src/popover';
import type { OrderCollection } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { DateRangeCalendar } from './calendar';
import { useT } from '../../../../../contexts/translations';
import {
	useLocalDate,
	convertUTCStringToLocalDate,
	convertLocalDateToUTCString,
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

			query
				.where('date_created_gmt')
				.gte(convertLocalDateToUTCString(from))
				.lte(convertLocalDateToUTCString(to))
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
					variant={isActive ? 'default' : 'muted'}
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
