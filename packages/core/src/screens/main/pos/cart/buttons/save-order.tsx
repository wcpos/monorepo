import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';

import { useT } from '../../../../../contexts/translations';
import { useSyncOrder } from '../../../hooks/use-sync-order';
import { useCurrentOrder } from '../../contexts/current-order';

export function SaveButton({
	onBeforePush,
}: {
	/**
	 * Awaited before the push: the order sheet's pending autosave, so the push carries it. False
	 * means the edit did not land (already reported), and there is no push.
	 */
	onBeforePush?: () => Promise<boolean>;
} = {}) {
	const { currentOrderRecord } = useCurrentOrder();
	const { sync, loading, disabled } = useSyncOrder(currentOrderRecord, onBeforePush);
	const t = useT();

	/**
	 *
	 */
	return (
		<View>
			<Button testID="save-to-server-button" onPress={sync} loading={loading} disabled={disabled}>
				{t('pos_cart.sync_order')}
			</Button>
		</View>
	);
}
