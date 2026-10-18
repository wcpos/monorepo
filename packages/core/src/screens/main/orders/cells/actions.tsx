import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { OrderActionsMenu } from '../order-menu';
import { useT } from '../../../../contexts/translations';

export function Actions({ row }: CellContext<{ record: EngineRecord<'orders'> }, 'actions'>) {
	const t = useT();
	return (
		<OrderActionsMenu
			order={row.original.record}
			trigger={
				<IconButton
					testID="order-actions-button"
					name="ellipsisVertical"
					accessibilityLabel={t('orders.order_actions')}
				/>
			}
		/>
	);
}
