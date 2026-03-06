import * as React from 'react';
import { Platform } from 'react-native';

import { format, parseISO } from 'date-fns';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { useCSSVariable } from 'uniwind';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import {
	convertLocalDateToUTCString,
	convertUTCStringToLocalDate,
	useLocalDate,
} from '../../../../hooks/use-local-date';

interface Props {
	value: string | null;
	onChange: (value: string | null) => void;
	label?: string;
	disabled?: boolean;
}

export function DatePickerInput({ value, onChange, label, disabled }: Props) {
	const t = useT();
	const triggerRef = React.useRef<{ close: () => void }>(null);
	const { formatDate } = useLocalDate();

	const [
		primaryColor,
		primaryForegroundColor,
		cardColor,
		foregroundColor,
		mutedForegroundColor,
		borderColor,
	] = useCSSVariable([
		'--color-primary',
		'--color-primary-foreground',
		'--color-card',
		'--color-foreground',
		'--color-muted-foreground',
		'--color-border',
	]).map(String);

	const displayText = React.useMemo(() => {
		if (!value) return label || '';
		const date = convertUTCStringToLocalDate(value);
		return formatDate(date, 'd MMM yyyy');
	}, [value, label, t, formatDate]);

	const selectedDate = React.useMemo(() => {
		if (!value) return undefined;
		const date = convertUTCStringToLocalDate(value);
		return format(date, 'yyyy-MM-dd');
	}, [value]);

	const markedDates = React.useMemo(() => {
		if (!selectedDate) return {};
		return {
			[selectedDate]: {
				selected: true,
				selectedColor: primaryColor,
			},
		};
	}, [selectedDate, primaryColor]);

	const handleDayPress = React.useCallback(
		(day: { dateString: string }) => {
			const selected = parseISO(day.dateString);
			onChange(convertLocalDateToUTCString(selected));
			triggerRef.current?.close();
		},
		[onChange]
	);

	const handleClear = React.useCallback(() => {
		onChange(null);
		triggerRef.current?.close();
	}, [onChange]);

	return (
		<Popover>
			<PopoverTrigger
				// @ts-expect-error: ref only needs close() but TriggerRef requires full PressableRef
				ref={triggerRef}
				asChild
			>
				<Button variant="outline" className="min-w-10 items-start" disabled={disabled}>
					<ButtonText>{displayText}</ButtonText>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-2">
				<VStack>
					<RNCalendar
						firstDay={1}
						onDayPress={handleDayPress}
						markedDates={markedDates}
						initialDate={selectedDate || format(new Date(), 'yyyy-MM-dd')}
						renderArrow={(direction: string) => (
							<Icon name={direction === 'left' ? 'chevronLeft' : 'chevronRight'} />
						)}
						theme={{
							backgroundColor: cardColor,
							calendarBackground: cardColor,
							textSectionTitleColor: mutedForegroundColor,
							selectedDayBackgroundColor: primaryColor,
							selectedDayTextColor: primaryForegroundColor,
							todayTextColor: primaryColor,
							dayTextColor: foregroundColor,
							textDisabledColor: borderColor,
							arrowColor: primaryColor,
							monthTextColor: foregroundColor,
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
							...({
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
							} as Record<string, unknown>),
						}}
					/>
					<HStack className="justify-between">
						<Button variant="ghost" onPress={handleClear}>
							<ButtonText>{t('common.clear')}</ButtonText>
						</Button>
					</HStack>
				</VStack>
			</PopoverContent>
		</Popover>
	);
}
