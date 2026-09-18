import type { RegisterSessionCollection, UserDatabase } from '@wcpos/database';
import {
	type MetaDataEntry,
	type OrderPaymentSummary,
	type PaymentRow,
	readLedger,
	toMinor,
	withMetaReplaced,
} from '@wcpos/order-math';
import type { EngineRecord, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { readBoundRegister } from '../../../../services/register/register-document';
import { requireOpenSession } from '../../../../services/register-session/session-store';
import { stockAdjustment } from '../../hooks/use-stock-adjustment';
import { enterReceipt } from './checkout-mode';
import { reconcileCompletedOrder } from './hooks/reconcile-completed-order';
import { completionMeta } from './provenance/stamp-completion';
import { persistProvenance } from './provenance/persist-provenance';
import { reportProvenanceGap } from './provenance/provenance-gap';

export { refreshOrderRecord } from './hooks/reconcile-completed-order';
type OrderPayload = EngineRecord<'orders'>['payload'];
export interface SaleContext {
	userDB: UserDatabase;
	siteUuid: string;
	storeId?: number;
	sessions: RegisterSessionCollection | undefined;
	sessionsOn: boolean;
	runtime: ReturnType<typeof useQueryRuntime>;
	dp: number;
	actor?: { id: string; name: string };
	localPatch: Parameters<typeof persistProvenance>[0]['localPatch'];
	pushDocument: Parameters<typeof persistProvenance>[0]['pushDocument'];
	stockAdjustment?: Parameters<typeof reconcileCompletedOrder>[3];
}

/** Before money: refuse only the completing leg; gateways deliberately have no session gate. */
export async function prepareSale(
	ctx: SaleContext,
	input: {
		order: EngineRecord<'orders'>;
		completing: boolean;
		bindingStatus: 'bound' | 'choose' | 'none';
		sessionRule: 'require' | 'none';
	}
): Promise<
	| { ok: true; registerId: string | null; sessionId: string | null }
	| { ok: false; reason: 'choose_register' }
> {
	if (input.completing && input.bindingStatus === 'choose')
		return { ok: false, reason: 'choose_register' };
	if (input.sessionRule === 'none') return { ok: true, registerId: null, sessionId: null };
	const registerId = (await readBoundRegister(ctx.userDB, ctx.siteUuid, ctx.storeId))?.id ?? null;
	const sessionId = await requireOpenSession(ctx.sessions, registerId, ctx.sessionsOn);
	return { ok: true, registerId, sessionId };
}

/** Online provenance must reach the store BEFORE payment; offline only the split plan is saved. */
export async function persistSaleProvenance(
	ctx: SaleContext,
	input: {
		order: EngineRecord<'orders'>;
		sessionId?: string | null;
		online: boolean;
		extraMeta?: MetaDataEntry[];
	}
): Promise<void> {
	if (input.online) return persistProvenance({ ...ctx, ...input });
	if (!input.extraMeta) return;
	const patched = await ctx.localPatch({
		document: input.order,
		data: {
			meta_data: withMetaReplaced(input.order.getLatest().payload.meta_data, input.extraMeta),
		},
	});
	if (!patched) throw new Error('provenance_save_failed');
}

/** Metadata for the caller's existing atomic ledger/status write, never a second write. */
export async function completionMetaFor(
	ctx: SaleContext,
	meta: MetaDataEntry[] | undefined,
	facts: {
		sessionId?: string | null;
		extraMeta?: MetaDataEntry[];
		order?: { id?: number | null; uuid?: string };
	}
): Promise<MetaDataEntry[]> {
	return withMetaReplaced(
		await completionMeta(
			{ ...facts.order, meta_data: meta },
			{ ...ctx, sessionId: facts.sessionId }
		),
		facts.extraMeta ?? []
	);
}

export type SaleOutcome =
	| {
			source: 'manual';
			via: 'online' | 'offline';
			row: PaymentRow;
			order: OrderPaymentSummary | null;
			mirrorFailed: boolean;
			preLegBalanceMinor: number;
			amountMinor: number;
	  }
	| { source: 'terminal'; row: PaymentRow; order: OrderPaymentSummary | null; balance?: string }
	| { source: 'gateway-contract'; status: string }
	| { source: 'gateway-snapshot'; snapshot: OrderPayload }
	| { source: 'zero-balance' };

export function isSaleComplete(outcome: SaleOutcome, dp: number): boolean {
	switch (outcome.source) {
		case 'manual': // Normal manual completion predicts locally; mirror recovery trusts only the server.
			return outcome.mirrorFailed
				? !!outcome.order && toMinor(outcome.order.balance, dp) === 0
				: outcome.preLegBalanceMinor - outcome.amountMinor === 0;
		case 'terminal': // The narrator uses Number, with derived local balance only when no summary exists.
			return Number(outcome.order ? outcome.order.balance : outcome.balance) === 0;
		case 'gateway-contract': // The contract accepts only its exact completed state.
			return outcome.status === 'completed';
		case 'gateway-snapshot': // Intentionally a blocklist: on-hold and custom paid statuses are accepted.
			return !['pos-open', 'pos-partial', 'pending', 'failed', 'cancelled'].includes(
				outcome.snapshot.status ?? ''
			);
		case 'zero-balance': // No payment row exists for this route.
			return true;
	}
}
export type Presentation =
	{ host: 'stage'; autoShowReceipt: boolean } | { host: 'modal' } | { host: 'background' };

/** Completion is a sale outcome, not a synchronization or exactly-once guarantee. */
export async function completeSale(
	ctx: SaleContext,
	order: EngineRecord<'orders'>,
	outcome: SaleOutcome,
	presentation: Presentation
): Promise<'completed' | 'partial' | 'not-completed'> {
	if (!isSaleComplete(outcome, ctx.dp))
		return outcome.source === 'manual' || outcome.source === 'terminal'
			? 'partial'
			: 'not-completed';
	// Enter BEFORE refresh: the paid order has left pos-open and otherwise the cashier sees an empty cart.
	if (presentation.host === 'background') enterReceipt(order.uuid, { select: false });
	if (presentation.host === 'stage' && presentation.autoShowReceipt) enterReceipt(order.uuid);
	const payload = () =>
		outcome.source === 'gateway-snapshot' ? outcome.snapshot : order.getLatest().payload;
	let latest = payload();
	await reportProvenanceGap({
		...ctx,
		order: { id: latest.id, uuid: order.uuid, meta_data: latest.meta_data },
	});
	const refresh =
		outcome.source === 'manual'
			? outcome.via === 'online'
			: outcome.source === 'terminal'
				? !outcome.row.recorded_offline
				: outcome.source === 'gateway-contract';
	if (outcome.source === 'gateway-snapshot') {
		const reduced = (latest.line_items ?? []).filter((item) =>
			(item.meta_data as { key: string }[] | undefined)?.some(
				(meta) => meta.key === '_reduced_stock'
			)
		);
		if (ctx.stockAdjustment) ctx.stockAdjustment(reduced);
		else stockAdjustment(ctx.runtime, reduced);
	} else await reconcileCompletedOrder(ctx.runtime, order, refresh, ctx.stockAdjustment);
	latest = payload();
	getLogger(['wcpos', 'pos', 'checkout']).info(`Sale ${order.uuid} completed`, {
		actor: ctx.actor,
		context: {
			type: 'checkout.completed',
			orderId: latest.id ?? null,
			orderUUID: order.uuid,
			orderNumber: latest.number,
			total: latest.total,
			paymentLegs: readLedger(latest.meta_data).filter(
				(row) => row.status === 'captured' || (row.status === 'authorized' && row.recorded_offline)
			).length,
		},
	});
	return 'completed';
}
