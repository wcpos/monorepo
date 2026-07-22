import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';
import {
	findEngineResident,
	insertEngineResident,
	patchEngineResident,
} from '../../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'void']);

/**
 *
 */
export function VoidButton() {
	const { currentOrder } = useCurrentOrder();
	const router = useRouter();
	const manager = useQueryManager();
	const t = useT();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (orderJson: Record<string, unknown>) => {
			try {
				const recordId = String(orderJson.uuid ?? '');
				if (!recordId) throw new Error('Cannot restore an order without a uuid');
				const existing = await findEngineResident(manager, 'orders', recordId);
				if (existing) {
					const restored = await patchEngineResident({
						manager,
						collection: 'orders',
						recordId,
						changes: orderJson,
					});
					await manager.engine.write({
						collection: 'orders',
						operation: 'update',
						recordId,
						payload: restored.get('payload') as Record<string, unknown>,
					});
				} else {
					const payload = { ...orderJson, id: 0 };
					const resident = await insertEngineResident({
						manager,
						collection: 'orders',
						recordId,
						payload,
					});
					await manager.engine.write({
						collection: 'orders',
						operation: 'create',
						recordId,
						payload: resident.get('payload') as Record<string, unknown>,
					});
				}
				router.setParams({ orderId: [recordId] });
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
		[manager, router]
	);

	/**
	 *
	 */
	const handleRemove = React.useCallback(async () => {
		const orderJson = currentOrder.toMutableJSON();
		await manager.engine.write({
			collection: 'orders',
			operation: 'delete',
			recordId: currentOrder.uuid!,
		});
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
				orderId: currentOrder.uuid ?? currentOrder.id,
				orderNumber: currentOrder.number,
			},
		});
	}, [currentOrder, manager, t, undoRemove]);

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
