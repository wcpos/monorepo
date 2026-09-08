import {
	awaitTerminalWriteOutcome,
	awaitWriteSettlement,
	useQueryRuntime,
	WriteOutcomeError,
} from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../../contexts/translations';
import { enqueueDocumentWrite } from '../../../contexts/use-push-document';
import { findEngineResident } from '../../../hooks/mutations/use-local-mutation';
import {
	clearOrderSaveIfMutation,
	clearOrderSaving,
	getOrderSaveState,
	markOrderQueuedOffline,
	markOrderSaveRejected,
} from '../checkout-mode';

type EngineResident = NonNullable<Awaited<ReturnType<typeof findEngineResident>>>;
export type CheckoutRejection = {
	status: number | null;
	reason: string | null;
	message: string | null;
};
export type CheckoutSaveResult =
	| { outcome: 'saved'; resident: EngineResident }
	| { outcome: 'queued-offline' }
	| { outcome: 'rejected'; rejection: CheckoutRejection };

const logger = getLogger(['wcpos', 'pos', 'checkout']);
const rejectionOf = (error: WriteOutcomeError): CheckoutRejection => ({
	status: error.status ?? null,
	reason: error.reason ?? null,
	message: error.serverMessage ?? null,
});

export function useCheckoutSave() {
	const runtime = useQueryRuntime();
	const t = useT();
	return async (
		record: Parameters<typeof enqueueDocumentWrite>[1],
		handlers: { onLateRejected(rejection: CheckoutRejection): void }
	): Promise<CheckoutSaveResult> => {
		const uuid = record.uuid!;
		try {
			const {
				collectionName,
				recordId,
				receipt: { mutationId },
			} = await enqueueDocumentWrite(runtime, record);
			const settlement = await awaitWriteSettlement(runtime.engine, mutationId);
			if (settlement === 'queued-offline') {
				markOrderQueuedOffline(uuid, mutationId);
				void awaitTerminalWriteOutcome(runtime.engine, mutationId).then(
					() => clearOrderSaveIfMutation(uuid, mutationId),
					(error) => {
						if (!(error instanceof WriteOutcomeError)) return;
						// Still this attempt's entry, or the durable dead letter already marked it
						// (the queue subscription can land before this event). Only a NEWER attempt
						// — a fresh `saving` or another mutation queued offline — makes this stale.
						const state = getOrderSaveState(uuid);
						const ours =
							state?.kind === 'rejected' ||
							(state?.kind === 'queued-offline' && state.mutationId === mutationId);
						if (!ours) return;
						const rejection = rejectionOf(error);
						markOrderSaveRejected(uuid, rejection);
						handlers.onLateRejected(rejection);
					}
				);
				return { outcome: 'queued-offline' };
			}
			const resident = await findEngineResident(runtime, collectionName, recordId);
			if (!resident)
				throw new Error(`Engine resident "${recordId}" is missing after its write outcome`);
			clearOrderSaving(uuid);
			return { outcome: 'saved', resident };
		} catch (error) {
			if (error instanceof WriteOutcomeError) {
				const rejection = rejectionOf(error);
				markOrderSaveRejected(uuid, rejection);
				return { outcome: 'rejected', rejection };
			}
			clearOrderSaving(uuid);
			logger.error('Checkout save failed', {
				showToast: true,
				code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
				toast: { title: t('pos_cart.checkout_failed') },
				context: { error },
			});
			throw error;
		}
	};
}
