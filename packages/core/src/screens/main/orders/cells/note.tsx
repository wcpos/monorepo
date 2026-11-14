import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';

/**
 *
 */
export function Note({ row }: CellContext<{ record: EngineRecord<'orders'> }, 'customer_note'>) {
	const t = useT();
	const note = useRecordField(row.original.record, ({ payload }) => payload.customer_note);

	if (!note) {
		return null;
	}

	return (
		<Tooltip delayDuration={150} showOnNative>
			<TooltipTrigger asChild>
				<IconButton name="note" accessibilityLabel={t('common.customer_note')} />
			</TooltipTrigger>
			<TooltipContent>
				<Text>{note}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
