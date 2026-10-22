import { isPaidStatus, POS_META_KEYS } from '@wcpos/sync-core';
import type { StoreDatabase, UserDatabase } from '@wcpos/query/user-db';
import {
	activeAwaitingCustomer,
	type AwaitingCustomerStamp,
	isCompletingStatus,
	isSettledPaymentRow,
	type MetaDataEntry,
	type OrderPaymentSummary,
	type PaymentRow,
	readLedger,
	toMinor,
	withMetaReplaced,
} from '@wcpos/order-math';
import type { EngineRecord, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import {
	failCompletionAttempt,
	recordCompletionAttempt,
	resolveCompletionAttempt,
} from '@wcpos/query/store-local';

import {
	type ActionActor,
	type ActionContext,
	type ActionResult,
	CHECKOUT_COMPLETE_EVENT,
	dispatchAction,
	type DispatchToken,
	isActionRefusal,
} from '../../../../extensions/actions';
import { enqueueOrderMutation, type OrderMutationContext } from '../hooks/order-mutation-queue';
import './audit-hook';
import { stockAdjustment } from '../../hooks/use-stock-adjustment';
import { enterReceipt } from './checkout-mode';
import { reconcileCompletedOrder, refreshOrderRecord } from './hooks/reconcile-completed-order';
import { completionMeta } from './provenance/stamp-completion';
import { persistProvenance } from './provenance/persist-provenance';
import { reportProvenanceGap } from './provenance/provenance-gap';

export { refreshOrderRecord } from './hooks/reconcile-completed-order';
type OrderPayload = EngineRecord<'orders'>['payload'];
export interface SaleContext {
	actionCtx: ActionContext;
	actionActor: ActionActor;
	userDB: UserDatabase;
	storeDB: StoreDatabase;
	siteUuid: string;
	storeId?: number;
	sessionsOn: boolean;
	runtime: ReturnType<typeof useQueryRuntime>;
	dp: number;
	actor?: { id: string; name: string };
	stampCompletion: Parameters<typeof persistProvenance>[0]['stampCompletion'];
	pushDocument: Parameters<typeof persistProvenance>[0]['pushDocument'];
	stockAdjustment?: Parameters<typeof reconcileCompletedOrder>[3];
}

export async function recordSaleAttempt(
	ctx: SaleContext,
	input: {
		order: EngineRecord<'orders'>;
		completing: boolean;
		source: SaleOutcome['source'];
		/** A gateway sale's stored POS Order Status (see isSettledOrderStatus), for its replay. */
		settledOrderStatus?: string | null;
		settledOrderGateway?: string;
		/** Every gateway's stored status, keyed by id, for a pay-page sale's replay. */
		settledOrderStatuses?: Record<string, string | null>;
	}
): Promise<void> {
	if (input.completing)
		await recordCompletionAttempt(ctx.storeDB, {
			orderUuid: input.order.uuid,
			source: input.source,
			...(ctx.actor ? { actor: ctx.actor } : {}),
			...(input.settledOrderStatus != null ? { settledOrderStatus: input.settledOrderStatus } : {}),
			...(input.settledOrderStatus != null && input.settledOrderGateway != null
				? { settledOrderGateway: input.settledOrderGateway }
				: {}),
			...(input.settledOrderStatuses ? { settledOrderStatuses: input.settledOrderStatuses } : {}),
		});
}

/** Online provenance must reach the store BEFORE payment; offline only the split plan is saved. */
export async function persistSaleProvenance(
	ctx: SaleContext,
	input: {
		order: EngineRecord<'orders'>;
		sessionId?: string | null;
		online: boolean;
		source?: SaleOutcome['source'];
		extraMeta?: MetaDataEntry[];
	}
): Promise<void> {
	const latest = input.order.getLatest().payload;
	// Tender legs already took money in their first session; only unpaid gateways can move.
	if (
		input.online &&
		(input.source === 'gateway-contract' || input.source === 'gateway-snapshot') &&
		input.sessionId &&
		!isCompletingStatus(latest.status ?? '') &&
		!readLedger(latest.meta_data).some((row) => row.status === 'captured')
	) {
		// The counter is the order's identity for the day; the session is where the money will land.
		input = {
			...input,
			extraMeta: withMetaReplaced(input.extraMeta, [
				{ key: POS_META_KEYS.session, value: input.sessionId },
			]),
		};
	}
	if (input.online) return persistProvenance({ ...ctx, ...input });
	if (!input.extraMeta) return;
	const patched = await ctx.stampCompletion(
		input.order,
		withMetaReplaced(input.order.getLatest().payload.meta_data, input.extraMeta)
	);
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
			preparedCompleting: boolean;
			preLegBalanceMinor: number;
			amountMinor: number;
	  }
	| { source: 'terminal'; row: PaymentRow; order: OrderPaymentSummary | null; balance?: string }
	/**
	 * Contract 1.2 `sent`: the gateway sent the customer away to pay (an invoice, a link) and
	 * the sale leaves the till without money. A `recorded` answer never arrives here: it is a
	 * `manual` outcome with the returned row, exactly as a manual record (spec §4.2).
	 */
	| { source: 'gateway'; order: OrderPaymentSummary; stamp: AwaitingCustomerStamp }
	/**
	 * Contract 1.2 `settled`: no money and no stamp, but the gateway landed the order on the
	 * status the merchant stored for it (spec §3.1) — a finished sale, completed with the
	 * ledger as it is (the receipt prints the balance due, no row is minted).
	 */
	| { source: 'gateway-settled'; order: OrderPaymentSummary }
	| { source: 'gateway-contract'; status: string }
	| {
			source: 'gateway-snapshot';
			snapshot: OrderPayload;
			/**
			 * The status the merchant stored for the snapshot's own gateway
			 * (`settled_order_status` from the gateway catalog), or null/undefined when
			 * none is stored, the store predates the field, or the order was paid through
			 * another gateway. See isSettledOrderStatus.
			 */
			settledOrderStatus?: string | null;
	  }
	| { source: 'zero-balance' }
	| {
			source: 'replay';
			refreshed?: boolean;
			settledOrderGateway?: string;
			/** The status journaled with a gateway attempt (recordSaleAttempt); see isSettledOrderStatus. */
			settledOrderStatus?: string | null;
			/**
			 * The catalog a pay-page attempt journaled, keyed by gateway id. When present it wins:
			 * the status is looked up for the gateway the judged order carries (see replayStoredStatus).
			 */
			settledOrderStatuses?: Record<string, string | null>;
	  };

/**
 * Statuses that never settle a sale whatever the merchant stored: the parked POS statuses
 * are open carts, `failed`/`cancelled` are a payment that did not happen, and `refunded`/
 * `trash` are a sale that is undone or gone. The settings picker offers every registered
 * status, so a stored `failed` is reachable through the UI; honouring it would report a
 * failed payment as a finished sale.
 */
const NEVER_SETTLED_STATUSES = [
	'pos-open',
	'pos-partial',
	'failed',
	'cancelled',
	'refunded',
	'trash',
];

/**
 * Whether a gateway-snapshot status means the sale is settled at the till.
 *
 * Two things settle a sale: WooCommerce calling the order paid (sync-core `isPaidStatus`, the
 * close answer's rule too — on-hold and custom paid statuses included), or the order reaching the
 * status the merchant explicitly configured for its gateway — `settledOrderStatus`, served
 * by the store's gateway catalog. The second is what closes a "pay by invoice" sale: BACS
 * configured to land on `pending` so the customer can still pay through the web pay link.
 * WooCommerce never calls that order paid, and the blocklist alone left the cashier on a
 * hung pay window with the order still in the cart.
 *
 * It is deliberately the merchant's stored choice and not the status alone: an async
 * gateway configured for `completed` that redirects before its provider confirms arrives
 * `pending` too, and that one must keep waiting. A store older than the catalog field
 * sends no `settledOrderStatus`, and this reduces to the blocklist it always was.
 */
export function isSettledOrderStatus(
	status: string,
	settledOrderStatus: string | null | undefined
): boolean {
	if (NEVER_SETTLED_STATUSES.includes(status)) return false;
	if (isPaidStatus(status)) return true;
	return typeof settledOrderStatus === 'string' && settledOrderStatus === status;
}

/**
 * A payable status that a stored gateway status could still settle: unpaid, but not one
 * of the statuses that never settle. The pay window keeps polling such an order while the
 * gateway catalog is still loading, so the catalog arriving later finds a poll to close it.
 */
export function awaitsStoredStatus(status: string): boolean {
	return !isPaidStatus(status) && !NEVER_SETTLED_STATUSES.includes(status);
}

/**
 * The stored status a replay judges an order against. A pay-page attempt journals the whole
 * catalog, and the entry is read for the gateway the order being judged carries — the pay page
 * can settle through another gateway than the one the sale was opened with, and the resident
 * copy can still carry the opened one until a refresh brings the store's. A contract attempt
 * journals its single gateway's status.
 */
function replayStoredStatus(
	outcome: Extract<SaleOutcome, { source: 'replay' }>,
	payload: OrderPayload
): string | null | undefined {
	if (!outcome.settledOrderStatuses)
		return outcome.settledOrderGateway === undefined ||
			outcome.settledOrderGateway === payload.payment_method
			? outcome.settledOrderStatus
			: null;
	const method = payload.payment_method;
	return typeof method === 'string' ? (outcome.settledOrderStatuses[method] ?? null) : null;
}

/**
 * A store answer at a zero balance whose order is open: the sale was reopened since (another
 * till), as a captured leg that covers the balance completes the order (`payment_complete`).
 */
function reopenedSince(
	order: OrderPaymentSummary | null | undefined,
	dp: number
): order is OrderPaymentSummary {
	return !!order?.status && !isPaidStatus(order.status) && toMinor(order.balance, dp) === 0;
}

/**
 * An online leg completes only on a paid store: neither its answer (`reopenedSince`) nor the
 * resident after the mirror may read unpaid, whether a newer adoption reopened it or the mirror
 * never landed. The refresh decides then, never the answer alone.
 */
function unpaidOnStore(order: OrderPaymentSummary | null, dp: number, payload?: OrderPayload) {
	return reopenedSince(order, dp) || residentUnpaid(payload);
}

/**
 * The resident after the mirror reads unpaid: neither paid nor the status the store settled on
 * (`settled`, a gateway's stored one). A resident with no status is unknown, not unpaid.
 */
export function residentUnpaid(payload?: { status?: string | null }, settled?: string) {
	return !!payload?.status && !isPaidStatus(payload.status) && payload.status !== settled;
}

export function isSaleComplete(outcome: SaleOutcome, dp: number, payload?: OrderPayload): boolean {
	switch (outcome.source) {
		case 'replay': // Replay trusts the resident status, never re-collects money — and a sent order
			// waits for its customer whatever status its gateway chose (on-hold included). The
			// status the attempt journaled for its gateway settles it as the pay window would;
			// with none stored this is the blocklist it always was.
			return (
				!!payload?.status &&
				isSettledOrderStatus(payload.status, replayStoredStatus(outcome, payload)) &&
				activeAwaitingCustomer(payload.meta_data) === null
			);
		case 'manual': // ADR 0032: a usable server balance wins; otherwise predict, never after a failed mirror.
			if (outcome.via === 'online' && unpaidOnStore(outcome.order, dp, payload)) return false;
			return typeof outcome.order?.balance === 'string' &&
				/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(outcome.order.balance) &&
				Number.isFinite(Number(outcome.order.balance))
				? toMinor(outcome.order.balance, dp) === 0
				: !outcome.mirrorFailed && outcome.preLegBalanceMinor - outcome.amountMinor === 0;
		case 'terminal': // The narrator uses Number, with derived local balance only when no summary exists.
			if (!outcome.row.recorded_offline && unpaidOnStore(outcome.order, dp, payload)) return false;
			return Number(outcome.order ? outcome.order.balance : outcome.balance) === 0;
		case 'gateway': // Sent is never paid: the customer still holds the link.
			return false;
		case 'gateway-settled': // The store judged the stored status reached (§3.1), and the resident agrees.
			return !residentUnpaid(payload, outcome.order.status);
		case 'gateway-contract': // The contract accepts only its exact completed state.
			return outcome.status === 'completed';
		case 'gateway-snapshot': // The blocklist, plus the status the merchant stored for the gateway.
			return isSettledOrderStatus(outcome.snapshot.status ?? '', outcome.settledOrderStatus);
		case 'zero-balance': // No payment row exists for this route.
			return true;
	}
}
export type Presentation =
	| { host: 'stage'; autoShowReceipt: boolean; canSelectReceipt?: () => boolean }
	| { host: 'modal' }
	| { host: 'background' };

/**
 * The sale leaves the till unpaid: the pane shows the sent moment in place of Paid, the
 * audit row is `checkout.sent`, the order is pulled from the store so the stamp it wrote
 * replaces the till's placeholder. The response's summary is the truth for the moment
 * shown: a `sent` whose order is still pos-open (a replay of an earlier send after a later
 * one was cancelled at another till) shows no moment and writes no row (spec §4.2).
 */
async function finishSent(
	ctx: SaleContext,
	order: EngineRecord<'orders'>,
	outcome: Extract<SaleOutcome, { source: 'gateway' }>,
	presentation: Presentation
): Promise<'sent' | 'not-completed'> {
	if (outcome.order.status === 'pos-open') return 'not-completed';
	if (presentation.host === 'stage' && presentation.autoShowReceipt) {
		if (presentation.canSelectReceipt?.() === false) enterReceipt(order.uuid, { select: false });
		else enterReceipt(order.uuid);
	}
	const latest = order.getLatest().payload;
	if (latest.id) await refreshOrderRecord(ctx.runtime, latest.id).catch(() => undefined);
	getLogger(['wcpos', 'pos', 'checkout']).info(`Sale ${order.uuid} sent to the customer`, {
		actor: ctx.actor,
		context: {
			type: 'checkout.sent',
			orderId: latest.id ?? null,
			orderUUID: order.uuid,
			orderNumber: latest.number,
			total: latest.total,
			method: outcome.stamp.method_id,
			destination: outcome.stamp.destination,
			attemptId: outcome.stamp.attempt_id,
		},
	});
	return 'sent';
}

/** Completion is a sale outcome, not a synchronization or exactly-once guarantee. */
async function finishSale(
	ctx: SaleContext,
	order: EngineRecord<'orders'>,
	outcome: SaleOutcome,
	presentation: Presentation
): Promise<ActionResult<typeof CHECKOUT_COMPLETE_EVENT>> {
	if (outcome.source === 'gateway')
		return { outcome: await finishSent(ctx, order, outcome, presentation), summary: null };
	if (!isSaleComplete(outcome, ctx.dp, order.getLatest().payload)) {
		const latest = order.getLatest().payload;
		let confirmed = false;
		if (
			latest.id &&
			((outcome.source === 'manual' &&
				outcome.order &&
				toMinor(outcome.order.balance, ctx.dp) !==
					outcome.preLegBalanceMinor - outcome.amountMinor) ||
				isSaleComplete(outcome, ctx.dp))
		) {
			// ADR 0032: the server's balance stands; the till must SHOW it to collect it.
			// Only when the store disagrees with the till (an ordinary split leg costs no request),
			// or its answer reads paid while the resident does not: the refresh decides.
			const logger = getLogger(['wcpos', 'pos', 'checkout']);
			const refreshed = refreshOrderRecord(ctx.runtime, latest.id);
			try {
				const result = await refreshed;
				confirmed = result === 'refreshed';
				if (result === 'timed-out')
					logger.debug('Post-payment order refresh timed out; keeping sale open', {
						terminal: { outcome: 'recovered', operationId: String(latest.id) },
						context: { orderId: order.uuid },
					});
			} catch (error) {
				logger.debug('Post-payment order refresh failed; keeping sale open', {
					terminal: { outcome: 'recovered', operationId: String(latest.id) },
					context: {
						orderId: order.uuid,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}
		}
		if (!isSaleComplete(outcome, ctx.dp, order.getLatest().payload))
			return {
				// The store took the money but no refresh confirmed the resident: the attempt stays
				// for the bridge, which finishes the sale once the paid order is adopted.
				outcome:
					!confirmed && isSaleComplete(outcome, ctx.dp)
						? 'unconfirmed'
						: outcome.source === 'manual' || outcome.source === 'terminal'
							? 'partial'
							: 'not-completed',
				summary: null,
			};
	}
	const payload = () =>
		outcome.source === 'gateway-snapshot' ? outcome.snapshot : order.getLatest().payload;
	let latest = payload();
	const refresh =
		outcome.source === 'manual'
			? outcome.via === 'online'
			: outcome.source === 'terminal'
				? !outcome.row.recorded_offline
				: outcome.source === 'replay'
					? !!latest.id && !outcome.refreshed
					: outcome.source === 'gateway-contract' || outcome.source === 'gateway-settled';
	if (outcome.source === 'replay' && refresh) {
		// The cached status is suspect on replay; re-judge the store's copy before any receipt.
		const refreshed = await reconcileCompletedOrder(
			ctx.runtime,
			order,
			refresh,
			ctx.stockAdjustment
		);
		if (refreshed !== 'refreshed') return { outcome: 'not-completed', summary: null };
		latest = payload();
		if (latest.status === 'cancelled' || !isSaleComplete(outcome, ctx.dp, latest))
			return { outcome: 'not-completed', summary: null };
	}
	// Enter BEFORE refresh: the paid order has left pos-open and otherwise the cashier sees an empty cart.
	if (presentation.host === 'background') enterReceipt(order.uuid, { select: false });
	if (presentation.host === 'stage' && presentation.autoShowReceipt) {
		if (presentation.canSelectReceipt?.() === false) enterReceipt(order.uuid, { select: false });
		else enterReceipt(order.uuid);
	}
	await reportProvenanceGap({
		...ctx,
		order: { id: latest.id, uuid: order.uuid, meta_data: latest.meta_data },
	});
	if (outcome.source === 'gateway-snapshot') {
		const reduced = (latest.line_items ?? []).filter((item) =>
			(item.meta_data as { key: string }[] | undefined)?.some(
				(meta) => meta.key === POS_META_KEYS.reducedStock
			)
		);
		if (ctx.stockAdjustment) ctx.stockAdjustment(reduced);
		else stockAdjustment(ctx.runtime, reduced);
	} else if (outcome.source !== 'replay' || !refresh)
		await reconcileCompletedOrder(ctx.runtime, order, refresh, ctx.stockAdjustment);
	latest = payload();
	return {
		outcome: 'completed',
		summary: {
			orderId: latest.id ?? null,
			orderUUID: order.uuid,
			orderNumber: latest.number ?? null,
			total: latest.total ?? null,
			paymentLegs: readLedger(latest.meta_data).filter(isSettledPaymentRow).length,
		},
	};
}

/** The `lastError` an unconfirmed sale's attempt carries: the store took it, no refresh agreed. */
export const UNCONFIRMED = 'unconfirmed';

export async function completeSale(
	ctx: SaleContext,
	order: EngineRecord<'orders'>,
	outcome: SaleOutcome,
	presentation: Presentation,
	queue?: OrderMutationContext
) {
	// No entry snapshot: resolve/fail unconditionally belong to the current attempt, even in replay.
	// A paid order cannot start a new completing attempt while its finish is running.
	try {
		if (outcome.source === 'manual' && !outcome.preparedCompleting) {
			// The choose-register gate cannot run retroactively; reportProvenanceGap reports missing attribution.
			if (isSaleComplete(outcome, ctx.dp))
				await recordCompletionAttempt(ctx.storeDB, {
					orderUuid: order.uuid,
					source: outcome.source,
					...(ctx.actor ? { actor: ctx.actor } : {}),
				});
		}
		const source =
			outcome.source === 'replay'
				? 'replay'
				: presentation.host === 'background'
					? 'system'
					: 'user';
		const run = (token: DispatchToken) =>
			dispatchAction({
				event: CHECKOUT_COMPLETE_EVENT,
				token,
				ctx: ctx.actionCtx,
				input: {
					orderId: order.uuid,
					actor: ctx.actionActor,
					source,
					payload: {
						source: outcome.source,
						presentation: presentation.host,
						actor: ctx.actor ?? null,
					},
				},
				bottom: () => finishSale(ctx, order, outcome, presentation),
			});
		const result = queue
			? await run(queue.dispatchToken)
			: await enqueueOrderMutation(order.uuid, (q) => run(q.dispatchToken));
		if (isActionRefusal(result))
			throw new Error(CHECKOUT_COMPLETE_EVENT + ' refused: ' + result.deny.reasonKey);
		// Audit persistence is best-effort, not at-least-once: the logger exposes no awaitable write.
		// An unconfirmed sale keeps its attempt for the bridge; a replay keeps one it did not finish.
		const kept =
			result.outcome === 'unconfirmed' ||
			(outcome.source === 'replay' && result.outcome !== 'completed');
		if (!kept) await resolveCompletionAttempt(ctx.storeDB, order.uuid);
		// Marked for the bridge, which finishes it once the pull adopts the paid order.
		else if (result.outcome === 'unconfirmed')
			await failCompletionAttempt(ctx.storeDB, order.uuid, UNCONFIRMED);
		return result.outcome;
	} catch (error) {
		try {
			await failCompletionAttempt(ctx.storeDB, order.uuid, error, {
				facts: { source: outcome.source, ...(ctx.actor ? { actor: ctx.actor } : {}) },
			});
		} finally {
			throw error;
		}
	}
}
