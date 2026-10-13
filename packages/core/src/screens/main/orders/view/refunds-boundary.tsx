import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import type { EngineRecord } from '@wcpos/query';

import { RefundsFallback, RefundsSection, RefundsSkeleton } from './sections/refunds';
import { useOrderRefunds } from './use-order-refunds';

type OrderPayload = EngineRecord<'orders'>['payload'];

/**
 * The refunds handle's OWNER, for the order modal and the orders pane alike: retains it above
 * the boundary its section suspends in, and wires that boundary's reset to the handle.
 */
export function RefundsBoundary({
	order,
	orderUuid,
	orderId,
}: {
	order: OrderPayload;
	orderUuid: string;
	orderId: number;
}) {
	const handle = useOrderRefunds(orderId);

	function RefundsErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
		return (
			<RefundsFallback
				refunds={order.refunds}
				currencySymbol={order.currency_symbol}
				onRetry={resetErrorBoundary}
			/>
		);
	}

	return (
		<ErrorBoundary
			FallbackComponent={RefundsErrorFallback}
			// The fallback's Retry restarts the failed read and asks the engine for the parent's
			// refunds afresh (a forced pull, from the handle's plan). A reset because `resetKeys`
			// moved already holds a NEW handle, whose standing pull is forced: nothing to do.
			onReset={(details) => {
				if (details.reason !== 'imperative-api') return;
				handle.retry();
				void handle.declareOnce();
			}}
			resetKeys={[handle]}
		>
			<React.Suspense fallback={<RefundsSkeleton />}>
				<RefundsSection order={order} orderUuid={orderUuid} handle={handle} />
			</React.Suspense>
		</ErrorBoundary>
	);
}
