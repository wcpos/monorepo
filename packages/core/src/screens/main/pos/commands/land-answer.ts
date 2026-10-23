import cloneDeep from 'lodash/cloneDeep';

import { hasSaleProvenance, isCompletingStatus } from '@wcpos/order-math';
import type { EngineRecord, MoneyCommandPoster } from '@wcpos/query';

import { refreshOrderRecord } from '../checkout/hooks/reconcile-completed-order';
import { completionMetaFor, type SaleContext } from '../checkout/sale-completion';

export type Mirrored = { mirrored: true } | { mirrored: false; cause: unknown };

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

type MirrorDeps = {
	ctx: Pick<SaleContext, 'userDB' | 'siteUuid' | 'storeId' | 'stampCompletion' | 'runtime'>;
	order: EngineRecord<'orders'>;
	poster: Pick<MoneyCommandPoster, 'mirror'>;
	facts?: Parameters<typeof completionMetaFor>[2];
};

/**
 * The one mirror policy for a store answer (record, gateway): mirror, stamp, and pull the store's
 * copy on any local failure. That failure is an outcome ("recorded, not synced"); nothing throws.
 */
export function mirrorAnswer({ ctx, order, poster, facts }: MirrorDeps) {
	const pull = async () => refreshOrderRecord(ctx.runtime, Number(order.getLatest().payload.id));
	return async (
		answer: Parameters<MoneyCommandPoster['mirror']>[0],
		{ stamp = true }: { stamp?: boolean } = {}
	): Promise<Mirrored> => {
		try {
			await poster.mirror(answer);
			if (stamp) await stampCompletionIfMissing(ctx, order, answer.order?.status, facts);
			return { mirrored: true };
		} catch (cause) {
			await pull().catch(() => undefined);
			return { mirrored: false, cause };
		}
	};
}
