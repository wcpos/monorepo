import * as React from 'react';

import { useRouter } from 'expo-router';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export function Receipt({
	row,
}: CellContext<{ document: OrderDocument; record: EngineRecord<'orders'> }, unknown>) {
	const order = row.original.document;
	const orderHasID = !!useRecordField(row.original.record, ({ payload }) => payload.id);
	const t = useT();
	const router = useRouter();

	if (!orderHasID) {
		return null;
	}

	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<IconButton
					name="receipt"
					onPress={() =>
						router.push({
							pathname: '/(app)/(drawer)/orders/(modals)/receipt/[orderId]',
							params: { orderId: order.uuid! },
						})
					}
				/>
			</TooltipTrigger>
			<TooltipContent>
				<Text>{t('common.receipt')}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
