import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { readLedger } from '@wcpos/order-math';
import { useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../../contexts/translations';
import {
	dispatchAction,
	isActionRefusal,
	ORDER_VOID_EVENT,
	ORDER_VOID_GUARD_IDS,
	presentActionRefusal,
} from '../../../../../extensions/actions';
import { useRegisterSurface } from '../../../../../extensions/commands/use-register-surface';
import { getCurrentBoundRegisterId } from '../../../../../services/register/register-document';
import { RegisterSessionRequiredError } from '../../../../../services/register-session/session-store';
import { getTerminalPaymentsService } from '../../../../../services/terminal-payments';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCurrentOrderRecord } from '../../contexts/current-order';
import { enqueueOrderMutation } from '../../hooks/order-mutation-queue';
import { useActionContext } from '../../hooks/use-action-context';
import '../void-audit-hook';
import '../void-guards';
import { restoreVoidedOrder, voidOrder, type VoidOrderResult } from '../void-order';

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
	const { ctx, actor, cashier } = useActionContext();

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

		// The Undo snapshot is taken inside the queue slot, below, so an edit queued ahead is kept.
		let orderPayload: Record<string, unknown> = currentOrder.getLatest().toMutableJSON().payload;
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

		let outcome: VoidOrderResult;
		let voidedIn: string | null = null;
		try {
			// The void is a cart action: the gate may refuse it, the audit row observes it. The
			// writer's first bounded watch runs inside the order's queue slot; the late watch does not.
			const dispatched = await enqueueOrderMutation(recordId, async (queue) => {
				// Counted inside the slot: a tender commit queued ahead has landed its leg by now, so
				// the gate judges the order as it is, and never reads a document itself.
				const latest = (queue.order ?? currentOrder).getLatest().toMutableJSON().payload;
				orderPayload = latest;
				const ledger = readLedger(latest.meta_data as Parameters<typeof readLedger>[0]);
				const live = (row: { status: string }) =>
					row.status === 'pending' || row.status === 'authorized';
				const captured = (row: { status: string }) => row.status === 'captured';
				// A terminal leg the service still holds and the ledger does not show yet counts too:
				// in flight, the reader may still capture; settled with a captured row (the ledger write
				// failed), the money is real. One already mirrored into the ledger is counted there.
				const heldLeg = getTerminalPaymentsService()?.get(recordId);
				const heldUnmirrored =
					heldLeg && !ledger.some((row) => row.id === heldLeg.row.id) ? heldLeg : null;
				const heldLive = heldUnmirrored && heldUnmirrored.phase !== 'final' ? 1 : 0;
				const heldCaptured = heldUnmirrored && captured(heldUnmirrored.row) ? 1 : 0;
				const paymentLegs = {
					live: ledger.filter(live).length + heldLive,
					captured: ledger.filter(captured).length + heldCaptured,
					device:
						ledger.filter((row) => row.capture_mode === 'device' && (live(row) || captured(row)))
							.length +
						(heldUnmirrored?.row.capture_mode === 'device' && (heldLive || heldCaptured) ? 1 : 0),
				};
				// A read: the session the void happens in, for the row. A void needs no open session,
				// so a register whose sessions are on with none open is simply "no session".
				const sessionId = await ctx.register.resolveSession().then(
					(resolved) => resolved.sessionId,
					(error: unknown) => {
						if (error instanceof RegisterSessionRequiredError) return null;
						throw error;
					}
				);
				voidedIn = sessionId;
				return dispatchAction({
					event: ORDER_VOID_EVENT,
					requiredGuards: ORDER_VOID_GUARD_IDS,
					token: queue.dispatchToken,
					ctx,
					input: {
						orderId: recordId,
						actor,
						source: 'user',
						payload: {
							orderId: (latest.id as number | undefined) ?? null,
							orderNumber: (latest.number as string | undefined) ?? null,
							status: (latest.status as string | undefined) ?? '',
							registerId: registerId ?? null,
							sessionId,
							actor: cashier ?? null,
							paymentLegs,
						},
					},
					bottom: () => voidOrder(manager, { recordId, registerId, undone: () => undone }),
				});
			});
			if (isActionRefusal(dispatched)) {
				presentActionRefusal(ctx, dispatched, {
					orderId: recordId,
					orderNumber: orderPayload.number,
				});
				return;
			}
			// A non-refusal is the writer's return (a hook answering without `next` is refused).
			outcome = dispatched as VoidOrderResult;
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
		// The audit row said `removed`; the correction is a second row, after the slot.
		try {
			if ((await outcome.late) === 'kept-pending') {
				showSuccess(t('pos_cart.order_voided_kept_pending'));
				ctx.log('info', `Order ${recordId} kept as pending after a late refusal`, {
					category: ['wcpos', 'pos', 'cart', 'void'],
					actor: cashier ?? undefined,
					context: {
						type: 'order.voided',
						orderId: (orderPayload.id as number | undefined) ?? null,
						orderUUID: recordId,
						orderNumber: (orderPayload.number as string | undefined) ?? null,
						status: 'pending',
						outcome: 'kept-pending',
						late: true,
						registerId: registerId ?? null,
						sessionId: voidedIn,
					},
				});
			}
		} catch (err) {
			reportFailure(err);
		}
	}, [blockIfDegraded, currentOrder, manager, t, undoRemove, onBeforeVoid, ctx, actor, cashier]);
	// `pos.cart.void` runs this same path while the button is mounted (roadmap#428).
	useRegisterSurface('void', handleRemove);

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
