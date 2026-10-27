import * as React from 'react';

import { useRouter } from 'expo-router';

import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';

// The same caret the touch row trails with. On a fine pointer it is the one control that opens
// the order; the row is no press target (Paul, 2026-10-27), Enter on a focused row still opens it.
export function Actions({ row }: CellContext<{ record: EngineRecord<'orders'> }, 'actions'>) {
	const router = useRouter();
	const t = useT();
	return (
		<IconButton
			testID="order-open-button"
			name="chevronRight"
			size="sm"
			accessibilityLabel={t('orders.open_order')}
			onPress={() =>
				router.push({
					pathname: '/orders/edit/[orderId]',
					params: { orderId: row.original.record.uuid },
				})
			}
		/>
	);
}
