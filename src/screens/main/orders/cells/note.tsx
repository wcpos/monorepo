import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import type { CellContext } from '@wcpos/tailwind/src/data-table';
import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Note = ({ row }: CellContext<OrderDocument, 'customer_note'>) => {
	const order = row.original;
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
