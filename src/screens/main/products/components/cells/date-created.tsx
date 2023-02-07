import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import useDateFormat from '../../../hooks/use-date-format';

const DateCreated = ({ item: product }) => {
	const dateCreated = useObservableState(product.date_created$, product.date_created);
	const dateFormatted = useDateFormat(dateCreated, 'MMMM Do YYYY, h:mm:ss a');

	return <Text>{dateFormatted}</Text>;
};

export default DateCreated;
