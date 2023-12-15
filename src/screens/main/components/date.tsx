import * as React from 'react';

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

/**
 * We should always use the GMT date, and then format it based on the user's timezone.
 */
export const Date = ({ item, column }: Props) => {
	const key = column.key.endsWith('_gmt') ? column.key : column.key + '_gmt';
	const dateGmt = useObservableState(item[key + '$'], item[key]);
	const dateFormatted = useDateFormat(dateGmt);

	return <Text>{dateFormatted}</Text>;
};
