import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';

type OrderNoteProps = {
	item: import('@wcpos/database').OrderDocument;
};

/**
 *
 */
export const Note = ({ item: order }: OrderNoteProps) => {
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
