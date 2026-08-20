import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export function Note({
	row,
}: CellContext<{ document: OrderDocument; record: EngineRecord<'orders'> }, 'customer_note'>) {
	const note = useRecordField(row.original.record, ({ payload }) => payload.customer_note);

	if (!note) {
		return null;
	}

	return (
		<Tooltip delayDuration={150} showOnNative>
			<TooltipTrigger asChild>
				<IconButton name="messageLines" />
			</TooltipTrigger>
			<TooltipContent>
				<Text>{note}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
