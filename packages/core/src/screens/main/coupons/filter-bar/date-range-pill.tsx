import * as React from 'react';

import { endOfDay, isSameDay, isToday, isYesterday, startOfDay } from 'date-fns';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import type { DateRange } from '@wcpos/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';

import { DateRangeCalendar } from '../../components/order/filter-bar/calendar';
import { useQueryState, useQueryStateActions } from '../../../../query';
import { useT } from '../../../../contexts/translations';
import {
	convertLocalDateToUTCString,
	convertUTCStringToLocalDate,
	useLocalDate,
} from '../../../../hooks/use-local-date';

export function DateRangePill() {
	const t = useT();
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

		const from = convertUTCStringToLocalDate(selectedDateRange.from);
		const to = convertUTCStringToLocalDate(selectedDateRange.to);

		if (isSameDay(from, to)) {
			if (isToday(from)) {
				return t('common.today');
			}
			if (isYesterday(from)) {
				return t('common.yesterday');
			}
		}

		const fromStr = formatDate(from, 'd MMM');
		const toStr = formatDate(to, 'd MMM');

		return `${fromStr} - ${toStr}`;
	}, [isActive, selectedDateRange, formatDate, t]);

	const handleDateSelect = React.useCallback(
		(range: DateRange) => {
			if (!range?.from || !range?.to) {
				return;
			}

			const { from, to } = range;

			setFilter('dateRange', {
				from: convertLocalDateToUTCString(startOfDay(from)),
				to: convertLocalDateToUTCString(endOfDay(to)),
			});

			triggerRef.current?.close();
		},
		[setFilter]
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
				<DateRangeCalendar onSelect={handleDateSelect} />
			</PopoverContent>
		</Popover>
	);
}
