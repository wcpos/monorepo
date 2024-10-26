import * as React from 'react';

import {
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
	subDays,
	subWeeks,
	subMonths,
	endOfDay,
	startOfDay,
} from 'date-fns';

import { Button, ButtonText, ButtonPill } from '@wcpos/components/src/button';
import { Calendar } from '@wcpos/components/src/calendar';
import type { DateRange } from '@wcpos/components/src/calendar';
import { HStack } from '@wcpos/components/src/hstack';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../contexts/translations';
import { useLocalDate } from '../../../../../hooks/use-local-date';

interface Props {
	onSelect: (date: DateRange) => void;
}

/**
 * Utility function to compare two date ranges
 */
const isDateRangeEqual = (range1: DateRange | undefined, range2: DateRange) => {
	return (
		range1?.from.getTime() === range2.from.getTime() && range1?.to.getTime() === range2.to.getTime()
	);
};

/**
 * DateRangeCalendar Component
 */
export const DateRangeCalendar = ({ onSelect }: Props) => {
	const t = useT();
	const today = React.useMemo(() => new Date(), []);
	const { dateFnsLocale } = useLocalDate();

	// Array of date range options for buttons
	const dateRanges = React.useMemo(() => {
		return [
			{
				label: t('Today', { _tags: 'core' }),
				range: { from: startOfDay(today), to: endOfDay(today) },
				action: () => setDate({ from: startOfDay(today), to: endOfDay(today) }),
			},
			{
				label: t('Yesterday', { _tags: 'core' }),
				range: { from: startOfDay(subDays(today, 1)), to: endOfDay(subDays(today, 1)) },
				action: () =>
					setDate({ from: startOfDay(subDays(today, 1)), to: endOfDay(subDays(today, 1)) }),
			},
			{
				label: t('This Week', { _tags: 'core' }),
				range: {
					from: startOfWeek(today, { weekStartsOn: 1 }),
					to: endOfWeek(today, { weekStartsOn: 1 }),
				},
				action: () =>
					setDate({
						from: startOfWeek(today, { weekStartsOn: 1 }),
						to: endOfWeek(today, { weekStartsOn: 1 }),
					}),
			},
			{
				label: t('Last Week', { _tags: 'core' }),
				range: {
					from: startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
					to: endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
				},
				action: () =>
					setDate({
						from: startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
						to: endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }),
					}),
			},
			{
				label: t('This Month', { _tags: 'core' }),
				range: {
					from: startOfMonth(today),
					to: endOfMonth(today),
				},
				action: () => setDate({ from: startOfMonth(today), to: endOfMonth(today) }),
			},
			{
				label: t('Last Month', { _tags: 'core' }),
				range: {
					from: startOfMonth(subMonths(today, 1)),
					to: endOfMonth(subMonths(today, 1)),
				},
				action: () =>
					setDate({
						from: startOfMonth(subMonths(today, 1)),
						to: endOfMonth(subMonths(today, 1)),
					}),
			},
		];
	}, [t, today]);

	/**
	 *
	 */
	const [date, setDate] = React.useState<DateRange | undefined>(dateRanges[0].range);

	/**
	 * When the date range is selected, make sure the to date is set to the end of the day
	 */
	const handleCalendarSelect = (range: DateRange) => {
		setDate({
			from: range.from,
			to: endOfDay(range.to),
		});
	};

	return (
		<VStack>
			<HStack className="items-start">
				<VStack>
					{dateRanges.map(({ label, range, action }) => (
						<ButtonPill
							key={label}
							onPress={action}
							size="xs"
							variant={isDateRangeEqual(date, range) ? undefined : 'ghost-primary'}
						>
							<ButtonText>{label}</ButtonText>
						</ButtonPill>
					))}
				</VStack>
				<Calendar
					locale={dateFnsLocale}
					mode="range"
					defaultMonth={date?.from}
					endMonth={today}
					hidden={[{ after: today }]}
					onSelect={handleCalendarSelect}
					selected={date}
				/>
			</HStack>
			<HStack className="justify-end">
				<Button onPress={() => onSelect(date)}>
					<ButtonText>{t('Done', { _tags: 'core' })}</ButtonText>
				</Button>
			</HStack>
		</VStack>
	);
};
