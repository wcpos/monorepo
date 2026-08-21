import * as React from 'react';

import get from 'lodash/get';

import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';

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
export function CreatedVia({
	row,
}: CellContext<{ record: EngineRecord<'orders'> }, 'created_via'>) {
	const createdVia = useRecordField(row.original.record, ({ payload }) => payload.created_via);
	const iconName = get(iconMap, [createdVia ?? '', 'name'], 'circleQuestion') as string;
	const iconType = get(iconMap, [createdVia ?? '', 'type'], 'muted') as string;
	const t = useT();

	/**
	 * @TODO - add store name for Pro
	 */
	const label = React.useMemo(() => {
		switch (createdVia) {
			case 'woocommerce-pos':
				return t('common.pos_store');
			case 'admin':
				return t('common.wp_admin');
			case 'checkout':
				return t('common.online_store');
			default:
				return createdVia || t('common.unknown');
		}
	}, [createdVia, t]);

	/**
	 *
	 */
	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<IconButton
					name={iconName as import('@wcpos/components/icon').IconName}
					variant={iconType as 'muted'}
				/>
			</TooltipTrigger>
			<TooltipContent>
				<Text>{label}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
