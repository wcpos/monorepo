import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import useDateFormat from '@wcpos/hooks/src/use-date-format';
import Text from '@wcpos/components/src/text';

const DateCreated = ({ item: order }) => {
	const dateCreated = useObservableState(order.date_created$, order.date_created);
	const dateFormatted = useDateFormat(dateCreated, 'MMMM Do YYYY, h:mm:ss a');

	return <Text>{dateFormatted}</Text>;
};

export default DateCreated;
