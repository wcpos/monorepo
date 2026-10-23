import cloneDeep from 'lodash/cloneDeep';

import { hasSaleProvenance, isCompletingStatus } from '@wcpos/order-math';
import type { EngineRecord, MoneyCommandPoster } from '@wcpos/query';

import { refreshOrderRecord } from '../checkout/hooks/reconcile-completed-order';
import { completionMetaFor, type SaleContext } from '../checkout/sale-completion';

export type NotMirrored = { cause: unknown } | null;

/** A mirror that put a completing status on the order stamps its provenance, unless held. */
export async function stampCompletionIfMissing(
	ctx: Pick<SaleContext, 'userDB' | 'siteUuid' | 'storeId' | 'stampCompletion'>,
	order: EngineRecord<'orders'>,
	status: string | null | undefined,
	facts: Parameters<typeof completionMetaFor>[2] = {}
): Promise<void> {
	if (!isCompletingStatus(status ?? '')) return;
	const meta = cloneDeep((order.getLatest?.() ?? order).payload.meta_data ?? []);
	if (hasSaleProvenance(meta)) return;
	if (!(await ctx.stampCompletion(order, await completionMetaFor(ctx, meta, facts))))
		throw new Error('provenance_save_failed');
}

/**
 * The one mirror policy for a store answer (record, gateway): mirror, stamp an accepted answer, and
 * pull the store's copy on any local failure. Never rejects: that failure is `{ cause }`.
 */
export function mirrorAnswer(deps: {
	ctx: Pick<SaleContext, 'userDB' | 'siteUuid' | 'storeId' | 'stampCompletion' | 'runtime'>;
	order: EngineRecord<'orders'>;
	poster: Pick<MoneyCommandPoster, 'mirror'>;
	facts?: Parameters<typeof completionMetaFor>[2];
}) {
	const { ctx, order, poster, facts } = deps;
	const pull = async () => refreshOrderRecord(ctx.runtime, Number(order.getLatest().payload.id));
	return async (
		answer: Parameters<MoneyCommandPoster['mirror']>[0],
		{ accepted = true }: { accepted?: boolean } = {}
	): Promise<NotMirrored> => {
		try {
			await poster.mirror(answer);
			if (accepted) await stampCompletionIfMissing(ctx, order, answer.order?.status, facts);
			return null;
		} catch (cause) {
			await pull().catch(() => undefined);
			return { cause };
		}
	};
}
