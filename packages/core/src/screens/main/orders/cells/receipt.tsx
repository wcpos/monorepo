import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableEagerState } from 'observable-hooks';

import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';

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
	const navigation = useNavigation();

	if (!orderHasID) {
		return null;
	}

	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<IconButton
					name="receipt"
					onPress={() => navigation.navigate('Receipt', { orderID: order.uuid })}
				/>
			</TooltipTrigger>
			<TooltipContent>
				<Text>{t('Receipt', { _tags: 'core' })}</Text>
			</TooltipContent>
		</Tooltip>
	);
};
