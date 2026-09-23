import React from 'react';

import { format, parseISO } from 'date-fns';
import { CalendarProps, Calendar as RNCalendar } from 'react-native-calendars';
import { useCSSVariable } from 'uniwind';

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

export function Calendar({ dateRange, onDateRangeChange, locale, theme, ...props }: Props) {
	// Theme colors via CSS variables
	const [
		primaryColor,
		primaryForegroundColor,
		cardColor,
		foregroundColor,
		mutedForegroundColor,
		borderColor,
		base,
		xs,
		spacing,
	] = useCSSVariable([
		'--color-primary',
		'--color-primary-foreground',
		'--color-card',
		'--color-foreground',
		'--color-muted-foreground',
		'--color-border',
		'--text-base',
		'--text-xs',
		'--spacing',
	]).map(String);

	// A token that the sheet (or a test that mocks it away) does not supply leaves the
	// library's own default in place rather than a NaN size.
	const px = (value: unknown): number | undefined => {
		if (typeof value !== 'string') return undefined;
		// Web keeps the derived xs token as calc(<base>px * <ratio>).
		const [length, multiplier = '1'] = value.replace('calc(', '').split('*');
		const number = parseFloat(length) * parseFloat(multiplier);
		return Number.isFinite(number) ? number : undefined;
	};
	// The Regular numbers, only when no sheet is present.
	const baseSize = px(base) ?? 14;
	const headerSize = px(xs) ?? 12;
	const unit = px(spacing) ?? 4;

	// Update locale configuration when language changes
	React.useEffect(() => {
		if (locale) {
			updateLocaleConfig(locale);
		}
	}, [locale]);

	// Derive current month directly from dateRange (no state sync needed)
	const currentMonth = React.useMemo(() => {
		if (dateRange?.from && dateRange.from.getTime()) {
			return format(dateRange.from, 'yyyy-MM');
		}
		return format(new Date(), 'yyyy-MM');
	}, [dateRange]);

	// Convert DateRange to markedDates format for react-native-calendars
	const markedDates = React.useMemo(() => {
		if (!dateRange) return {};

		const result: Record<string, any> = {};
		const maxDateObj = props.maxDate ? parseISO(props.maxDate) : null;

		// Perform sanity check on the date range against maxDate
		const effectiveRange = {
			from: dateRange.from,
			to: maxDateObj && dateRange.to > maxDateObj ? maxDateObj : dateRange.to,
		};

		// Mark the start date
		result[format(effectiveRange.from, 'yyyy-MM-dd')] = {
			startingDay: true,
			selected: true,
			selectedColor: primaryColor,
		};

		// Mark the end date
		result[format(effectiveRange.to, 'yyyy-MM-dd')] = {
			endingDay: true,
			selected: true,
			selectedColor: primaryColor,
		};

		// Mark days in between
		let currentDate = new Date(effectiveRange.from);
		while (currentDate < effectiveRange.to) {
			currentDate.setDate(currentDate.getDate() + 1);
			if (currentDate < effectiveRange.to) {
				result[format(currentDate, 'yyyy-MM-dd')] = {
					selected: true,
					selectedColor: primaryColor,
				};
			}
		}

		return result;
	}, [dateRange, props.maxDate, primaryColor]);

	const handleDayPress = (day: { dateString: string }) => {
		if (!onDateRangeChange || !dateRange) return;

		// Picker days are local calendar dates, not UTC instants.
		const selectedDate = parseISO(day.dateString);
		const maxDateObj = props.maxDate ? parseISO(props.maxDate) : null;

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
				backgroundColor: cardColor,
				calendarBackground: cardColor,
				textSectionTitleColor: mutedForegroundColor,
				textSectionTitleDisabledColor: borderColor,
				selectedDayBackgroundColor: primaryColor,
				selectedDayTextColor: primaryForegroundColor,
				todayTextColor: primaryColor,
				dayTextColor: foregroundColor,
				textDisabledColor: borderColor,
				dotColor: primaryColor,
				selectedDotColor: primaryForegroundColor,
				arrowColor: primaryColor,
				disabledArrowColor: borderColor,
				monthTextColor: foregroundColor,
				indicatorColor: primaryColor,
				textDayFontFamily:
					'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
				textMonthFontFamily:
					'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
				textDayHeaderFontFamily:
					'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
				textDayFontWeight: '400',
				textMonthFontWeight: '500',
				textDayHeaderFontWeight: '500',
				textDayFontSize: baseSize,
				textMonthFontSize: baseSize,
				textDayHeaderFontSize: headerSize,
				weekVerticalMargin: unit / 2,
				// react-native-calendars supports stylesheet overrides but they're not in the Theme type
				...({
					'stylesheet.calendar.header': {
						header: {
							flexDirection: 'row',
							justifyContent: 'space-between',
							paddingLeft: unit * 2.5,
							paddingRight: unit * 2.5,
							marginTop: 0,
							alignItems: 'center',
						},
						week: {
							marginTop: 0,
							flexDirection: 'row',
							justifyContent: 'space-between',
						},
					},
				} as Record<string, unknown>),
				...theme,
			}}
			{...props}
		/>
	);
}
