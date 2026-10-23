import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	type CommandProvenance,
	type EngineRecord,
	MoneyCommandError,
	moneyCommandPoster,
	type OrderApproval,
	type Post,
	type ProvenanceCommand,
} from '@wcpos/query';
import type { StoreLocalDatabase } from '@wcpos/query/store-local';
import type { OrderPaymentSummary } from '@wcpos/order-math';
import {
	isCloseAnswer,
	isDefinitiveMoneyRefusal,
	isPaidStatus,
	MONEY_ANSWER_CODES,
	moneyRefusalOf,
} from '@wcpos/sync-core';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { releaseUnconfirmedReceipt } from '../checkout/checkout-mode';
import { useSaleContext } from '../checkout/hooks/use-sale-context';
import { commandProvenance } from '../checkout/provenance/command-provenance';
import { refreshOrderRecord, residentUnpaid, type SaleContext } from '../checkout/sale-completion';

export type CloseOutcome =
	| {
			kind: 'completed';
			order: OrderPaymentSummary | null;
			completion: { n: number; id: string } | null;
	  }
	| { kind: 'outstanding'; order: OrderPaymentSummary | null }
	/** Closed on the store, but the resident after the mirror reads a reopen adopted since. */
	| { kind: 'reopened'; order: OrderPaymentSummary }
	/** Closed on the store, but no refresh has confirmed the resident: the attempt stays. */
	| { kind: 'unconfirmed'; order: OrderPaymentSummary }
	| { kind: 'refused'; code: string; message: string }
	| { kind: 'order_changed' }
	| { kind: 'offline' }; // PR B: { kind: 'queued' }

/**
 * A mirrored close answer finishes the sale only when the answer and the resident after the
 * mirror both read paid. A paid answer the resident does not show means the revision-guarded
 * mirror kept a newer adoption, or the poster's refresh failed: only a refresh that lands tells a
 * reopen from a lag, and without one the close is unconfirmed (Codex 4341491589 on #2798). The
 * first answer and Try again's replay both decide here (Codex 4341491563 on #2798).
 */
export async function closeConfirmed(
	runtime: SaleContext['runtime'],
	order: EngineRecord<'orders'>,
	summary: OrderPaymentSummary
): Promise<'completed' | 'reopened' | 'unconfirmed'> {
	if (!isPaidStatus(summary.status)) return 'reopened';
	if (!residentUnpaid(order.getLatest().payload)) return 'completed';
	// A close was sent, so the store has the order: it has an id.
	const refreshed = await Promise.resolve()
		.then(() => refreshOrderRecord(runtime, Number(order.getLatest().payload.id)))
		.catch(() => 'failed' as const);
	if (refreshed !== 'refreshed') return 'unconfirmed';
	return residentUnpaid(order.getLatest().payload) ? 'reopened' : 'completed';
}

/**
 * Complete a covered sale through `POST orders/{id}/close` (ADR 0040 D2): the till never writes
 * `completed` itself. Journaled and approved like a charge, so a lost answer re-sends the same
 * close and a changed total is re-approved before it completes.
 */
export async function closeSale(
	runtime: SaleContext['runtime'],
	storeDB: StoreLocalDatabase,
	order: EngineRecord<'orders'>,
	deps: {
		post: Post;
		/** Absent (the boundary's own decision): the order as it stands once its lines are written. */
		approval?: OrderApproval;
		provenance: (command: ProvenanceCommand) => Promise<CommandProvenance | null>;
	}
): Promise<CloseOutcome> {
	// Connectivity is the caller's (`writeZeroBalanceCompletion` refuses offline before any
	// write); an order the store has never seen has nothing to close yet.
	const id = order.getLatest().payload.id;
	if (!id) return { kind: 'offline' };
	const post = moneyCommandPoster({ runtime, storeDB, orderUuid: order.uuid, ...deps });
	try {
		const { data } = await post(`orders/${id}/close`, {});
		// Only the store's own summary and completion say the sale closed (sync-core
		// `isCloseAnswer`, the poster's rule too). A 2xx without them (a proxy page, a plugin
		// filter) proves nothing: the entry stays journaled for a re-send.
		if (!isCloseAnswer(data)) throw new Error('close_malformed_response');
		const summary = data.order as unknown as OrderPaymentSummary;
		await post.mirror({ order: summary });
		const closed = await closeConfirmed(runtime, order, summary);
		if (closed !== 'completed') {
			releaseUnconfirmedReceipt(order.uuid);
			return { kind: closed, order: summary };
		}
		return { kind: 'completed', order: summary, completion: data.completion };
	} catch (error) {
		if (error instanceof MoneyCommandError && error.reason === 'order_changed')
			return { kind: 'order_changed' };
		const refusal = moneyRefusalOf(error);
		if (refusal?.code === MONEY_ANSWER_CODES.balanceOutstanding) {
			const summary = refusal.data?.order as OrderPaymentSummary | undefined;
			await post.mirror({ order: summary });
			return { kind: 'outstanding', order: summary ?? null };
		}
		// Any other named 4xx is the server's decision on this sale (sync-core's money answer
		// rule): the cashier reads its sentence, and the resident is refreshed, since the refusal
		// says the till's view of the sale is stale. Anything else stays journaled for a re-send.
		if (refusal?.code && isDefinitiveMoneyRefusal(refusal)) {
			await post.settle();
			return { kind: 'refused', code: refusal.code, message: refusal.message ?? refusal.code };
		}
		throw error;
	}
}

/**
 * The till's close: REST client and provenance for the sale's session, plus live connectivity
 * for the boundary's `writeZeroBalanceCompletion`, which refuses offline before any write.
 */
export function useCloseSale() {
	const http = useRestHttpClient();
	const ctx = useSaleContext();
	const online = useOnlineStatus().status === 'online-website-available';
	const onlineRef = React.useRef(online);
	React.useLayoutEffect(() => {
		onlineRef.current = online;
	}, [online]);
	const close = React.useCallback(
		(
			order: EngineRecord<'orders'>,
			options: { sessionId: string | null; approval?: OrderApproval }
		) =>
			closeSale(ctx.runtime, ctx.storeDB, order, {
				post: (url, body) => http.post(url, body),
				approval: options.approval,
				provenance: (command) => commandProvenance(ctx, order, options.sessionId, command),
			}),
		[ctx, http]
	);
	return React.useMemo(() => ({ close, online: () => onlineRef.current }), [close]);
}
