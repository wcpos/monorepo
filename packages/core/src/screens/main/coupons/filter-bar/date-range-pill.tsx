import * as React from 'react';

import { tz } from '@date-fns/tz';
import { isSameDay, isToday, isYesterday } from 'date-fns';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import type { DateRange } from '@wcpos/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';

import { DateRangeCalendar } from '../../components/order/filter-bar/calendar';
import { useQueryState, useQueryStateActions } from '../../../../query';
import { calendarDate, useStoreDay } from '../../../../hooks/use-store-day';
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
			return t('coupons.expiry_date');
		}

		const from = tz(timezone)(convertUTCStringToLocalDate(selectedDateRange.from));
		const to = tz(timezone)(convertUTCStringToLocalDate(selectedDateRange.to));

		if (isSameDay(from, to)) {
			if (isToday(from, { in: tz(timezone) })) {
				return t('common.today');
			}
			if (isYesterday(from, { in: tz(timezone) })) {
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
				<ButtonPill
					size="xs"
					leftIcon="calendarDays"
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={() => clearFilter('dateRange')}
				>
					<ButtonText>{label}</ButtonText>
				</ButtonPill>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-2">
				{/* Keyed by zone: the calendar seeds its selection from the store day at mount, so a
				    zone resolved after mount must not leave the old selection behind. */}
				<DateRangeCalendar key={timezone} onSelect={handleDateSelect} />
			</PopoverContent>
		</Popover>
	);
}
