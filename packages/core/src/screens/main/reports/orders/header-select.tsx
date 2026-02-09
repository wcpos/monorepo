import * as React from 'react';
import { View } from 'react-native';

import { HeaderContext } from '@tanstack/react-table';

import { Checkbox } from '@wcpos/components/checkbox';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../../contexts/translations';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const TableHeaderSelect = ({ table }: HeaderContext<OrderDocument, boolean>) => {
	const t = useT();
	const meta = table.options.meta as unknown as {
		totalOrders: number;
		toggleAllRowsSelected: () => void;
	};

	const totalSelected = Object.keys(table.getState().rowSelection ?? {}).length;
	const indeterminate = totalSelected > 0 && totalSelected < meta.totalOrders;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<View role="none">
					<Checkbox
						checked={totalSelected === meta.totalOrders}
						indeterminate={indeterminate}
						onCheckedChange={() => meta.toggleAllRowsSelected()}
					/>
				</View>
			</TooltipTrigger>
			<TooltipContent>
				<Text>{t('reports.toggle_selection')}</Text>
			</TooltipContent>
		</Tooltip>
	);
};
