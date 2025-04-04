import React from 'react';
import { Platform } from 'react-native';

import { format } from 'date-fns';
import { Calendar as RNCalendar, LocaleConfig, CalendarProps } from 'react-native-calendars';

import { Icon } from '../icon';
import { updateLocaleConfig } from './locales';

export interface DateRange {
	from: Date;
	to: Date;
}

interface Props extends CalendarProps {
	dateRange?: DateRange;
	onDateRangeChange?: (range: DateRange) => void;
	locale?: string;
}

export const Calendar = ({ dateRange, onDateRangeChange, locale, ...props }: Props) => {
	// Update locale configuration when language changes
	React.useEffect(() => {
		updateLocaleConfig(locale);
	}, [locale]);

	// Add state to track the current month
	const [currentMonth, setCurrentMonth] = React.useState(() =>
		dateRange ? format(dateRange.from, 'yyyy-MM') : format(new Date(), 'yyyy-MM')
	);

	// Update current month when dateRange changes
	React.useEffect(() => {
		if (dateRange?.from && dateRange.from.getTime()) {
			setCurrentMonth(format(dateRange.from, 'yyyy-MM'));
		}
	}, [dateRange]);

	// Convert DateRange to markedDates format for react-native-calendars
	const markedDates = React.useMemo(() => {
		if (!dateRange) return {};

		const result: Record<string, any> = {};
		const maxDateObj = props.maxDate ? new Date(props.maxDate) : null;

		// Perform sanity check on the date range against maxDate
		const effectiveRange = {
			from: dateRange.from,
			to: maxDateObj && dateRange.to > maxDateObj ? maxDateObj : dateRange.to,
		};

		// Mark the start date
		result[format(effectiveRange.from, 'yyyy-MM-dd')] = {
			startingDay: true,
			selected: true,
			selectedColor: '#117FBF',
		};

		// Mark the end date
		result[format(effectiveRange.to, 'yyyy-MM-dd')] = {
			endingDay: true,
			selected: true,
			selectedColor: '#117FBF',
		};

		// Mark days in between
		let currentDate = new Date(effectiveRange.from);
		while (currentDate < effectiveRange.to) {
			currentDate.setDate(currentDate.getDate() + 1);
			if (currentDate < effectiveRange.to) {
				result[format(currentDate, 'yyyy-MM-dd')] = {
					selected: true,
					selectedColor: '#117FBF',
				};
			}
		}

		return result;
	}, [dateRange, props.maxDate]);

	const handleDayPress = (day: { dateString: string }) => {
		if (!onDateRangeChange || !dateRange) return;

		const selectedDate = new Date(day.dateString);
		const maxDateObj = props.maxDate ? new Date(props.maxDate) : null;

		// If maxDate is set and selected date is after maxDate, ignore the selection
		if (maxDateObj && selectedDate > maxDateObj) return;

		// If the selected date is before the start date, make it the new start date
		if (selectedDate < dateRange.from) {
			onDateRangeChange({ from: selectedDate, to: dateRange.from });
		}
		// If the selected date is after the end date, make it the new end date
		else if (selectedDate > dateRange.to) {
			onDateRangeChange({ from: dateRange.from, to: selectedDate });
		}
		// If the selected date is between start and end, update the end date
		else {
			onDateRangeChange({ from: dateRange.from, to: selectedDate });
		}
	};

	return (
		<RNCalendar
			firstDay={1}
			onDayPress={handleDayPress}
			markedDates={markedDates}
			initialDate={currentMonth}
			renderArrow={(direction) => {
				return <Icon name={direction === 'left' ? 'chevronLeft' : 'chevronRight'} />;
			}}
			theme={{
				backgroundColor: '#ffffff',
				calendarBackground: '#ffffff',
				textSectionTitleColor: '#b6c1cd',
				textSectionTitleDisabledColor: '#d9e1e8',
				selectedDayBackgroundColor: '#117FBF',
				selectedDayTextColor: '#ffffff',
				todayTextColor: '#117FBF',
				dayTextColor: '#243b53',
				textDisabledColor: '#d9e1e8',
				dotColor: '#117FBF',
				selectedDotColor: '#ffffff',
				arrowColor: '#117FBF',
				disabledArrowColor: '#d9e1e8',
				monthTextColor: '#243b53',
				indicatorColor: 'blue',
				textDayFontFamily:
					'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
				textMonthFontFamily:
					'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
				textDayHeaderFontFamily:
					'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
				textDayFontWeight: '300',
				textMonthFontWeight: '500',
				textDayHeaderFontWeight: '300',
				textDayFontSize: 14,
				textMonthFontSize: 14,
				textDayHeaderFontSize: Platform.OS === 'web' ? 12 : 14,
				weekVerticalMargin: 2,
				'stylesheet.calendar.header': {
					header: {
						flexDirection: 'row',
						justifyContent: 'space-between',
						paddingLeft: 10,
						paddingRight: 10,
						marginTop: 0,
						alignItems: 'center',
					},
					week: {
						marginTop: 0,
						flexDirection: 'row',
						justifyContent: 'space-between',
					},
				},
			}}
			{...props}
		/>
	);
};
