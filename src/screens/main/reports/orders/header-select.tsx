import * as React from 'react';
import { View } from 'react-native';

import { HeaderContext } from '@tanstack/react-table';

import { Checkbox } from '@wcpos/components/src/checkbox';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/src/tooltip';

import { useT } from '../../../../contexts/translations';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const TableHeaderSelect = ({ table }: HeaderContext<OrderDocument, boolean>) => {
	const t = useT();

	const totalSelected = Object.keys(table.getState().rowSelection ?? {}).length;
	const indeterminate = totalSelected > 0 && totalSelected < table.options.meta.totalOrders;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<View role="div">
					<Checkbox
						checked={totalSelected === table.options.meta.totalOrders}
						indeterminate={indeterminate}
						onCheckedChange={table.options.meta.toggleAllRowsSelected}
					/>
				</View>
			</TooltipTrigger>
			<TooltipContent>
				<Text>{t('Toggle selection', { _tags: 'core' })}</Text>
			</TooltipContent>
		</Tooltip>
	);
};
