import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';

import { useDateFormat } from '../hooks/use-date-format';

import type { CellContext } from '@tanstack/react-table';

type Document =
	| import('@wcpos/database').ProductDocument
	| import('@wcpos/database').CustomerDocument
	| import('@wcpos/database').OrderDocument;

/**
 * We should always use the GMT date, and then format it based on the user's timezone.
 */
export function Date({ row, column }: CellContext<{ document: Document }, string>) {
	const item = row.original.document;
	const key = column.id.endsWith('_gmt') ? column.id : column.id + '_gmt';
	const dateGmt = useObservableEagerState((item as Record<string, any>)[key + '$']);
	const dateFormatted = useDateFormat(dateGmt as string | undefined);

	return <Text>{dateFormatted}</Text>;
}
