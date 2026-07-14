import * as React from 'react';

import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

type LineItems = import('@wcpos/database').OrderDocument['line_items'];

const stockLogger = getLogger(['wcpos', 'stock-adjustment']);

export const useStockAdjustment = () => {
	const manager = useQueryManager();

	const stockAdjustment = React.useCallback(
		(lineItems: LineItems) => {
			if (!Array.isArray(lineItems) || lineItems.length === 0) return;
			const requests = [
				{
					collection: 'products' as const,
					wooIds: lineItems
						.filter((item) => item.variation_id === 0)
						.map((item) => item.product_id)
						.filter((id): id is number => id != null),
				},
				{
					collection: 'variations' as const,
					wooIds: lineItems
						.filter((item) => item.variation_id !== 0)
						.map((item) => item.variation_id)
						.filter((id): id is number => id != null),
				},
			];

			for (const request of requests) {
				if (request.wooIds.length === 0) continue;
				const handle = manager.engine.require({
					id: `stock-adjustment:${request.collection}:${request.wooIds.join(',')}`,
					collection: request.collection,
					kind: 'targeted-records',
					wooIds: request.wooIds,
					forceRefresh: true,
				});
				void handle.ready.then(
					() => handle.release(),
					(error) => {
						handle.release();
						stockLogger.error('Stock refresh failed', {
							context: {
								collection: request.collection,
								error: error instanceof Error ? error.message : String(error),
							},
						});
					}
				);
			}
		},
		[manager]
	);

	return { stockAdjustment };
};
