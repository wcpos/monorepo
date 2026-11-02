import type { EngineRecord } from '@wcpos/query';

import { commitSale } from './commit-sale';
import { persistSaleProvenance, recordSaleAttempt, type SaleContext } from './sale-completion';

import type { ActionRefusal } from '../../../../extensions/actions';

type StampedSession = { registerId: string | null; sessionId: string | null };

/** Journal and stamp provenance through the shared sale commit before reaching the gateway. */
export async function commitGatewaySale(
	ctx: SaleContext,
	input: {
		order: EngineRecord<'orders'>;
		source: 'gateway-contract' | 'gateway-snapshot';
		methodId: string | null;
		bindingStatus: 'bound' | 'choose' | 'none';
		online: boolean;
		/** The gateway's stored POS Order Status, journaled for the attempt's replay. */
		settledOrderStatus?: string | null;
		/**
		 * Every gateway's stored status, keyed by id — journaled instead of one status when
		 * the pay page can settle through a gateway other than the one the sale opened with.
		 */
		settledOrderStatuses?: Record<string, string | null>;
	}
): Promise<ActionRefusal | StampedSession> {
	const { order, source, online } = input;
	return commitSale(
		ctx,
		{ ...input, amounts: { kind: 'whole-balance' } },
		async ({ registerId, sessionId, completing }) => {
			await recordSaleAttempt(ctx, {
				order,
				completing,
				source,
				settledOrderStatus: input.settledOrderStatus,
				settledOrderGateway: input.methodId ?? undefined,
				settledOrderStatuses: input.settledOrderStatuses,
			});
			await persistSaleProvenance(ctx, { order, source, sessionId, online });
			return { registerId, sessionId } satisfies StampedSession;
		}
	);
}
