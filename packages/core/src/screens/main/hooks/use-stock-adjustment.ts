import * as React from 'react';

import { refreshStockFor, useQueryRuntime } from '@wcpos/query';

type LineItems = Parameters<typeof refreshStockFor>[1];
type QueryRuntime = ReturnType<typeof useQueryRuntime>;

export function stockAdjustment(runtime: QueryRuntime, lineItems: LineItems): void {
	refreshStockFor(runtime.engine, lineItems);
}

export const useStockAdjustment = () => {
	const runtime = useQueryRuntime();
	return {
		stockAdjustment: React.useCallback(
			(lineItems: LineItems) => stockAdjustment(runtime, lineItems),
			[runtime]
		),
	};
};
