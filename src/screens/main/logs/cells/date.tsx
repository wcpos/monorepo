import * as React from 'react';

import { CellContext } from '@tanstack/react-table';

import { Text } from '@wcpos/components/src/text';

import { useDateFormat } from '../../hooks/use-date-format';

type LogDocument = import('@wcpos/database').LogDocument;

/**
 *
 */
export const Date = ({ row }: CellContext<LogDocument, 'timestamp'>) => {
	const item = row.original;
	const dateFormatted = useDateFormat(item.timestamp);

	return <Text>{dateFormatted}</Text>;
};
