import * as React from 'react';
import { View } from 'react-native';

import type { CellContext } from '@wcpos/core/table-types';
import { Checkbox } from '@wcpos/components/checkbox';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';

import type { DataTableFeatures } from '../../components/data-table';

type OrderRow = { record: EngineRecord<'orders'> };

export function TableRowSelect({ row, table }: CellContext<OrderRow, boolean, DataTableFeatures>) {
	const t = useT();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<View role="none">
					<Checkbox
						checked={row.getIsSelected()}
						disabled={!row.getCanSelect()}
						onCheckedChange={(checked) => row.toggleSelected(!!checked)}
					/>
				</View>
			</TooltipTrigger>
			<TooltipContent side="right">
				<Text>{row.getIsSelected() ? t('reports.exclude') : t('reports.include')}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
