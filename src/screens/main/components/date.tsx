import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';

import { useDateFormat } from '../hooks/use-date-format';

type Document =
	| import('@wcpos/database').ProductDocument
	| import('@wcpos/database').CustomerDocument
	| import('@wcpos/database').OrderDocument;

interface Props {
	item: Document;
	column: import('@wcpos/tailwind/src/table').ColumnProps<Document>;
}

/**
 * We should always use the GMT date, and then format it based on the user's timezone.
 */
export const Date = ({ item, column }: Props) => {
	const key = column.key.endsWith('_gmt') ? column.key : column.key + '_gmt';
	const dateGmt = useObservableEagerState(item[key + '$']);
	const dateFormatted = useDateFormat(dateGmt);

	return <Text>{dateFormatted}</Text>;
};
