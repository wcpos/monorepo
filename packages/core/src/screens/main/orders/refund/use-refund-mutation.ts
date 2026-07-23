import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { RefundDestination } from '../../hooks/payment-gateway-contract';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const refundLogger = getLogger(['wcpos', 'orders', 'refund']);

interface RefundLineItem {
	id?: number;
	item_id?: number;
	quantity: number;
	refund_total?: string;
	refund_tax?: { id: number; refund_total: string }[];
}

interface BuildRefundPayloadArgs {
	amount: string;
	reason: string;
	lineItems: RefundLineItem[];
	refundDestination: RefundDestination;
}

interface RefundMutationArgs extends BuildRefundPayloadArgs {
	order: import('@wcpos/database').OrderDocument;
}

/**
 * Build the stable refund payload for the Pro contract.
 */
export function buildRefundPayload({
	amount,
	reason,
	lineItems,
	refundDestination,
}: BuildRefundPayloadArgs) {
	const payload: Record<string, unknown> = {
		amount,
		reason,
		refund_destination: refundDestination,
		api_refund: refundDestination === 'original_method',
	};

	if (lineItems.length > 0) {
		payload.line_items = lineItems.map((item) => ({
			id: item.id ?? item.item_id ?? 0,
			item_id: item.item_id ?? item.id ?? 0,
			quantity: item.quantity,
			refund_total: item.refund_total,
			refund_tax: item.refund_tax,
		}));
	}

	return payload;
}

/**
 * Build an idempotency key for a refund request.
 */
export function createRefundIdempotencyKey(orderId: number) {
	return `refund-${orderId}-${uuidv4()}`;
}

/**
 * Submit a POS refund request and refresh the order locally.
 */
export function useRefundMutation() {
	const http = useRestHttpClient();
	const manager = useQueryManager();

	return React.useCallback(
		async ({ order, amount, reason, lineItems, refundDestination }: RefundMutationArgs) => {
			if (!order.id) {
				throw new Error('refund_requires_persisted_order');
			}

			const payload = buildRefundPayload({
				amount,
				reason,
				lineItems,
				refundDestination,
			});

			const response = await http.post(`orders/${order.id}/refunds`, payload, {
				headers: {
					'X-WCPOS-Idempotency-Key': createRefundIdempotencyKey(order.id),
				},
			});

			let handle;
			try {
				handle = manager.engine.require({
					id: `refund:order-refresh:${order.id}`,
					collection: 'orders',
					kind: 'targeted-records',
					wooIds: [order.id],
					forceRefresh: true,
				});
				await handle.ready;
			} catch (error) {
				// The refund POST already succeeded — money has moved. A failed local
				// refresh must never reject the mutation: the error toast would invite
				// the cashier to retry, and each retry mints a fresh idempotency key,
				// so a retry POSTs a SECOND refund. Log it; the local order heals on
				// the next sync pass.
				refundLogger.warn('Refund succeeded but the local order refresh failed', {
					saveToDb: true,
					context: {
						orderId: order.id,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			} finally {
				handle?.release();
			}

			return response?.data;
		},
		[http, manager]
	);
}
