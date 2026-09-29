import * as React from 'react';

import { isSameDay, isToday, isYesterday } from 'date-fns';

import type { DateRange } from '@wcpos/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';

import { FilterChip as Chip } from './chip';
import { DateRangeCalendar } from './calendar';
import { calendarDate, inZone, useStoreDay, zoneOptions } from '../../../../../hooks/use-store-day';
import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../../../hooks/use-local-date';

interface Props {
	onRemove?: () => void;
}

/**
 *
 */
export function DateRangePill({ onRemove }: Props = {}) {
	const t = useT();
	const { timezone, dayBounds, rangeToFilter } = useStoreDay();
	const triggerRef = React.useRef<{ close: () => void }>(null);
	const selectedDateRange = useQueryState<'orders', { from: string; to: string } | undefined>(
		(state) => state.filters.dateRange
	);
	const actions = useQueryStateActions<'orders'>();
	const isActive = !!(selectedDateRange?.from && selectedDateRange?.to);
	const { formatDate } = useLocalDate();

	/**
	 * Convert the date range to a label
	 */
	const label = React.useMemo(() => {
		if (!isActive) {
			return t('orders.date_range');
		}

		// date_created_gmt in WC REST API is in UTC, but without the 'Z',
		// we need to convert it to a local date
		const from = inZone(timezone, convertUTCStringToLocalDate(selectedDateRange.from));
		const to = inZone(timezone, convertUTCStringToLocalDate(selectedDateRange.to));

		// check if to and from are the same day
		if (isSameDay(from, to)) {
			if (isToday(from, zoneOptions(timezone))) {
				return t('common.today');
			}
			if (isYesterday(from, zoneOptions(timezone))) {
				return t('common.yesterday');
			}
		}

		const fromStr = formatDate(from, 'd MMM');
		const toStr = formatDate(to, 'd MMM');

		return `${fromStr} - ${toStr}`;
	}, [isActive, selectedDateRange, formatDate, t, timezone]);

	/**
	 *
	 */
	const handleDateSelect = React.useCallback(
		(range: DateRange) => {
			if (!range?.from || !range?.to) {
				return; // what to do if 'done' pressed without a date?
			}

			const { from, to } = range;

			actions.setFilter(
				'dateRange',
				rangeToFilter({
					from: dayBounds(calendarDate(from)).from,
					to: dayBounds(calendarDate(to)).to,
				})
			);

			if (triggerRef.current) {
				triggerRef.current?.close();
			}
		},
		[actions, dayBounds, rangeToFilter]
	);

	return (
		<Popover>
			<PopoverTrigger
				// @ts-expect-error: ref only needs close() but TriggerRef requires full PressableRef
				ref={triggerRef}
				asChild
			>
				<Chip
					clearLabel={t('common.remove')}
					clearTestID="order-filter-date-remove"
					testID="order-filter-date"
					icon="calendarDays"
					on={isActive}
					onClear={
						isActive ? () => (onRemove ? onRemove() : actions.clearFilter('dateRange')) : undefined
					}
					label={label}
				/>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-2">
				{/* Keyed by zone: the calendar seeds its selection from the store day at mount, so a
				    zone resolved after mount must not leave the old selection behind. */}
				<DateRangeCalendar key={timezone} onSelect={handleDateSelect} />
			</PopoverContent>
		</Popover>
	);
}
