import * as React from 'react';
import moment from 'moment';

export const useDateFormat = (date: Date, format: string, fromNow: boolean) => {
	const currentDate = moment().startOf('day').hour(12);
	const inputDate = moment(date);
	const daysSince = inputDate.diff(currentDate, 'days');

	return fromNow && daysSince < 3
		? inputDate.fromNow()
		: inputDate.format('MMMM Do YYYY, h:mm:ss a');
};
