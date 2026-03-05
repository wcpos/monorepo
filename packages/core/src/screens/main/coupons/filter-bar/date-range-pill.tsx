import * as React from 'react';

import { endOfDay, isSameDay, isToday, isYesterday, startOfDay } from 'date-fns';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import type { DateRange } from '@wcpos/components/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import type { CouponCollection } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { DateRangeCalendar } from '../../components/order/filter-bar/calendar';
import { useT } from '../../../../contexts/translations';
import {
	convertLocalDateToUTCString,
	convertUTCStringToLocalDate,
	useLocalDate,
} from '../../../../hooks/use-local-date';

interface Props {
	query: Query<CouponCollection>;
}

export function DateRangePill({ query }: Props) {
	const t = useT();
	const triggerRef = React.useRef<{ close: () => void }>(null);
	const selectedDateRange = useObservableEagerState(
		query.rxQuery$.pipe(map(() => query.getSelector('date_expires_gmt')))
	);
	const isActive = !!(selectedDateRange && selectedDateRange?.$gte && selectedDateRange?.$lte);
	const { formatDate } = useLocalDate();

	const label = React.useMemo(() => {
		if (!isActive) {
			return t('coupons.expiry_date');
		}

		const from = convertUTCStringToLocalDate(selectedDateRange.$gte as string);
		const to = convertUTCStringToLocalDate(selectedDateRange.$lte as string);

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
	}, [isActive, selectedDateRange?.$gte, selectedDateRange?.$lte, formatDate, t]);

	const handleDateSelect = React.useCallback(
		(range: DateRange) => {
			if (!range?.from || !range?.to) {
				return;
			}

			const { from, to } = range;

			query
				.where('date_expires_gmt')
				.gte(convertLocalDateToUTCString(startOfDay(from)))
				.lte(convertLocalDateToUTCString(endOfDay(to)))
				.exec();

			triggerRef.current?.close();
		},
		[query]
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
					onRemove={() => query.removeWhere('date_expires_gmt').exec()}
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
