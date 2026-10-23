import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../../contexts/translations';
import { reportPushFailure } from '../../../contexts/push-failure-code';
import { usePushDocument } from '../../../contexts/use-push-document';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCurrentOrder } from '../../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'save']);

/**
 *
 */
export function SaveButton({
	onBeforePush,
}: {
	/** Awaited before the push: the order sheet's pending autosave, so the push carries it. */
	onBeforePush?: () => Promise<void>;
} = {}) {
	const { currentOrderRecord } = useCurrentOrder();
	const pushDocument = usePushDocument();
	const [loading, setLoading] = React.useState(false);
	const t = useT();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();

	/**
	 *
	 */
	const handleSave = React.useCallback(async () => {
		// #163 ruling R5: an order save that cannot reach local storage leaves the
		// cashier with a "saved" order that exists nowhere on this device.
		if (
			blockIfDegraded('save-order', {
				orderId: currentOrderRecord.uuid ?? currentOrderRecord.payload.id,
			})
		) {
			return;
		}

		setLoading(true);
		try {
			await onBeforePush?.();
			await pushDocument(currentOrderRecord).then((savedDoc) => {
				/**
				 * TODO; move this generic sanckbar to the pushDocument hook
				 */
				if (savedDoc) {
					const saved = currentOrderRecord.getLatest().payload;
					cartLogger.success(t('pos_cart.order_synced', { number: saved.number }), {
						showToast: true,
						context: {
							orderId: saved.id,
							orderNumber: saved.number,
						},
					});
				}
			});
		} catch (error) {
			reportPushFailure(cartLogger, 'Failed to save order', error, {
				title: t('common.failed_to_save_order'),
				stillSendingTitle: t('common.order_still_sending'),
				context: { orderId: currentOrderRecord.payload.id },
			});
		} finally {
			setLoading(false);
		}
	}, [blockIfDegraded, currentOrderRecord, onBeforePush, pushDocument, t]);

	/**
	 *
	 */
	return (
		<View>
			<Button
				testID="save-to-server-button"
				onPress={handleSave}
				loading={loading}
				disabled={loading || storageDegraded}
			>
				{t('pos_cart.sync_order')}
			</Button>
		</View>
	);
}
