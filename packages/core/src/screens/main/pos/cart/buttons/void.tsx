import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../../contexts/translations';
import { getCurrentBoundRegisterId } from '../../../../../services/register/register-document';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCurrentOrderRecord } from '../../contexts/current-order';
import { restoreVoidedOrder, voidOrder } from '../void-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'void']);

/**
 *
 */
export function VoidButton({ onBeforeVoid }: { onBeforeVoid?: () => void } = {}) {
	const currentOrder = useCurrentOrderRecord();
	const router = useRouter();
	const manager = useQueryRuntime();
	const t = useT();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (recordId: string, orderPayload: Record<string, unknown>) => {
			try {
				await restoreVoidedOrder(manager, recordId, orderPayload);
				router.setParams({ orderId: [recordId] });
			} catch (err) {
				cartLogger.error('Failed to restore order', {
					showToast: true,
					code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
					context: {
						orderId: recordId,
						error: getErrorMessage(err),
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
		onBeforeVoid?.();
		const registerId = getCurrentBoundRegisterId() ?? undefined;
		// #163 ruling R5: voiding writes a delete (or a status change) that must be
		// recorded locally. With the worker dead the order's fate is unknowable from
		// this device, and the undo path below could not restore it either.
		if (blockIfDegraded('void', { orderId: currentOrder.uuid })) {
			return;
		}

		const orderPayload = currentOrder.getLatest().toMutableJSON().payload;
		const recordId = currentOrder.uuid;
		let undone = false;
		const showSuccess = (message: string) => {
			cartLogger.success(message, {
				showToast: true,
				toast: {
					dismissable: true,
					action: {
						label: t('common.undo'),
						onClick: () => {
							undone = true;
							void undoRemove(recordId, orderPayload);
						},
					},
				},
				context: {
					orderId: recordId,
					orderNumber: orderPayload.number,
				},
			});
		};
		const reportFailure = (err: unknown) =>
			cartLogger.error('Failed to void order', {
				showToast: true,
				code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
				context: { orderId: recordId, error: getErrorMessage(err) },
			});

		let outcome: Awaited<ReturnType<typeof voidOrder>>;
		try {
			outcome = await voidOrder(manager, { recordId, registerId, undone: () => undone });
		} catch (err) {
			reportFailure(err);
			return;
		}
		if (outcome.kind === 'kept-pending') {
			showSuccess(t('pos_cart.order_voided_kept_pending'));
			return;
		}
		showSuccess(t('pos_cart.order_removed'));
		if (!outcome.late) return;
		// The store may still refuse the delete after the first watch ran out; the writer keeps
		// watching and converts, and the cashier hears about it, or about a failed conversion.
		try {
			if ((await outcome.late) === 'kept-pending')
				showSuccess(t('pos_cart.order_voided_kept_pending'));
		} catch (err) {
			reportFailure(err);
		}
	}, [blockIfDegraded, currentOrder, manager, t, undoRemove, onBeforeVoid]);

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
			disabled={storageDegraded}
		>
			{t('pos_cart.void')}
		</Button>
	);
}
