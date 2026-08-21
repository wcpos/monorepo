import * as React from 'react';
import { View } from 'react-native';

import { isRxDocument } from 'rxdb';

import { Button } from '@wcpos/components/button';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { OrderDocument } from '@wcpos/database';

import { useT } from '../../../../../contexts/translations';
import { usePushDocument } from '../../../contexts/use-push-document';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCurrentOrder } from '../../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'save']);

/**
 *
 */
export function SaveButton() {
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
			await pushDocument(currentOrderRecord).then((savedDoc) => {
				/**
				 * TODO; move this generic sanckbar to the pushDocument hook
				 */
				if (isRxDocument(savedDoc)) {
					const orderDoc = savedDoc as unknown as OrderDocument;
					cartLogger.success(t('common.order_saved', { number: orderDoc.number }), {
						showToast: true,
						context: {
							orderId: orderDoc.id,
							orderNumber: orderDoc.number,
						},
					});
				}
			});
		} catch (error) {
			const errorMessage = getErrorMessage(error);
			cartLogger.error('Failed to save order', {
				showToast: true,
				code: ERROR_CODES.SYNC_UNEXPECTED,
				toast: { title: t('common.failed_to_save_order') },
				context: {
					orderId: currentOrderRecord.payload.id,
					error: errorMessage,
				},
			});
		} finally {
			setLoading(false);
		}
	}, [blockIfDegraded, currentOrderRecord, pushDocument, t]);

	/**
	 *
	 */
	return (
		<View>
			<Button
				testID="save-to-server-button"
				variant="outline"
				onPress={handleSave}
				loading={loading}
				disabled={loading || storageDegraded}
			>
				{t('pos_cart.save_to_server')}
			</Button>
		</View>
	);
}
