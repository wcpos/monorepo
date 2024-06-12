import * as React from 'react';

import Text from '@wcpos/components/src/text';

import { useDateFormat } from '../../hooks/use-date-format';

export const Date = ({ item }) => {
	const dateFormatted = useDateFormat(item.timestamp);

	return <Text>{dateFormatted}</Text>;
};
