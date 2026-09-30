import * as React from 'react';

import { isSameDay, isToday, isYesterday } from 'date-fns';

import { Chip } from '@wcpos/components/chip';
import type { DateRange } from '@wcpos/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';

import { DateRangeCalendar } from '../../components/order/filter-bar/calendar';
import { useQueryState, useQueryStateActions } from '../../../../query';
import { calendarDate, inZone, useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useT } from '../../../../contexts/translations';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../../hooks/use-local-date';

export function DateRangePill() {
	const t = useT();
	const { timezone, dayBounds, rangeToFilter } = useStoreDay();
	const triggerRef = React.useRef<{ close: () => void }>(null);
	const selectedDateRange = useQueryState<'coupons', { from: string; to: string } | undefined>(
		(state) => state.filters.dateRange
	);
	const { setFilter, clearFilter } = useQueryStateActions<'coupons'>();
	const isActive = !!selectedDateRange;
	const { formatDate } = useLocalDate();

	const label = React.useMemo(() => {
		if (!isActive) {
			return t('coupons.expires');
		}

		const from = inZone(timezone, convertUTCStringToLocalDate(selectedDateRange.from));
		const to = inZone(timezone, convertUTCStringToLocalDate(selectedDateRange.to));

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

	const handleDateSelect = React.useCallback(
		(range: DateRange) => {
			if (!range?.from || !range?.to) {
				return;
			}

			const { from, to } = range;

			setFilter(
				'dateRange',
				rangeToFilter({
					from: dayBounds(calendarDate(from)).from,
					to: dayBounds(calendarDate(to)).to,
				})
			);

			triggerRef.current?.close();
		},
		[setFilter, dayBounds, rangeToFilter]
	);

	return (
		<Popover>
			<PopoverTrigger
				// @ts-expect-error: ref only needs close() but TriggerRef requires full PressableRef
				ref={triggerRef}
				asChild
			>
				<Chip
					testID="filter-pill-date_expires_gmt"
					clearTestID="filter-pill-remove-date_expires_gmt"
					icon="calendarDays"
					label={label}
					on={isActive}
					onClear={isActive ? () => clearFilter('dateRange') : undefined}
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
