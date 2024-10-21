import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Note = ({ row }: CellContext<{ document: OrderDocument }, 'customer_note'>) => {
	const order = row.original.document;
	const note = useObservableEagerState(order.customer_note$);

	if (!note) {
		return null;
	}

	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<IconButton name="messageLines" />
			</TooltipTrigger>
			<TooltipContent>
				<Text>{note}</Text>
			</TooltipContent>
		</Tooltip>
	);
};
