import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'void']);
import useDeleteDocument from '../../../contexts/use-delete-document';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const VoidButton = () => {
	const { currentOrder } = useCurrentOrder();
	const router = useRouter();
	const deleteDocument = useDeleteDocument();
	const t = useT();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (orderJson) => {
			try {
			await currentOrder.collection.insert(orderJson);
			router.setParams({ orderID: orderJson.uuid });
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
		const orderJson = await currentOrder.toPopulatedJSON();
		const latest = currentOrder.getLatest();
		if (latest.id) {
			deleteDocument(latest.id, latest.collection);
		}
		latest.remove();
		cartLogger.success(t('Order removed', { _tags: 'core' }), {
			showToast: true,
			saveToDb: true,
			toast: {
				dismissable: true,
				action: {
					label: t('Undo', { _tags: 'core' }),
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
			size="lg"
			onPress={handleRemove}
			variant="destructive"
			className="flex-1 rounded-t-none rounded-br-none"
		>
			{t('Void', { _tags: 'core' })}
		</Button>
	);
};
