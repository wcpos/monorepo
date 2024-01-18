import { format as formatDate } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';
import isEmpty from 'lodash/isEmpty';

/**
 *
 */
export const priceToNumber = (price?: string) => parseFloat(isEmpty(price) ? '0' : price);

/**
 * @returns {string} - Current GMT date
 */
export const getCurrentGMTDate = () => {
	// Get the current date and time in UTC
	const nowUtc = zonedTimeToUtc(new Date(), 'UTC');

	// Format the date in the desired format
	return formatDate(nowUtc, "yyyy-MM-dd'T'HH:mm:ss");
};
