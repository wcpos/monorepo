import { utc } from '@date-fns/utc';
import { parseISO, format } from 'date-fns';
import * as Locales from 'date-fns/locale';

import { useLocale } from './use-locale';

/**
 * date_created_gmt in WC REST API is in UTC, but without the 'Z',
 * this function converts it to a local date object
 */
export const convertUTCStringToLocalDate = (dateString: string) => {
	const normalizedDateString = dateString.endsWith('Z') ? dateString : `${dateString}Z`;
	return parseISO(normalizedDateString);
};

/**
 * Opposite of convertUTCStringToLocalDate, this function takes a local date
 * and converts it to a UTC date string (without the 'Z' for use by WC REST API)
 */
export const convertLocalDateToUTCString = (date: Date) => {
	return format(date, "yyyy-MM-dd'T'HH:mm:ss", { in: utc });
};

/**
 *
 */
export const useLocalDate = () => {
	const { shortCode } = useLocale();

	/**
	 * Passing the Locale instance to date-fns functions converts date strings to the local date format
	 * eg: Locale.es converts January 1 to 1 de enero
	 */
	const locale = shortCode in Locales ? Locales[shortCode as keyof typeof Locales] : undefined;

	/**
	 * Wrapper for date-fns format function
	 */
	const formatDate = (date: Date, formatString: string) => {
		return format(date, formatString, { locale });
	};

	/**
	 * Take a UTC date string (eg: date_created_gmt in WC REST API) and convert it to a local date format,
	 * eg: 2024-01-01T20:26:03 to 1 de enero de 2024
	 */
	const formatUTCStringToLocalDate = (dateString: string, formatString: string) => {
		return formatDate(convertUTCStringToLocalDate(dateString), formatString);
	};

	return {
		formatDate,
		formatUTCStringToLocalDate,
		dateFnsLocale: locale,
	};
};
