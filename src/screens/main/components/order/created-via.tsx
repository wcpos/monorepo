import * as React from 'react';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';

import { useT } from '../../../../contexts/translations';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

const iconMap = {
	'woocommerce-pos': {
		name: 'wcpos',
		type: 'muted',
	},
	admin: {
		name: 'wordpress',
		type: 'muted',
	},
	checkout: {
		name: 'globe',
		type: 'muted',
	},
};

/**
 *
 */
export const CreatedVia = ({ row }: CellContext<{ document: OrderDocument }, 'created_via'>) => {
	const order = row.original.document;
	const createdVia = useObservableEagerState(order.created_via$);
	const iconName = get(iconMap, [createdVia, 'name'], 'circleQuestion');
	const iconType = get(iconMap, [createdVia, 'type'], 'muted');
	const t = useT();

	/**
	 * @TODO - add store name for Pro
	 */
	const label = React.useMemo(() => {
		switch (createdVia) {
			case 'woocommerce-pos':
				return t('POS Store', { _tags: 'core' });
			case 'admin':
				return t('WP Admin', { _tags: 'core' });
			case 'checkout':
				return t('Online Store', { _tags: 'core' });
			default:
				return createdVia || t('Unknown', { _tags: 'core' });
		}
	}, [createdVia, t]);

	/**
	 *
	 */
	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<IconButton name={iconName} variant={iconType} />
			</TooltipTrigger>
			<TooltipContent>
				<Text>{label}</Text>
			</TooltipContent>
		</Tooltip>
	);
};
