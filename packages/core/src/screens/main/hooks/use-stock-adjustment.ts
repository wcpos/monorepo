import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

type LineItems = import('@wcpos/database').OrderDocument['line_items'];

const stockLogger = getLogger(['wcpos', 'stock-adjustment']);

export const useStockAdjustment = () => {
	const runtime = useQueryRuntime();

	const stockAdjustment = React.useCallback(
		(lineItems: LineItems) => {
			if (!Array.isArray(lineItems) || lineItems.length === 0) return;
			const requests = [
				{
					collection: 'products' as const,
					remoteIds: lineItems
						.filter((item) => item.variation_id === 0)
						.map((item) => item.product_id)
						.map(remoteIdOrNull)
						.filter((remoteId) => remoteId !== null),
				},
				{
					collection: 'variations' as const,
					remoteIds: lineItems
						.filter((item) => item.variation_id !== 0)
						.map((item) => item.variation_id)
						.map(remoteIdOrNull)
						.filter((remoteId) => remoteId !== null),
				},
			];

			for (const request of requests) {
				if (request.remoteIds.length === 0) continue;
				const handle = runtime.engine.require({
					id: `stock-adjustment:${request.collection}:${request.remoteIds.join(',')}`,
					collection: request.collection,
					kind: 'targeted-records',
					remoteIds: request.remoteIds,
					forceRefresh: true,
				});
				void handle.ready.then(
					() => handle.release(),
					(error) => {
						handle.release();
						stockLogger.error('Stock refresh failed', {
							code: ERROR_CODES.PRODUCT_UNEXPECTED,
							context: {
								collection: request.collection,
								error: getErrorMessage(error),
							},
						});
					}
				);
			}
		},
		[runtime]
	);

	return { stockAdjustment };
};
