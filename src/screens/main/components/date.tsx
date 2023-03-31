import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import useDateFormat from '../hooks/use-date-format';

type Document =
	| import('@wcpos/database').ProductDocument
	| import('@wcpos/database').CustomerDocument
	| import('@wcpos/database').OrderDocument;

interface Props {
	item: Document;
	column: import('@wcpos/components/src/table').ColumnProps<Document>;
}

const Date = ({ item, column }: Props) => {
	const key = get(column, 'key', 'date_created_gmt');
	const dateGmt = useObservableState(item[key + '$'], item[key]);
	const dateFormatted = useDateFormat(dateGmt);

	return <Text>{dateFormatted}</Text>;
};

export default Date;
