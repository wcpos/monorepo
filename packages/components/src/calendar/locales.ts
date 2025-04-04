import { format } from 'date-fns';
import * as Locales from 'date-fns/locale';
import { LocaleConfig } from 'react-native-calendars';

import type { Locale } from 'date-fns/locale';

type CalendarLocaleConfig = {
	monthNames: string[];
	monthNamesShort: string[];
	dayNames: string[];
	dayNamesShort: string[];
	today: string;
};

// Function to get month names using date-fns
const getMonthNames = (locale: Locale) => {
	return Array.from({ length: 12 }, (_, i) => format(new Date(2024, i, 1), 'MMMM', { locale }));
};

// Function to get short month names using date-fns
const getMonthNamesShort = (locale: Locale) => {
	return Array.from({ length: 12 }, (_, i) => format(new Date(2024, i, 1), 'MMM', { locale }));
};

// Function to get day names using date-fns
const getDayNames = (locale: Locale) => {
	return Array.from({ length: 7 }, (_, i) => format(new Date(2024, 0, 7 + i), 'EEEE', { locale }));
};

// Function to get short day names using date-fns
const getDayNamesShort = (locale: Locale) => {
	return Array.from({ length: 7 }, (_, i) => format(new Date(2024, 0, 7 + i), 'EEE', { locale }));
};

// Function to get "today" in the current locale
const getToday = (locale: Locale) => {
	return format(new Date(), "'Today'", { locale });
};

// Function to update LocaleConfig
export const updateLocaleConfig = (localeCode: string) => {
	const locale = localeCode in Locales ? Locales[localeCode as keyof typeof Locales] : Locales.enUS;

	const config: CalendarLocaleConfig = {
		monthNames: getMonthNames(locale),
		monthNamesShort: getMonthNamesShort(locale),
		dayNames: getDayNames(locale),
		dayNamesShort: getDayNamesShort(locale),
		today: getToday(locale),
	};

	LocaleConfig.locales = {
		[localeCode]: config,
	};
	LocaleConfig.defaultLocale = localeCode;
};
