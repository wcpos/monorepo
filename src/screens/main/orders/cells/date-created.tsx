import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import useDateFormat from '../../hooks/use-date-format';

const DateCreated = ({ item: order }) => {
	const dateCreatedGmt = useObservableState(order.date_created_gmt$, order.date_created_gmt);
	const dateFormatted = useDateFormat(dateCreatedGmt);

	return <Text>{dateFormatted}</Text>;
};

export default DateCreated;
