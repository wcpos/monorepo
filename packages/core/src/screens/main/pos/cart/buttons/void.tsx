import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';
import { useDeleteDocument } from '../../../contexts/use-delete-document';
import { useCurrentOrder } from '../../contexts/current-order';

import type { RxCollection } from 'rxdb';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'void']);

/**
 *
 */
export function VoidButton() {
	const { currentOrder } = useCurrentOrder();
	const router = useRouter();
	const deleteDocument = useDeleteDocument();
	const t = useT();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (orderJson: Record<string, unknown>) => {
			try {
				await currentOrder.collection.insert(orderJson);
				router.setParams({ orderID: orderJson.uuid as string });
			} catch (err) {
				cartLogger.error('Failed to restore order', {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						orderId: orderJson.uuid,
						error: err instanceof Error ? err.message : String(err),
					},
				});
			}
		},
		[router, currentOrder.collection]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(async () => {
		const orderJson = currentOrder.toMutableJSON();
		const latest = currentOrder.getLatest();
		if (latest.id) {
			deleteDocument(latest.id, latest.collection as unknown as { name: string });
		}
		latest.remove();
		cartLogger.success(t('pos_cart.order_removed'), {
			showToast: true,
			saveToDb: true,
			toast: {
				dismissable: true,
				action: {
					label: t('common.undo'),
					onClick: () => undoRemove(orderJson),
				},
			},
			context: {
				orderId: latest.id,
				orderNumber: latest.number,
			},
		});
	}, [currentOrder, t, deleteDocument, undoRemove]);

	/**
	 *
	 */
	return (
		<Button
			testID="void-button"
			size="lg"
			onPress={handleRemove}
			variant="destructive"
			className="flex-1 rounded-t-none rounded-br-none"
		>
			{t('pos_cart.void')}
		</Button>
	);
}
