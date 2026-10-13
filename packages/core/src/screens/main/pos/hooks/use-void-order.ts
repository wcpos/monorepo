import * as React from 'react';

import { readLedger } from '@wcpos/order-math';
import { useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { enqueueOrderMutation } from './order-mutation-queue';
import { useActionContext } from './use-action-context';
import { useT } from '../../../../contexts/translations';
import {
	dispatchAction,
	isActionRefusal,
	ORDER_VOID_EVENT,
	ORDER_VOID_GUARD_IDS,
	presentActionRefusal,
} from '../../../../extensions/actions';
import { getCurrentBoundRegisterId } from '../../../../services/register/register-document';
import { RegisterSessionRequiredError } from '../../../../services/register-session/session-store';
import { getTerminalPaymentsService } from '../../../../services/terminal-payments';
import { useStorageMoneyPathGuard } from '../../hooks/use-storage-health';
import '../cart/void-audit-hook';
import '../cart/void-guards';
import { restoreVoidedOrder, voidOrder, type VoidOrderResult } from '../cart/void-order';
import { useCurrentOrderActions, useCurrentOrderRecord } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'void']);

/**
 * The void path for the current order: the Undo snapshot, `cart.order.void` through its gate,
 * the refusal presentation and the failure toasts. The order sheet's Void button presses it; the
 * cart column registers it as the `void` surface so `pos.cart.void` runs it while the cart is
 * mounted, sheet open or not (roadmap#428, PR 1b).
 */
export function useVoidOrder({ onBeforeVoid }: { onBeforeVoid?: () => void } = {}): {
	voidOrder: () => Promise<void>;
	storageDegraded: boolean;
} {
	const currentOrder = useCurrentOrderRecord();
	const { getCurrentOrderRecord, setCurrentOrderID } = useCurrentOrderActions();
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
				// Through the provider, not the route: a kept-cancelled void left the order, which
				// parks its id in the route, and only selecting it again releases that.
				setCurrentOrderID(recordId);
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
		[manager, setCurrentOrderID]
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
		// A kept-cancelled order is cancelled on the store, not open, so it leaves the tabs; the cart
		// moves to a blank order. Only if the cashier is still on it: the store's answer can come much later.
		const leaveKeptOrder = () => {
			if (getCurrentOrderRecord().uuid === recordId) setCurrentOrderID('');
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
		if (outcome.kind === 'kept-cancelled') {
			showSuccess(t('pos_cart.order_voided_cancelled'));
			leaveKeptOrder();
			return;
		}
		showSuccess(t('pos_cart.order_removed'));
		if (!outcome.late) return;
		// The store may still refuse the delete after the first watch ran out; the writer keeps
		// watching and converts, and the cashier hears about it, or about a failed conversion.
		// The audit row said `removed`; the correction is a second row, after the slot.
		try {
			if ((await outcome.late) === 'kept-cancelled') {
				showSuccess(t('pos_cart.order_voided_cancelled'));
				if (!undone) leaveKeptOrder();
				ctx.log('info', `Order ${recordId} cancelled on the store after a late refusal`, {
					category: ['wcpos', 'pos', 'cart', 'void'],
					actor: cashier ?? undefined,
					context: {
						type: 'order.voided',
						orderId: (orderPayload.id as number | undefined) ?? null,
						orderUUID: recordId,
						orderNumber: (orderPayload.number as string | undefined) ?? null,
						// The status before the void, as on the first row; the outcome says what happened.
						status: (orderPayload.status as string | undefined) ?? '',
						outcome: 'kept-cancelled',
						late: true,
						registerId: registerId ?? null,
						sessionId: voidedIn,
					},
				});
			}
		} catch (err) {
			reportFailure(err);
		}
	}, [
		blockIfDegraded,
		currentOrder,
		manager,
		t,
		undoRemove,
		onBeforeVoid,
		ctx,
		actor,
		cashier,
		getCurrentOrderRecord,
		setCurrentOrderID,
	]);

	return { voidOrder: handleRemove, storageDegraded };
}
