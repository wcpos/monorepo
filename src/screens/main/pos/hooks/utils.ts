import isEmpty from 'lodash/isEmpty';

/**
 *
 */
export const priceToNumber = (price?: string) => parseFloat(isEmpty(price) ? '0' : price);

/**
 *
 */
export const getDateCreated = () => {
	const date = new Date();
	const dateGmt = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	const date_created = date.toISOString().split('.')[0];
	const date_created_gmt = dateGmt.toISOString().split('.')[0];
	return { date_created, date_created_gmt };
};
