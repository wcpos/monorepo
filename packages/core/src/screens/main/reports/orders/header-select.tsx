import * as React from 'react';
import { View } from 'react-native';

import type { HeaderContext } from '@wcpos/core/table-types';
import { Checkbox } from '@wcpos/components/checkbox';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import type { EngineRecord } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';

import type { DataTableFeatures } from '../../components/data-table';

type OrderDocument = import('@wcpos/database').OrderDocument;
type OrderRow = { document: OrderDocument; record: EngineRecord<'orders'> };

/**
 *
 */
export function TableHeaderSelect({ table }: HeaderContext<OrderRow, boolean, DataTableFeatures>) {
	const t = useT();
	const meta = table.options.meta as unknown as {
		totalOrders: number;
		toggleAllRowsSelected: () => void;
	};

	const totalSelected = Object.keys(table.store.state.rowSelection ?? {}).length;
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
}
