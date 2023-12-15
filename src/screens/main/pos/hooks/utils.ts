import isEmpty from 'lodash/isEmpty';
import moment from 'moment';

/**
 *
 */
export const priceToNumber = (price?: string) => parseFloat(isEmpty(price) ? '0' : price);

/**
 * @returns {string} - Current GMT date
 */
export const getCurrentGMTDate = () => {
	return moment().utc().format('YYYY-MM-DDTHH:mm:ss');
};
