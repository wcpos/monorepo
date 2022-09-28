import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import useDateFormat from '@wcpos/hooks/src/use-date-format';
import Text from '@wcpos/components/src/text';

const DateCreated = ({ item: product }) => {
	const dateCreated = useObservableState(product.date_created$, product.date_created);
	const dateFormatted = useDateFormat(dateCreated, 'MMMM Do YYYY, h:mm:ss a');

	return <Text>{dateFormatted}</Text>;
};

export default DateCreated;
