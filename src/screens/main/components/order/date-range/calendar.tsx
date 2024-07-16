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

import { Calendar } from '@wcpos/tailwind/src/calendar';
import type { DateRange } from '@wcpos/tailwind/src/calendar';

export const DateRangeCalendar = () => {
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
		<>
			<div className="button-group">
				<button onClick={setToday}>Today</button>
				<button onClick={setYesterday}>Yesterday</button>
				<button onClick={setThisWeek}>This Week</button>
				<button onClick={setLastWeek}>Last Week</button>
				<button onClick={setThisMonth}>This Month</button>
				<button onClick={setLastMonth}>Last Month</button>
			</div>
			<Calendar
				locale={Locales.es}
				initialFocus
				mode="range"
				defaultMonth={date?.from}
				toDate={today}
				modifiers={{
					disabled: [{ after: today }],
				}}
				onSelect={setDate}
				selected={date}
			/>
		</>
	);
};
