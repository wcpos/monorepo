import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { getLogger } from '@wcpos/utils/logger';

import { usePullDocument } from '../../contexts/use-pull-document';
import { RefundDestination } from '../../hooks/payment-gateway-contract';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const refundMutationLogger = getLogger(['wcpos', 'mutations', 'refund']);

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
	const pullDocument = usePullDocument();

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

			try {
				await pullDocument(order.id, order.collection as never);
			} catch (error) {
				refundMutationLogger.error('refund_refresh_failed', {
					showToast: false,
					saveToDb: true,
					context: {
						orderId: order.id,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}

			return response?.data;
		},
		[http, pullDocument]
	);
}
