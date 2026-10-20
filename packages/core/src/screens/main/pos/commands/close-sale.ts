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
import { isDefinitiveMoneyRefusal, MONEY_ANSWER_CODES, moneyRefusalOf } from '@wcpos/sync-core';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { useSaleContext } from '../checkout/hooks/use-sale-context';
import { commandProvenance } from '../checkout/provenance/command-provenance';

import type { SaleContext } from '../checkout/sale-completion';

export type CloseOutcome =
	| {
			kind: 'completed';
			order: OrderPaymentSummary | null;
			completion: { n: number; id: string } | null;
	  }
	| { kind: 'outstanding'; order: OrderPaymentSummary | null }
	| { kind: 'refused'; code: string; message: string }
	| { kind: 'order_changed' }
	| { kind: 'offline' }; // PR B: { kind: 'queued' }

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
		const answer = data as { order?: OrderPaymentSummary; completion?: { n: number; id: string } };
		await post.mirror({ order: answer.order });
		return {
			kind: 'completed',
			order: answer.order ?? null,
			completion: answer.completion ?? null,
		};
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
		// rule): the cashier reads its sentence. Anything else stays journaled for a re-send.
		if (refusal?.code && isDefinitiveMoneyRefusal(refusal))
			return { kind: 'refused', code: refusal.code, message: refusal.message ?? refusal.code };
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
