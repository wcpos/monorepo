import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { awaitWriteOutcome, useQueryRuntime, WriteOutcomeError } from '@wcpos/query';
import { WOO_REST_CANNOT_DELETE } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../../contexts/translations';
import { requestServerDelete } from '../../../hooks/mutations/request-server-delete';
import {
	findEngineResident,
	insertEngineResident,
	patchAndEnqueueEngineResident,
	patchEngineResident,
} from '../../../hooks/mutations/use-local-mutation';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCurrentOrder } from '../../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'void']);

/**
 * One bounded second watch after `awaitWriteOutcome`'s helper timeout: a slow
 * shop or a drain queued behind earlier work can answer after 15s, and a late
 * `woocommerce_rest_cannot_delete` must still convert the void to a status
 * change. Beyond this window the offline-class accepted gap applies (#864).
 */
const LATE_OUTCOME_TIMEOUT_MS = 120_000;

/**
 *
 */
export function VoidButton() {
	// stage-I2: left on proxy face — void/undo reconstructs legacy snapshots across delete outcomes.
	const { currentOrder } = useCurrentOrder();
	const router = useRouter();
	const manager = useQueryRuntime();
	const t = useT();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();

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
					code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
					context: {
						orderId: orderJson.uuid,
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
		// #163 ruling R5: voiding writes a delete (or a status change) that must be
		// recorded locally. With the worker dead the order's fate is unknowable from
		// this device, and the undo path below could not restore it either.
		if (blockIfDegraded('void', { orderId: currentOrder.uuid ?? currentOrder.id })) {
			return;
		}

		const orderJson = currentOrder.toMutableJSON();
		const recordId = currentOrder.uuid!;
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
							void undoRemove(orderJson);
						},
					},
				},
				context: {
					orderId: currentOrder.uuid ?? currentOrder.id,
					orderNumber: currentOrder.number,
				},
			});
		};
		// The refused delete leaves the order resident (removal only happens at
		// delete-ACK), so the fallback is an atomic patch-and-enqueue to status
		// 'pending' — the shared rollback path unwinds the resident if the
		// enqueue fails, and the failure surfaces instead of a success toast.
		const convertToPending = async () => {
			try {
				await patchAndEnqueueEngineResident({
					manager,
					collection: 'orders',
					recordId,
					changes: { status: 'pending' },
				});
				showSuccess(t('pos_cart.order_voided_kept_pending'));
			} catch (err) {
				cartLogger.error('Failed to void order', {
					showToast: true,
					code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
					context: {
						orderId: recordId,
						error: getErrorMessage(err),
					},
				});
			}
		};
		const isCannotDelete = (error: unknown) =>
			error instanceof WriteOutcomeError && error.reason === WOO_REST_CANNOT_DELETE;

		const receipt = await requestServerDelete(manager.engine, {
			collection: 'orders',
			recordId,
		});

		// Only a truly offline engine skips the outcome watch (the accepted gap):
		// the write drain still pushes while 'degraded', so a degraded refusal
		// must convert exactly like an online one.
		if (receipt.annihilated || manager.engine.status().connectivity === 'offline') {
			showSuccess(t('pos_cart.order_removed'));
			return;
		}

		try {
			await awaitWriteOutcome(manager.engine, receipt.mutationId);
			showSuccess(t('pos_cart.order_removed'));
		} catch (error) {
			if (isCannotDelete(error)) {
				await convertToPending();
				return;
			}
			// A terminal-but-different outcome (conflict, other rejection) is owned
			// by the engine's conflict/dead-letter surfaces — keep the optimistic
			// toast and stop watching.
			showSuccess(t('pos_cart.order_removed'));
			if (error instanceof WriteOutcomeError) return;
			// Non-terminal rejection (helper timeout / drain kick failure): the
			// push may still land. One bounded second watch so a late refusal
			// still converts — unless the cashier already undid the void.
			try {
				await awaitWriteOutcome(manager.engine, receipt.mutationId, {
					timeoutMs: LATE_OUTCOME_TIMEOUT_MS,
				});
			} catch (lateError) {
				if (isCannotDelete(lateError) && !undone) {
					await convertToPending();
				}
			}
		}
	}, [blockIfDegraded, currentOrder, manager, t, undoRemove]);

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
