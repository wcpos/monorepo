import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';

import { useDateFormat } from '../hooks/use-date-format';

import type { CellContext } from '@tanstack/react-table';

type Document =
	| import('@wcpos/database').ProductDocument
	| import('@wcpos/database').CustomerDocument
	| import('@wcpos/database').OrderDocument;

/**
 * We should always use the GMT date, and then format it based on the user's timezone.
 */
export const Date = ({ row, column }: CellContext<Document, string>) => {
	const item = row.original;
	const key = column.id.endsWith('_gmt') ? column.id : column.id + '_gmt';
	const dateGmt = useObservableEagerState(item[key + '$']);
	const dateFormatted = useDateFormat(dateGmt);

	return <Text>{dateFormatted}</Text>;
};
