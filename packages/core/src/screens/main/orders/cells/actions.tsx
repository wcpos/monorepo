import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { OrderActionsMenu } from '../v2/order-menu';

export function Actions({ row }: CellContext<{ record: EngineRecord<'orders'> }, 'actions'>) {
	return (
		<OrderActionsMenu
			order={row.original.record}
			trigger={<IconButton testID="order-actions-button" name="ellipsisVertical" />}
		/>
	);
}
