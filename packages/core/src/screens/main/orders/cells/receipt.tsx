import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../../contexts/translations';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Receipt = ({ row }: CellContext<{ document: OrderDocument }, any>) => {
	const order = row.original.document;
	const orderHasID = !!useObservableEagerState(order.id$);
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
					onPress={() => router.push(`(app)/(drawer)/orders/(modals)/receipt/${order.uuid}`)}
				/>
			</TooltipTrigger>
			<TooltipContent>
				<Text>{t('Receipt', { _tags: 'core' })}</Text>
			</TooltipContent>
		</Tooltip>
	);
};
