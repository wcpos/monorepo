import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import {
	type CommandProvenance,
	type EngineRecord,
	MoneyCommandError,
	moneyCommandPoster,
	type OrderApproval,
	type Post,
} from '@wcpos/query';
import { mirrorServerOrder } from '@wcpos/query/mutations';
import type { StoreLocalDatabase } from '@wcpos/query/store-local';
import type { OrderPaymentSummary } from '@wcpos/order-math';

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

/** Refusals that name this sale: the server decided, and the cashier reads its sentence. */
const REFUSED = new Set([
	'wcpos_payment_in_flight',
	'wcpos_insufficient_stock',
	'wcpos_invalid_transition',
]);

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
		approval: OrderApproval;
		provenance: () => Promise<CommandProvenance | null>;
		online: boolean;
	}
): Promise<CloseOutcome> {
	const id = order.getLatest().payload.id;
	if (!deps.online || !id) return { kind: 'offline' };
	const post = moneyCommandPoster({ runtime, storeDB, orderUuid: order.uuid, ...deps });
	const mirror = async (summary: OrderPaymentSummary | null | undefined) => {
		await mirrorServerOrder(runtime, order.uuid, {
			order: summary,
			sentRevision: post.sentRevision(),
		});
		await post.settle();
	};
	try {
		const { data } = await post(`orders/${id}/close`, {});
		const answer = data as { order?: OrderPaymentSummary; completion?: { n: number; id: string } };
		await mirror(answer.order);
		return {
			kind: 'completed',
			order: answer.order ?? null,
			completion: answer.completion ?? null,
		};
	} catch (error) {
		if (error instanceof MoneyCommandError && error.reason === 'order_changed')
			return { kind: 'order_changed' };
		const body = (
			error as {
				response?: {
					data?: { code?: string; message?: string; data?: { order?: OrderPaymentSummary } };
				};
			}
		)?.response?.data;
		if (body?.code === 'wcpos_balance_outstanding') {
			await mirror(body.data?.order);
			return { kind: 'outstanding', order: body.data?.order ?? null };
		}
		if (body?.code && REFUSED.has(body.code))
			return { kind: 'refused', code: body.code, message: body.message ?? body.code };
		throw error;
	}
}

/** The till's close: REST client, live connectivity and provenance for the sale's session. */
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
			options: { sessionId: string | null; approval?: OrderApproval; queuedOffline?: boolean }
		) => {
			const payload = order.getLatest().payload;
			return closeSale(ctx.runtime, ctx.storeDB, order, {
				post: (url, body) => http.post(url, body),
				// The boundary's own decision is the order as it stands once its lines are written.
				approval: options.approval ?? {
					total: String(payload.total ?? ''),
					currency: payload.currency ?? '',
				},
				provenance: () => commandProvenance(ctx, order, options.sessionId),
				online: onlineRef.current && !options.queuedOffline,
			});
		},
		[ctx, http]
	);
	return React.useMemo(() => ({ close, online: () => onlineRef.current }), [close]);
}
