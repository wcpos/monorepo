import * as React from 'react';

import { useRouter } from 'expo-router';

import { IconButton } from '@wcpos/components/icon-button';
import type { EngineRecord } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../contexts/translations';

// The same caret the touch row trails with, and it opens the order like the row does: the
// cell sits beside the row's pressable (a button cannot nest in a button), so it needs its own.
export function Actions({ row }: CellContext<{ record: EngineRecord<'orders'> }, 'actions'>) {
	const router = useRouter();
	const t = useT();
	return (
		<IconButton
			testID="order-open-button"
			name="chevronRight"
			size="sm"
			variant="muted"
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
