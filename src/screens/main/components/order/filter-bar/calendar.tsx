import * as React from 'react';

import {
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
	subDays,
	subWeeks,
	subMonths,
} from 'date-fns';
import * as Locales from 'date-fns/locale';

import { Box } from '@wcpos/tailwind/src/box';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Calendar } from '@wcpos/tailwind/src/calendar';
import type { DateRange } from '@wcpos/tailwind/src/calendar';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../../contexts/translations';

export const DateRangeCalendar = () => {
	const t = useT();
	const today = new Date();
	const [date, setDate] = React.useState<DateRange | undefined>({
		from: today,
		to: today,
	});

	// Utility functions to calculate date ranges
	const setToday = () => {
		setDate({ from: today, to: today });
	};

	const setYesterday = () => {
		const yesterday = subDays(today, 1);
		setDate({ from: yesterday, to: yesterday });
	};

	const setThisWeek = () => {
		const start = startOfWeek(today, { weekStartsOn: 1 }); // Assuming week starts on Monday
		const end = endOfWeek(today, { weekStartsOn: 1 });
		setDate({ from: start, to: end });
	};

	const setLastWeek = () => {
		const start = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
		const end = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
		setDate({ from: start, to: end });
	};

	const setThisMonth = () => {
		const start = startOfMonth(today);
		const end = endOfMonth(today);
		setDate({ from: start, to: end });
	};

	const setLastMonth = () => {
		const start = startOfMonth(subMonths(today, 1));
		const end = endOfMonth(subMonths(today, 1));
		setDate({ from: start, to: end });
	};

	return (
		<VStack>
			<HStack className="items-start">
				<VStack>
					<Button onPress={setToday} size="sm">
						<ButtonText>{t('Today', { _tags: 'core' })}</ButtonText>
					</Button>
					<Button onPress={setYesterday} size="sm">
						<ButtonText>{t('Yesterday', { _tags: 'core' })}</ButtonText>
					</Button>
					<Button onPress={setThisWeek} size="sm">
						<ButtonText>{t('This Week', { _tags: 'core' })}</ButtonText>
					</Button>
					<Button onPress={setLastWeek} size="sm">
						<ButtonText>{t('Last Week', { _tags: 'core' })}</ButtonText>
					</Button>
					<Button onPress={setThisMonth} size="sm">
						<ButtonText>{t('This Month', { _tags: 'core' })}</ButtonText>
					</Button>
					<Button onPress={setLastMonth} size="sm">
						<ButtonText>{t('Last Month', { _tags: 'core' })}</ButtonText>
					</Button>
				</VStack>
				<Calendar
					locale={Locales.es}
					mode="range"
					defaultMonth={date?.from}
					endMonth={today}
					hidden={[{ after: today }]}
					onSelect={setDate}
					selected={date}
				/>
			</HStack>
			<Box className="p-0 justify-end">
				<Button>
					<ButtonText>Done</ButtonText>
				</Button>
			</Box>
		</VStack>
	);
};
