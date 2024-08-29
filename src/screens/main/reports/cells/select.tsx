import * as React from 'react';
import { View } from 'react-native';

import { CellContext } from '@tanstack/react-table';

import { Checkbox } from '@wcpos/components/src/checkbox';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/src/tooltip';

import { useT } from '../../../../contexts/translations';

type OrderDocument = import('@wcpos/database').OrderDocument;

export const TableRowSelect = ({ row }: CellContext<OrderDocument, boolean>) => {
	const t = useT();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<View role="div">
					<Checkbox
						checked={row.getIsSelected()}
						disabled={!row.getCanSelect()}
						indeterminate={row.getIsSomeSelected()}
						onCheckedChange={row.toggleSelected}
					/>
				</View>
			</TooltipTrigger>
			<TooltipContent>
				<Text>
					{row.getIsSelected() ? t('Exclude', { _tags: 'core' }) : t('Include', { _tags: 'core' })}
				</Text>
			</TooltipContent>
		</Tooltip>
	);
};
